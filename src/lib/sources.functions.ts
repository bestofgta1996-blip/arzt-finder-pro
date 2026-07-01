import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Quellen-Scraper (Phase 1: BRAK Amtliches Anwaltsverzeichnis + DSB-Gesundheitswesen)
 *
 * Strategie: Firecrawl Web-Search auf offizielle Register + Kanzlei-/Praxis-Websites,
 * Markdown der Trefferseiten extrahieren, E-Mails per Regex herausziehen,
 * als Leads in die bestehende leads-Tabelle einfügen (mit Modus-Kennzeichnung).
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

export const DSB_ZIELGRUPPEN = [
  "Arztpraxen & MVZ",
  "Kliniken & Reha",
  "Zahnärzte",
  "Physiotherapie",
  "Heilpraktiker",
  "Apotheken",
  "Pflegedienste",
  "Labore",
] as const;
export type DsbZielgruppe = (typeof DSB_ZIELGRUPPEN)[number];

const APP_MODES = ["gutachten", "dsb"] as const;
const ModeSchema = z.enum(APP_MODES).optional().default("gutachten");

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
      const logSearch = async (result: {
        ok: boolean;
        error?: string;
        found: number;
        inserted: number;
        skipped: number;
      }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("source_searches").insert({
            quelle: "brak",
            fachgebiet: data.fachgebiet,
            ort: data.ort,
            land: "DE",
            mode: "gutachten",
            params: { limit: data.limit },
            found: result.found,
            inserted: result.inserted,
            skipped: result.skipped,
            ok: result.ok,
            error: result.error ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        } catch {
          // logging soll nie den Hauptlauf blockieren
        }
      };

      const apiKey = process.env.FIRECRAWL_API_KEY;
      if (!apiKey) {
        const r = {
          ok: false,
          error: "FIRECRAWL_API_KEY ist nicht konfiguriert.",
          found: 0,
          inserted: 0,
          skipped: 0,
          preview: [],
        };
        await logSearch(r);
        return r;
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
        mode: "gutachten" as const,
      }));

      if (leadsToInsert.length === 0) {
        const r = { ok: true, found: 0, inserted: 0, skipped: 0, preview: [] };
        await logSearch(r);
        return r;
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
        const r = {
          ok: false,
          error: error.message,
          found: leadsToInsert.length,
          inserted: 0,
          skipped: 0,
          preview: [],
        };
        await logSearch(r);
        return r;
      }

      const insertedCount = inserted?.length ?? 0;
      const result = {
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
      await logSearch(result);
      return result;
    },
  );

// ---- Suchverlauf --------------------------------------------------

export interface DbSourceSearch {
  id: string;
  quelle: string;
  fachgebiet: string;
  ort: string | null;
  land: string;
  params: Record<string, string | number | boolean | null>;
  found: number;
  inserted: number;
  skipped: number;
  ok: boolean;
  error: string | null;
  erstellt_am: string;
}

export const listSourceSearches = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ mode: ModeSchema }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; items: DbSourceSearch[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("source_searches")
      .select("*")
      .eq("mode", data.mode)
      .order("erstellt_am", { ascending: false })
      .limit(100);
    if (error) return { ok: false, error: error.message, items: [] };
    return { ok: true, items: (rows ?? []) as unknown as DbSourceSearch[] };
  });

export const deleteSourceSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("source_searches").delete().eq("id", data.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  });

// ---- DSB-Recherche im Gesundheitswesen ----------------------------

const DSB_QUERY_HINTS: Record<DsbZielgruppe, string[]> = {
  "Arztpraxen & MVZ": ["Arztpraxis", "MVZ", "Hausarzt", "Facharzt"],
  "Kliniken & Reha": ["Krankenhaus", "Klinik", "Reha-Klinik", "Tagesklinik"],
  "Zahnärzte": ["Zahnarzt", "Zahnarztpraxis", "Kieferorthopäde"],
  "Physiotherapie": ["Physiotherapie", "Physiotherapiepraxis"],
  "Heilpraktiker": ["Heilpraktiker", "Heilpraktikerpraxis"],
  "Apotheken": ["Apotheke"],
  "Pflegedienste": ["Pflegedienst", "ambulante Pflege", "Seniorenheim"],
  "Labore": ["medizinisches Labor", "Diagnostik Labor"],
};

const ScrapeDsbInput = z.object({
  zielgruppe: z.enum(DSB_ZIELGRUPPEN),
  ort: z.string().min(2).max(120),
  limit: z.number().int().min(1).max(30).optional().default(10),
});

