import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Quellen-Scraper (Phase 1: BRAK Amtliches Anwaltsverzeichnis)
 *
 * Strategie: Firecrawl Web-Search auf das BRAK-Register + Kanzleiwebsites,
 * Markdown der Trefferseiten extrahieren, E-Mails per Regex herausziehen,
 * als Leads (Zielgruppe = "anwaelte", Fachgebiet = z.B. "Sozialrecht") in
 * die bestehende leads-Tabelle einfügen.
 */

export const BRAK_FACHGEBIETE = [
  "Sozialrecht",
  "Medizinrecht",
  "Versicherungsrecht",
  "Verkehrsrecht",
  "Arbeitsrecht",
  "Strafrecht",
  "Familienrecht",
  "Erbrecht",
  "Mietrecht",
  "Steuerrecht",
] as const;
export type BrakFachgebiet = (typeof BRAK_FACHGEBIETE)[number];

const ScrapeBrakInput = z.object({
  fachgebiet: z.enum(BRAK_FACHGEBIETE),
  ort: z.string().min(2).max(120),
  limit: z.number().int().min(1).max(30).optional().default(10),
});

interface FirecrawlSearchResult {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
  html?: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+49|0)[\s\-/()]?\d[\d\s\-/()]{6,}\d/;
const BLOCK_EMAIL_DOMAINS = new Set([
  "sentry.io",
  "wixpress.com",
  "example.com",
  "domain.de",
  "ihre-domain.de",
  "musterkanzlei.de",
]);

function extractEmail(text: string | undefined): string | null {
  if (!text) return null;
  const matches = text.match(EMAIL_RE);
  if (!matches) return null;
  for (const raw of matches) {
    const e = raw.toLowerCase().replace(/\.$/, "");
    const domain = e.split("@")[1];
    if (!domain) continue;
    if (BLOCK_EMAIL_DOMAINS.has(domain)) continue;
    if (/(png|jpg|jpeg|gif|svg|webp)$/i.test(e)) continue;
    return e;
  }
  return null;
}

function extractPhone(text: string | undefined): string | null {
  if (!text) return null;
  const m = text.match(PHONE_RE);
  return m ? m[0].trim().slice(0, 60) : null;
}

function extractName(text: string | undefined, fachgebiet: string): string | null {
  if (!text) return null;
  // Häufige Muster: "Rechtsanwalt Max Mustermann", "Kanzlei Müller & Partner"
  const m =
    text.match(/Rechtsanw[aä]lt(?:in)?\s+([A-ZÄÖÜ][\wÄÖÜäöüß.-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß.-]+){0,3})/) ||
    text.match(/Fachanwalt(?:in)?\s+für\s+[A-Za-zÄÖÜäöüß ]+\s+([A-ZÄÖÜ][\wÄÖÜäöüß.-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß.-]+){0,3})/);
  if (m) return m[1].trim().slice(0, 200);
  void fachgebiet;
  return null;
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: { web?: FirecrawlSearchResult[] } | FirecrawlSearchResult[];
  web?: FirecrawlSearchResult[];
  results?: { web?: FirecrawlSearchResult[] };
}

function normalizeWebResults(json: FirecrawlSearchResponse): FirecrawlSearchResult[] {
  if (Array.isArray(json.data)) return json.data;
  if (json.data && typeof json.data === "object" && "web" in json.data && json.data.web) return json.data.web;
  if (json.web) return json.web;
  if (json.results?.web) return json.results.web;
  return [];
}

export const scrapeBrak = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ScrapeBrakInput.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      error?: string;
      found: number;
      inserted: number;
      skipped: number;
      preview: Array<{ email: string; name: string | null; website: string | null }>;
    }> => {
      const apiKey = process.env.FIRECRAWL_API_KEY;
      if (!apiKey) {
        return {
          ok: false,
          error: "FIRECRAWL_API_KEY ist nicht konfiguriert.",
          found: 0,
          inserted: 0,
          skipped: 0,
          preview: [],
        };
      }

      // Zwei Suchen kombinieren: BRAK-Register + Kanzleiwebsites mit Impressum
      const queries = [
        `Fachanwalt für ${data.fachgebiet} ${data.ort} Kanzlei E-Mail Impressum`,
        `"Fachanwalt für ${data.fachgebiet}" ${data.ort} site:rechtsanwaltsregister.org`,
      ];

      const allResults: FirecrawlSearchResult[] = [];
      for (const query of queries) {
        try {
          const res = await fetch("https://api.firecrawl.dev/v2/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              query,
              limit: Math.min(data.limit, 15),
              lang: "de",
              country: "de",
              scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
            }),
          });
          if (!res.ok) continue;
          const json = (await res.json()) as FirecrawlSearchResponse;
          allResults.push(...normalizeWebResults(json));
        } catch {
          // continue mit nächster Query
        }
      }

      // Dedupe nach URL
      const seenUrl = new Set<string>();
      const uniqueResults = allResults.filter((r) => {
        const u = (r.url ?? "").toLowerCase();
        if (!u || seenUrl.has(u)) return false;
        seenUrl.add(u);
        return true;
      });

      // Lead-Kandidaten bauen
      type Cand = {
        email: string;
        name: string | null;
        telefon: string | null;
        website: string | null;
        quelle_url: string;
      };
      const candidates = new Map<string, Cand>();
      for (const r of uniqueResults) {
        const text = `${r.title ?? ""}\n${r.description ?? ""}\n${r.markdown ?? ""}`;
        const email = extractEmail(text);
        if (!email) continue;
        if (candidates.has(email)) continue;
        const websiteOrigin = (() => {
          try {
            return r.url ? new URL(r.url).origin : null;
          } catch {
            return null;
          }
        })();
        candidates.set(email, {
          email,
          name: extractName(text, data.fachgebiet),
          telefon: extractPhone(text),
          website: websiteOrigin,
          quelle_url: r.url ?? "",
        });
      }

      const leadsToInsert = Array.from(candidates.values()).map((c) => ({
        land: "DE" as const,
        email: c.email,
        fachgebiet: data.fachgebiet,
        zielgruppe: "anwaelte",
        name: c.name,
        telefon: c.telefon,
        website: c.website,
        stadt: data.ort,
        quelle_url: c.quelle_url.slice(0, 800),
        quelle_typ: "brak",
        gerichtsgutachter: false,
      }));

      if (leadsToInsert.length === 0) {
        return { ok: true, found: 0, inserted: 0, skipped: 0, preview: [] };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { scoreLead } = await import("@/lib/scoring");
      const rows = leadsToInsert.map((l) => {
        const s = scoreLead(l);
        return {
          ...l,
          email: l.email.toLowerCase(),
          status: "neu" as const,
          qualitaet_score: s.score,
          qualitaets_merkmale: s.merkmale,
        };
      });

      const { data: inserted, error } = await supabaseAdmin
        .from("leads")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(rows as any, { onConflict: "land,email", ignoreDuplicates: true })
        .select("id");

      if (error) {
        return {
          ok: false,
          error: error.message,
          found: leadsToInsert.length,
          inserted: 0,
          skipped: 0,
          preview: [],
        };
      }

      const insertedCount = inserted?.length ?? 0;
      return {
        ok: true,
        found: leadsToInsert.length,
        inserted: insertedCount,
        skipped: leadsToInsert.length - insertedCount,
        preview: leadsToInsert.slice(0, 5).map((l) => ({
          email: l.email,
          name: l.name,
          website: l.website,
        })),
      };
    },
  );
