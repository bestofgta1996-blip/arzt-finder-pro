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
  mode: ModeSchema,
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
            mode: data.mode,
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
        mode: data.mode,
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
  limit: z.number().int().min(1).max(300).optional().default(120),
  mode: ModeSchema,
});

// Google Places (New) primary type per Zielgruppe – narrows nearby-search results.
const GMAPS_INCLUDED_TYPES: Record<DsbZielgruppe, string[]> = {
  "Arztpraxen & MVZ": ["doctor"],
  "Kliniken & Reha": ["hospital"],
  "Zahnärzte": ["dentist"],
  "Physiotherapie": ["physiotherapist"],
  "Heilpraktiker": [],
  "Apotheken": ["pharmacy"],
  "Pflegedienste": [],
  "Labore": ["medical_lab"],
};



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
  totalWanted: number,
  apiKey: string,
  lovableKey: string,
): Promise<GmapsPlace[]> {
  const all: GmapsPlace[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 3 && all.length < totalWanted; page++) {
    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: "de",
      regionCode: "DE",
      pageSize: 20,
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      },
    };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch(`${GMAPS_GATEWAY}/places/v1/places:searchText`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": apiKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,nextPageToken",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const json = (await res.json()) as { places?: GmapsPlace[]; nextPageToken?: string };
    for (const p of json.places ?? []) all.push(p);
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
    // Google requires a short delay before nextPageToken is valid
    await new Promise((r) => setTimeout(r, 1500));
  }
  return all;
}

/**
 * Nearby-Search (Places API New) für einen einzelnen Kreis.
 * Google liefert pro Aufruf max. 20 Orte; deshalb wird über ein Grid gerastert.
 */
async function searchNearbyCell(
  includedTypes: string[],
  textQueryFallback: string | null,
  center: { lat: number; lng: number },
  radiusMeters: number,
  apiKey: string,
  lovableKey: string,
): Promise<GmapsPlace[]> {
  // Falls kein passender Google-Typ verfügbar ist, auf Text-Search zurückfallen.
  if (includedTypes.length === 0 && textQueryFallback) {
    return searchPlaces(textQueryFallback, center, radiusMeters, 60, apiKey, lovableKey);
  }
  const body: Record<string, unknown> = {
    includedTypes,
    maxResultCount: 20,
    languageCode: "de",
    regionCode: "DE",
    locationRestriction: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: Math.min(radiusMeters, 50000),
      },
    },
  };
  const res = await fetch(`${GMAPS_GATEWAY}/places/v1/places:searchNearby`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { places?: GmapsPlace[] };
  return json.places ?? [];
}

/**
 * Erzeugt ein Hex-Grid aus Zell-Zentren rund um `center` bis `radiusKm`.
 * Zellradius = min(5 km, radiusKm) – enger Radius = weniger Google-Overhead.
 */
function buildGridCells(
  center: { lat: number; lng: number },
  radiusKm: number,
): { cells: Array<{ lat: number; lng: number }>; cellRadiusMeters: number } {
  const cellRadiusKm = Math.min(5, Math.max(1, radiusKm));
  if (radiusKm <= cellRadiusKm) {
    return { cells: [center], cellRadiusMeters: cellRadiusKm * 1000 };
  }
  // Hex-Grid: horizontaler Abstand = 1.5 * r, vertikaler = sqrt(3) * r
  const stepKm = cellRadiusKm * 1.5;
  const rowKm = cellRadiusKm * Math.sqrt(3);
  const kmPerLat = 111;
  const kmPerLng = 111 * Math.cos((center.lat * Math.PI) / 180);
  const cells: Array<{ lat: number; lng: number }> = [];
  const maxSteps = Math.ceil(radiusKm / cellRadiusKm) + 1;
  for (let row = -maxSteps; row <= maxSteps; row++) {
    for (let col = -maxSteps; col <= maxSteps; col++) {
      const offsetX = col * stepKm + (row % 2 === 0 ? 0 : stepKm / 2);
      const offsetY = row * rowKm;
      const dist = Math.hypot(offsetX, offsetY);
      if (dist > radiusKm) continue;
      cells.push({
        lat: center.lat + offsetY / kmPerLat,
        lng: center.lng + offsetX / kmPerLng,
      });
    }
  }
  return { cells, cellRadiusMeters: cellRadiusKm * 1000 };
}