export const scrapeDsbHealthcare = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ScrapeDsbInput.parse(d))
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
      const logSearch = async (result: {
        ok: boolean;
        error?: string;
        found: number;
        inserted: number;
        skipped: number;
      }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("source_searches").insert({
            quelle: "dsb_healthcare",
            fachgebiet: data.zielgruppe,
            ort: data.ort,
            land: "DE",
            mode: "dsb",
            params: { limit: data.limit },
            found: result.found,
            inserted: result.inserted,
            skipped: result.skipped,
            ok: result.ok,
            error: result.error ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        } catch {
          /* logging never blocks main run */
        }
      };

      const apiKey = process.env.FIRECRAWL_API_KEY;
      if (!apiKey) {
        const r = { ok: false, error: "FIRECRAWL_API_KEY ist nicht konfiguriert.", found: 0, inserted: 0, skipped: 0, preview: [] };
        await logSearch(r);
        return r;
      }

      const hints = DSB_QUERY_HINTS[data.zielgruppe];
      const queries = hints.slice(0, 3).map(
        (h) => `${h} ${data.ort} E-Mail Impressum Datenschutzbeauftragter`,
      );

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
          /* continue with next query */
        }
      }

      // Dedupe by URL
      const seenUrl = new Set<string>();
      const uniqueResults = allResults.filter((r) => {
        const u = (r.url ?? "").toLowerCase();
        if (!u || seenUrl.has(u)) return false;
        seenUrl.add(u);
        return true;
      });

      type Cand = { email: string; name: string | null; telefon: string | null; website: string | null; quelle_url: string };
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
        // Name-Heuristik: der Titel der Trefferseite ist oft der Name der Praxis/Einrichtung
        const name = (r.title ?? "").trim().slice(0, 200) || null;
        candidates.set(email, {
          email,
          name,
          telefon: extractPhone(text),
          website: websiteOrigin,
          quelle_url: r.url ?? "",
        });
      }

      const leadsToInsert = Array.from(candidates.values()).map((c) => ({
        land: "DE" as const,
        email: c.email,
        fachgebiet: data.zielgruppe,
        zielgruppe: "gesundheitswesen",
        name: c.name,
        telefon: c.telefon,
        website: c.website,
        stadt: data.ort,
        quelle_url: c.quelle_url.slice(0, 800),
        quelle_typ: "dsb_healthcare",
        gerichtsgutachter: false,
        mode: "dsb" as const,
      }));

      if (leadsToInsert.length === 0) {
        const r = { ok: true, found: 0, inserted: 0, skipped: 0, preview: [] };
        await logSearch(r);
        return r;
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
        const r = { ok: false, error: error.message, found: leadsToInsert.length, inserted: 0, skipped: 0, preview: [] };
        await logSearch(r);
        return r;
      }

      const insertedCount = inserted?.length ?? 0;
      const result = {
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
      await logSearch(result);
      return result;
    },
  );


// ---- Google Maps DSB-Recherche (PLZ + Radius) ---------------------

const GMAPS_QUERY_HINTS: Record<DsbZielgruppe, string[]> = {
  "Arztpraxen & MVZ": ["Arztpraxis", "MVZ Medizinisches Versorgungszentrum"],
  "Kliniken & Reha": ["Krankenhaus Klinik", "Reha-Klinik"],
  "Zahnärzte": ["Zahnarzt Zahnarztpraxis"],
  "Physiotherapie": ["Physiotherapie Praxis"],
  "Heilpraktiker": ["Heilpraktiker Praxis"],
  "Apotheken": ["Apotheke"],
  "Pflegedienste": ["Ambulanter Pflegedienst", "Seniorenheim Pflegeheim"],
  "Labore": ["Medizinisches Labor Diagnostik"],
};

const ScrapeGmapsInput = z.object({
  zielgruppe: z.enum(DSB_ZIELGRUPPEN),
  plz: z.string().trim().regex(/^\d{4,5}$/, "PLZ muss 4–5 Ziffern haben"),
  radiusKm: z.number().int().min(1).max(50).optional().default(10),
  limit: z.number().int().min(1).max(30).optional().default(15),
});

interface GmapsPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
}

const GMAPS_GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

async function geocodePlz(plz: string, apiKey: string, lovableKey: string): Promise<{ lat: number; lng: number; stadt: string | null } | null> {
  const url = `${GMAPS_GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(plz + ", Germany")}&region=de&language=de`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    results?: Array<{
      geometry?: { location?: { lat: number; lng: number } };
      address_components?: Array<{ long_name: string; types: string[] }>;
    }>;
  };
  const first = json.results?.[0];
  const loc = first?.geometry?.location;
  if (!loc) return null;
  const cityComp = first?.address_components?.find(
    (c) => c.types.includes("locality") || c.types.includes("postal_town"),
  );
  return { lat: loc.lat, lng: loc.lng, stadt: cityComp?.long_name ?? null };
}

async function searchPlaces(
  query: string,
  center: { lat: number; lng: number },
  radiusMeters: number,
  pageSize: number,
  apiKey: string,
  lovableKey: string,
): Promise<GmapsPlace[]> {
  const res = await fetch(`${GMAPS_GATEWAY}/places/v1/places:searchText`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "de",
      regionCode: "DE",
      pageSize,
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      },
    }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { places?: GmapsPlace[] };
  return json.places ?? [];
}

function deobfuscateEmails(text: string): string {
  return text
    .replace(/\s*\[\s*at\s*\]\s*/gi, "@")
    .replace(/\s*\(\s*at\s*\)\s*/gi, "@")
    .replace(/\s+@\s+/g, "@")
    .replace(/\s*\[\s*dot\s*\]\s*/gi, ".")
    .replace(/\s*\(\s*dot\s*\)\s*/gi, ".")
    .replace(/\s*&#64;\s*/gi, "@");
}

async function scrapeEmailFromWebsite(
  website: string,
  firecrawlKey: string,
): Promise<{ email: string | null; reason: "ok" | "no_url" | "no_email" | "scrape_failed" }> {
  const origin = (() => {
    try {
      return new URL(website).origin;
    } catch {
      return null;
    }
  })();
  if (!origin) return { email: null, reason: "no_url" };
  const urls = [
    origin,
    `${origin}/impressum`,
    `${origin}/impressum.html`,
    `${origin}/kontakt`,
    `${origin}/kontakt.html`,
    `${origin}/datenschutz`,
  ];
  let anyScraped = false;
  for (const url of urls) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firecrawlKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ["markdown", "html"],
          onlyMainContent: false,
          timeout: 15000,
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        success?: boolean;
        data?: { markdown?: string; html?: string };
      };
      const md = json.data?.markdown ?? "";
      const html = json.data?.html ?? "";
      if (!md && !html) continue;
      anyScraped = true;

      // 1. Direkt aus mailto: (verlässlichste Quelle)
      const mailto = html.match(/mailto:([^"'?\s<>]+)/i);
      if (mailto) {
        const e = extractEmail(mailto[1]);
        if (e) return { email: e, reason: "ok" };
      }

      // 2. Aus deobfuscated Markdown + HTML
      const combined = deobfuscateEmails(`${md}\n${html}`);
      const email = extractEmail(combined);
      if (email) return { email, reason: "ok" };
    } catch {
      /* try next */
    }
  }
  return { email: null, reason: anyScraped ? "no_email" : "scrape_failed" };
}


export const scrapeGoogleMapsHealthcare = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ScrapeGmapsInput.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      error?: string;
      found: number;
      inserted: number;
      skipped: number;
      places: number;
      preview: Array<{ email: string; name: string | null; website: string | null }>;
    }> => {
      const logSearch = async (result: { ok: boolean; error?: string; found: number; inserted: number; skipped: number }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("source_searches").insert({
            quelle: "google_maps",
            fachgebiet: data.zielgruppe,
            ort: data.plz,
            land: "DE",
            mode: "dsb",
            params: { radiusKm: data.radiusKm, limit: data.limit },
            found: result.found,
            inserted: result.inserted,
            skipped: result.skipped,
            ok: result.ok,
            error: result.error ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        } catch {
          /* ignore */
        }
      };

      const lovableKey = process.env.LOVABLE_API_KEY;
      const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
      const firecrawlKey = process.env.FIRECRAWL_API_KEY;
      if (!lovableKey || !gmapsKey) {
        const r = { ok: false, error: "Google Maps Connector nicht konfiguriert.", found: 0, inserted: 0, skipped: 0, places: 0, preview: [] };
        await logSearch(r);
        return r;
      }
      if (!firecrawlKey) {
        const r = { ok: false, error: "FIRECRAWL_API_KEY fehlt (wird für E-Mail-Extraktion aus Websites benötigt).", found: 0, inserted: 0, skipped: 0, places: 0, preview: [] };
        await logSearch(r);
        return r;
      }

      // 1. PLZ geocodieren
      const geo = await geocodePlz(data.plz, gmapsKey, lovableKey);
      if (!geo) {
        const r = { ok: false, error: `PLZ ${data.plz} konnte nicht geocodiert werden.`, found: 0, inserted: 0, skipped: 0, places: 0, preview: [] };
        await logSearch(r);
        return r;
      }

      // 2. Places suchen (mehrere Query-Hints, dedupe by place.id)
      const hints = GMAPS_QUERY_HINTS[data.zielgruppe];
      const radiusMeters = Math.min(data.radiusKm * 1000, 50000);
      const placesById = new Map<string, GmapsPlace>();
      for (const hint of hints) {
        const results = await searchPlaces(hint, geo, radiusMeters, Math.min(data.limit + 5, 20), gmapsKey, lovableKey);
        for (const p of results) {
          if (!p.id || placesById.has(p.id)) continue;
          placesById.set(p.id, p);
        }
      }
      const places = Array.from(placesById.values()).slice(0, data.limit);

      // 3. Für jeden Ort mit Website: E-Mail extrahieren
      type Cand = {
        email: string;
        name: string | null;
        telefon: string | null;
        website: string | null;
        stadt: string | null;
        quelle_url: string;
      };
      const candidates: Cand[] = [];
      let noWebsite = 0;
      let scrapeFailed = 0;
      let noEmail = 0;
      for (const p of places) {
        if (!p.websiteUri) { noWebsite++; continue; }
        const { email, reason } = await scrapeEmailFromWebsite(p.websiteUri, firecrawlKey);
        if (!email) {
          if (reason === "scrape_failed") scrapeFailed++;
          else if (reason === "no_email") noEmail++;
          continue;
        }
        // Stadt aus formattedAddress schätzen (letzter Teil vor "Deutschland")
        let stadt: string | null = geo.stadt;
        if (p.formattedAddress) {
          const parts = p.formattedAddress.split(",").map((s) => s.trim());
          const cityPart = parts.length >= 2 ? parts[parts.length - 2] : null;
          if (cityPart) {
            const m = cityPart.match(/\d{4,5}\s+(.+)/);
            stadt = (m ? m[1] : cityPart).slice(0, 120);
          }
        }
        candidates.push({
          email: email.toLowerCase(),
          name: p.displayName?.text ?? null,
          telefon: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
          website: (() => { try { return new URL(p.websiteUri!).origin; } catch { return p.websiteUri!; } })(),
          stadt,
          quelle_url: p.websiteUri.slice(0, 800),
        });
      }
      console.log("[gmaps-scrape]", {
        plz: data.plz, zielgruppe: data.zielgruppe,
        places: places.length, noWebsite, scrapeFailed, noEmail, withEmail: candidates.length,
      });


      // Dedupe by email
      const byEmail = new Map<string, Cand>();
      for (const c of candidates) if (!byEmail.has(c.email)) byEmail.set(c.email, c);
      const unique = Array.from(byEmail.values());

      if (unique.length === 0) {
        const r = { ok: true, found: 0, inserted: 0, skipped: 0, places: places.length, preview: [] };
        await logSearch(r);
        return r;
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { scoreLead } = await import("@/lib/scoring");
      const rows = unique.map((c) => {
        const base = {
          land: "DE" as const,
          email: c.email,
          fachgebiet: data.zielgruppe,
          zielgruppe: "gesundheitswesen",
          name: c.name,
          telefon: c.telefon,
          website: c.website,
          stadt: c.stadt,
          quelle_url: c.quelle_url,
          quelle_typ: "google_maps",
          gerichtsgutachter: false,
          mode: "dsb" as const,
        };
        const s = scoreLead(base);
        return { ...base, status: "neu" as const, qualitaet_score: s.score, qualitaets_merkmale: s.merkmale };
      });

      const { data: inserted, error } = await supabaseAdmin
        .from("leads")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(rows as any, { onConflict: "land,email", ignoreDuplicates: true })
        .select("id");

      if (error) {
        const r = { ok: false, error: error.message, found: unique.length, inserted: 0, skipped: 0, places: places.length, preview: [] };
        await logSearch(r);
        return r;
      }
      const insertedCount = inserted?.length ?? 0;
      const result = {
        ok: true,
        found: unique.length,
        inserted: insertedCount,
        skipped: unique.length - insertedCount,
        places: places.length,
        preview: unique.slice(0, 5).map((c) => ({ email: c.email, name: c.name, website: c.website })),
      };
      await logSearch(result);
      return result;
    },
  );