/**
 * Grid-Suche: teilt das Suchgebiet in Teilzellen und ruft nearby-Search pro Zelle auf.
 * Umgeht damit das 20-Treffer-pro-Request-Limit von Google Places (New).
 */
async function searchPlacesGrid(
  zielgruppe: DsbZielgruppe,
  textFallback: string,
  center: { lat: number; lng: number },
  radiusKm: number,
  totalWanted: number,
  apiKey: string,
  lovableKey: string,
): Promise<{ places: GmapsPlace[]; cellsTotal: number; cellsUsed: number }> {
  const includedTypes = GMAPS_INCLUDED_TYPES[zielgruppe] ?? [];
  const { cells, cellRadiusMeters } = buildGridCells(center, radiusKm);
  const byId = new Map<string, GmapsPlace>();
  const CONCURRENCY = 4;
  let idx = 0;
  let cellsUsed = 0;
  const doOne = async (): Promise<void> => {
    while (true) {
      if (byId.size >= totalWanted) return;
      const i = idx++;
      if (i >= cells.length) return;
      const results = await searchNearbyCell(
        includedTypes,
        textFallback,
        cells[i],
        cellRadiusMeters,
        apiKey,
        lovableKey,
      );
      cellsUsed++;
      for (const p of results) {
        if (!p.id || byId.has(p.id)) continue;
        byId.set(p.id, p);
      }
    }
  };
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(CONCURRENCY, cells.length); w++) workers.push(doOne());
  await Promise.all(workers);
  return {
    places: Array.from(byId.values()).slice(0, totalWanted),
    cellsTotal: cells.length,
    cellsUsed,
  };
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

/** Cloudflare `data-cfemail`-Attribute decodieren. */
function decodeCloudflareEmails(html: string): string[] {
  const out: string[] = [];
  const re = /data-cfemail=["']([a-f0-9]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const hex = m[1];
    if (hex.length < 4) continue;
    const key = parseInt(hex.slice(0, 2), 16);
    let email = "";
    for (let i = 2; i < hex.length; i += 2) {
      email += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    }
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.push(email.toLowerCase());
  }
  return out;
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
    `${origin}/impressum`,
    `${origin}/impressum/`,
    `${origin}/impressum.html`,
    `${origin}/kontakt`,
    `${origin}/kontakt/`,
    `${origin}/kontakt.html`,
    `${origin}/imprint`,
    `${origin}/legal`,
    `${origin}/rechtliches`,
    `${origin}/datenschutz`,
    `${origin}/ueber-uns`,
    `${origin}/team`,
    `${origin}/praxis`,
    origin,
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
          waitFor: 2500,
          timeout: 20000,
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

      // 1. Cloudflare-obfuscated emails
      const cf = decodeCloudflareEmails(html);
      if (cf.length > 0) {
        const good = cf.find((e) => !BLOCK_EMAIL_DOMAINS.has(e.split("@")[1] ?? ""));
        if (good) return { email: good, reason: "ok" };
      }

      // 2. Direkt aus mailto: (verlässlichste Quelle)
      const mailto = html.match(/mailto:([^"'?\s<>]+)/i);
      if (mailto) {
        const e = extractEmail(mailto[1]);
        if (e) return { email: e, reason: "ok" };
      }

      // 3. Aus deobfuscated Markdown + HTML
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
      cellsTotal?: number;
      cellsUsed?: number;
      preview: Array<{
        email: string | null;
        name: string | null;
        website: string | null;
        adresse: string | null;
        telefon: string | null;
        stadt: string | null;
      }>;
    }> => {

      const logSearch = async (result: { ok: boolean; error?: string; found: number; inserted: number; skipped: number }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("source_searches").insert({
            quelle: "google_maps",
            fachgebiet: data.zielgruppe,
            ort: data.plz,
            land: "DE",
            mode: data.mode,
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

      const geo = await geocodePlz(data.plz, gmapsKey, lovableKey);
      if (!geo) {
        const r = { ok: false, error: `PLZ ${data.plz} konnte nicht geocodiert werden.`, found: 0, inserted: 0, skipped: 0, places: 0, preview: [] };
        await logSearch(r);
        return r;
      }

      const hints = GMAPS_QUERY_HINTS[data.zielgruppe];
      const primaryHint = hints[0] ?? data.zielgruppe;
      const grid = await searchPlacesGrid(
        data.zielgruppe,
        primaryHint,
        geo,
        data.radiusKm,
        data.limit,
        gmapsKey,
        lovableKey,
      );
      const placesById = new Map<string, GmapsPlace>();
      for (const p of grid.places) {
        if (!p.id || placesById.has(p.id)) continue;
        placesById.set(p.id, p);
      }
      // Extra Text-Suche für breitere Abdeckung, falls Grid wenig liefert.
      if (placesById.size < Math.min(data.limit, 60)) {
        const radiusMeters = Math.min(data.radiusKm * 1000, 50000);
        for (const hint of hints.slice(0, 2)) {
          const results = await searchPlaces(hint, geo, radiusMeters, 60, gmapsKey, lovableKey);
          for (const p of results) {
            if (!p.id || placesById.has(p.id)) continue;
            placesById.set(p.id, p);
          }
          if (placesById.size >= data.limit) break;
        }
      }
      const places = Array.from(placesById.values()).slice(0, data.limit);


      // Extract city helper
      const cityFromAddress = (addr: string | undefined): string | null => {
        if (!addr) return geo.stadt;
        const parts = addr.split(",").map((s) => s.trim());
        const cityPart = parts.length >= 2 ? parts[parts.length - 2] : null;
        if (!cityPart) return geo.stadt;
        const m = cityPart.match(/\d{4,5}\s+(.+)/);
        return (m ? m[1] : cityPart).slice(0, 120);
      };

      // Scrape emails in parallel (limited concurrency)
      type Enriched = {
        place: GmapsPlace;
        email: string | null;
        stadt: string | null;
      };
      const enriched: Enriched[] = [];
      const CONCURRENCY = 5;
      let idx = 0;
      const workers: Promise<void>[] = [];
      const doOne = async (): Promise<void> => {
        while (true) {
          const i = idx++;
          if (i >= places.length) return;
          const p = places[i];
          let email: string | null = null;
          if (p.websiteUri) {
            try {
              const r = await scrapeEmailFromWebsite(p.websiteUri, firecrawlKey);
              email = r.email;
            } catch { /* ignore */ }
          }
          enriched.push({ place: p, email, stadt: cityFromAddress(p.formattedAddress) });
        }
      };
      for (let w = 0; w < Math.min(CONCURRENCY, places.length); w++) workers.push(doOne());
      await Promise.all(workers);

      // Sort: with email first, then by name
      enriched.sort((a, b) => {
        const ae = a.email ? 0 : 1;
        const be = b.email ? 0 : 1;
        if (ae !== be) return ae - be;
        return (a.place.displayName?.text ?? "").localeCompare(b.place.displayName?.text ?? "");
      });

      // Insert only those with email; deduplicate
      const seenEmails = new Set<string>();
      const rowsToInsert = enriched
        .filter((e) => {
          if (!e.email) return false;
          if (seenEmails.has(e.email)) return false;
          seenEmails.add(e.email);
          return true;
        })
        .map((e) => {
          const website = (() => { try { return new URL(e.place.websiteUri!).origin; } catch { return e.place.websiteUri ?? null; } })();
          const base = {
            land: "DE" as const,
            email: e.email!.toLowerCase(),
            fachgebiet: data.zielgruppe,
            zielgruppe: "gesundheitswesen",
            name: e.place.displayName?.text ?? null,
            telefon: e.place.nationalPhoneNumber ?? e.place.internationalPhoneNumber ?? null,
            website,
            stadt: e.stadt,
            quelle_url: e.place.websiteUri?.slice(0, 800) ?? null,
            quelle_typ: "google_maps",
            gerichtsgutachter: false,
            mode: data.mode,
          };
          return base;
        });

      let insertedCount = 0;
      if (rowsToInsert.length > 0) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { scoreLead } = await import("@/lib/scoring");
        const enrichedRows = rowsToInsert.map((base) => {
          const s = scoreLead(base);
          return { ...base, status: "neu" as const, qualitaet_score: s.score, qualitaets_merkmale: s.merkmale };
        });
        const { data: inserted, error } = await supabaseAdmin
          .from("leads")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(enrichedRows as any, { onConflict: "land,email", ignoreDuplicates: true })
          .select("id");
        if (error) {
          const r = {
            ok: false, error: error.message,
            found: rowsToInsert.length, inserted: 0, skipped: 0, places: places.length,
            preview: enriched.map((e) => ({
              email: e.email, name: e.place.displayName?.text ?? null,
              website: e.place.websiteUri ?? null, adresse: e.place.formattedAddress ?? null,
              telefon: e.place.nationalPhoneNumber ?? e.place.internationalPhoneNumber ?? null,
              stadt: e.stadt,
            })),
          };
          await logSearch(r);
          return r;
        }
        insertedCount = inserted?.length ?? 0;
      }

      console.log("[gmaps-scrape]", {
        plz: data.plz, zielgruppe: data.zielgruppe,
        places: places.length, withEmail: rowsToInsert.length, inserted: insertedCount,
      });

      const result = {
        ok: true,
        found: rowsToInsert.length,
        inserted: insertedCount,
        skipped: rowsToInsert.length - insertedCount,
        places: places.length,
        cellsTotal: grid.cellsTotal,
        cellsUsed: grid.cellsUsed,
        preview: enriched.map((e) => ({
          email: e.email,
          name: e.place.displayName?.text ?? null,
          website: e.place.websiteUri ?? null,
          adresse: e.place.formattedAddress ?? null,
          telefon: e.place.nationalPhoneNumber ?? e.place.internationalPhoneNumber ?? null,
          stadt: e.stadt,
        })),
      };

      await logSearch(result);
      return result;
    },
  );


// ---- OpenStreetMap / Overpass DSB-Recherche -----------------------

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const OSM_QUERY_TAGS: Record<DsbZielgruppe, string[]> = {
  "Arztpraxen & MVZ": ['amenity=doctors', 'healthcare=doctor', 'healthcare=centre'],
  "Kliniken & Reha": ['amenity=hospital', 'healthcare=hospital', 'healthcare=rehabilitation'],
  "Zahnärzte": ['amenity=dentist', 'healthcare=dentist'],
  "Physiotherapie": ['healthcare=physiotherapist'],
  "Heilpraktiker": ['healthcare=alternative'],
  "Apotheken": ['amenity=pharmacy', 'healthcare=pharmacy'],
  "Pflegedienste": ['amenity=nursing_home', 'healthcare=nursing', 'social_facility=nursing_home'],
  "Labore": ['healthcare=laboratory'],
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function queryOverpass(
  center: { lat: number; lng: number },
  radiusMeters: number,
  tagFilters: string[],
): Promise<OsmElement[]> {
  const parts = tagFilters
    .map((t) => {
      const [k, v] = t.split("=");
      const filter = `["${k}"="${v}"]`;
      return `nwr${filter}(around:${radiusMeters},${center.lat},${center.lng});`;
    })
    .join("");
  const query = `[out:json][timeout:25];(${parts});out center tags 300;`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "ArztFinderPro/1.0 (contact via app)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { elements?: OsmElement[] };
      return json.elements ?? [];
    } catch {
      /* try next */
    }
  }
  return [];
}

export const scrapeOsmHealthcare = createServerFn({ method: "POST" })
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
      withWebsite?: number;
      preview: Array<{
        email: string | null;
        name: string | null;
        website: string | null;
        adresse: string | null;
        telefon: string | null;
        stadt: string | null;
      }>;
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
            quelle: "openstreetmap",
            fachgebiet: data.zielgruppe,
            ort: data.plz,
            land: "DE",
            mode: data.mode,
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

      // Geocoding via Google (falls verfügbar), sonst Nominatim
      let geo: { lat: number; lng: number; stadt: string | null } | null = null;
      if (lovableKey && gmapsKey) {
        geo = await geocodePlz(data.plz, gmapsKey, lovableKey);
      }
      if (!geo) {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&postalcode=${encodeURIComponent(data.plz)}`,
            { headers: { "User-Agent": "ArztFinderPro/1.0" } },
          );
          if (res.ok) {
            const json = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
            const first = json[0];
            if (first) {
              geo = {
                lat: parseFloat(first.lat),
                lng: parseFloat(first.lon),
                stadt: first.display_name?.split(",")[1]?.trim() ?? null,
              };
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!geo) {
        const r = {
          ok: false,
          error: `PLZ ${data.plz} konnte nicht geocodiert werden.`,
          found: 0,
          inserted: 0,
          skipped: 0,
          places: 0,
          preview: [],
        };
        await logSearch(r);
        return r;
      }

      const tagFilters = OSM_QUERY_TAGS[data.zielgruppe];
      const radiusMeters = Math.min(data.radiusKm * 1000, 50000);
      const elements = await queryOverpass(geo, radiusMeters, tagFilters);

      // Deduplicate by OSM id
      const byId = new Map<number, OsmElement>();
      for (const el of elements) {
        if (!byId.has(el.id)) byId.set(el.id, el);
      }
      const all = Array.from(byId.values()).slice(0, data.limit);

      type Item = {
        name: string | null;
        email: string | null;
        telefon: string | null;
        website: string | null;
        adresse: string | null;
        stadt: string | null;
      };

      const items: Item[] = all.map((el) => {
        const t = el.tags ?? {};
        const email = (t["contact:email"] ?? t.email ?? "").toLowerCase().trim() || null;
        const website = (t["contact:website"] ?? t.website ?? "").trim() || null;
        const phone = (t["contact:phone"] ?? t.phone ?? "").trim() || null;
        const stadt = t["addr:city"] ?? geo!.stadt;
        const strasse = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
        const plz = t["addr:postcode"];
        const adresse = [strasse, [plz, stadt].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
        return {
          name: t.name ?? null,
          email,
          telefon: phone,
          website,
          adresse,
          stadt,
        };
      });

      // Für Treffer ohne E-Mail aber mit Website: Firecrawl-Fallback (max. 20 parallel-limitiert)
      const withoutEmail = items.filter((i) => !i.email && i.website);
      if (firecrawlKey && withoutEmail.length > 0) {
        const CONCURRENCY = 5;
        const MAX_SCRAPE = 30;
        const target = withoutEmail.slice(0, MAX_SCRAPE);
        let idx = 0;
        const doOne = async (): Promise<void> => {
          while (true) {
            const i = idx++;
            if (i >= target.length) return;
            const it = target[i];
            if (!it.website) continue;
            try {
              const r = await scrapeEmailFromWebsite(it.website, firecrawlKey);
              if (r.email) it.email = r.email;
            } catch {
              /* ignore */
            }
          }
        };
        const workers: Promise<void>[] = [];
        for (let w = 0; w < Math.min(CONCURRENCY, target.length); w++) workers.push(doOne());
        await Promise.all(workers);
      }

      // Sort: mit E-Mail zuerst
      items.sort((a, b) => {
        const ae = a.email ? 0 : 1;
        const be = b.email ? 0 : 1;
        if (ae !== be) return ae - be;
        return (a.name ?? "").localeCompare(b.name ?? "");
      });

      // Insert alle mit gültiger E-Mail
      const seen = new Set<string>();
      const rowsToInsert = items
        .filter((it) => {
          if (!it.email) return false;
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(it.email)) return false;
          if (seen.has(it.email)) return false;
          seen.add(it.email);
          return true;
        })
        .map((it) => {
          const websiteOrigin = (() => {
            try {
              return it.website ? new URL(it.website).origin : null;
            } catch {
              return it.website;
            }
          })();
          return {
            land: "DE" as const,
            email: it.email!.toLowerCase(),
            fachgebiet: data.zielgruppe,
            zielgruppe: "gesundheitswesen",
            name: it.name,
            telefon: it.telefon,
            website: websiteOrigin,
            stadt: it.stadt,
            quelle_url: it.website?.slice(0, 800) ?? null,
            quelle_typ: "openstreetmap",
            gerichtsgutachter: false,
            mode: data.mode,
          };
        });

      let insertedCount = 0;
      if (rowsToInsert.length > 0) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { scoreLead } = await import("@/lib/scoring");
        const enrichedRows = rowsToInsert.map((base) => {
          const s = scoreLead(base);
          return { ...base, status: "neu" as const, qualitaet_score: s.score, qualitaets_merkmale: s.merkmale };
        });
        const { data: inserted, error } = await supabaseAdmin
          .from("leads")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(enrichedRows as any, { onConflict: "land,email", ignoreDuplicates: true })
          .select("id");
        if (error) {
          const r = {
            ok: false,
            error: error.message,
            found: rowsToInsert.length,
            inserted: 0,
            skipped: 0,
            places: all.length,
            withWebsite: items.filter((i) => i.website).length,
            preview: items,
          };
          await logSearch(r);
          return r;
        }
        insertedCount = inserted?.length ?? 0;
      }

      const result = {
        ok: true,
        found: rowsToInsert.length,
        inserted: insertedCount,
        skipped: rowsToInsert.length - insertedCount,
        places: all.length,
        withWebsite: items.filter((i) => i.website).length,
        preview: items,
      };
      await logSearch(result);
      return result;
    },
  );
