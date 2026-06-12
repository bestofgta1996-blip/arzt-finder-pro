import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const ZIELGRUPPEN = [
  "gutachter",
  "fachaerzte",
  "kliniken",
  "versicherungen",
  "anwaelte",
  "reha",
  "berufsgenossenschaft",
] as const;
export type Zielgruppe = (typeof ZIELGRUPPEN)[number];

const SearchInput = z.object({
  fachgebiet: z.string().max(160).optional().default(""),
  ort: z.string().max(160).optional().default(""),
  land: z.enum(["DE", "PL"]).default("DE"),
  zielgruppen: z.array(z.enum(ZIELGRUPPEN)).min(1),
  gerichtsgutachter: z.boolean().default(false),
  limitPerGroup: z.number().int().min(1).max(15).default(8),
  deepScrape: z.boolean().default(true),
  queryOffset: z.number().int().min(0).optional().default(0),
  maxQueries: z.number().int().min(1).max(3).optional().default(2),
});

const DirectoryScanInput = z.object({
  urls: z.array(z.string().url()).min(1).max(8),
  suchbegriff: z.string().max(160).optional().default(""),
  land: z.enum(["DE", "PL"]).default("DE"),
  maxPagesPerDirectory: z.number().int().min(5).max(60).default(25),
});

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  emails: string[];
  phones: string[];
  zielgruppe: Zielgruppe;
}

export interface DirectoryEmailHit {
  email: string;
  sourceUrl: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s().\-/]{6,}\d)/g;

const TERMS_DE: Record<Zielgruppe, string[]> = {
  gutachter: ["Medizinischer Sachverständiger", "Gerichtsgutachter Arzt", "Gutachter Praxis"],
  fachaerzte: ["Facharzt Praxis", "Arztpraxis Kontakt Impressum"],
  kliniken: ["Klinik Chefarzt Kontakt", "Krankenhaus Fachabteilung"],
  versicherungen: ["Versicherung medizinische Begutachtung Ansprechpartner", "Berufsunfähigkeitsversicherung Gutachterstelle"],
  anwaelte: ["Fachanwalt Medizinrecht Kanzlei Kontakt", "Rechtsanwalt Personenschaden"],
  reha: ["Rehaklinik Kontakt Chefarzt", "Reha-Zentrum Ansprechpartner"],
  berufsgenossenschaft: ["Berufsgenossenschaft Reha Gutachter Kontakt", "BG Klinik Ansprechpartner"],
};

const TERMS_PL: Record<Zielgruppe, string[]> = {
  gutachter: ["biegły sądowy lekarz", "rzeczoznawca medyczny kontakt"],
  fachaerzte: ["lekarz specjalista gabinet kontakt"],
  kliniken: ["klinika ordynator kontakt", "szpital oddział kontakt"],
  versicherungen: ["ubezpieczyciel orzecznictwo lekarskie kontakt"],
  anwaelte: ["adwokat prawo medyczne kancelaria kontakt"],
  reha: ["ośrodek rehabilitacji kontakt"],
  berufsgenossenschaft: ["ZUS orzecznik kontakt"],
};

function buildQueries(input: z.infer<typeof SearchInput>): { zg: Zielgruppe; q: string }[] {
  const dict = input.land === "DE" ? TERMS_DE : TERMS_PL;
  const out: { zg: Zielgruppe; q: string }[] = [];
  for (const zg of input.zielgruppen) {
    for (const term of dict[zg]) {
      const parts = [term];
      if (input.fachgebiet) parts.push(input.fachgebiet);
      if (input.ort) parts.push(input.ort);
      if (input.gerichtsgutachter && (zg === "gutachter" || zg === "fachaerzte")) {
        parts.push(input.land === "DE" ? "Gerichtsgutachter" : "biegły sądowy");
      }
      parts.push(input.land === "DE" ? "Kontakt E-Mail Impressum" : "kontakt email");
      out.push({ zg, q: parts.join(" ") });
    }
  }
  return out;
}

async function fcFetch(path: string, apiKey: string, body: unknown, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`https://api.firecrawl.dev/v2/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

async function fcSearch(apiKey: string, query: string, limit: number, land: "DE" | "PL") {
  // No inline scrapeOptions — much faster, we deep-scrape selectively below.
  const res = await fcFetch(
    "search",
    apiKey,
    { query, limit, lang: land === "DE" ? "de" : "pl", country: land === "DE" ? "de" : "pl" },
    15000,
  );
  if (!res.ok) throw new Error(`search HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as {
    data?:
      | { web?: Array<{ url?: string; title?: string; description?: string }> }
      | Array<{ url?: string; title?: string; description?: string }>;
    web?: Array<{ url?: string; title?: string; description?: string }>;
  };
  if (Array.isArray(json.data)) return json.data;
  return json.data?.web ?? json.web ?? [];
}

async function fcScrape(apiKey: string, url: string): Promise<string> {
  try {
    const res = await fcFetch("scrape", apiKey, { url, formats: ["markdown"], onlyMainContent: true }, 12000);
    if (!res.ok) return "";
    const json = (await res.json()) as { data?: { markdown?: string }; markdown?: string };
    return json.data?.markdown ?? json.markdown ?? "";
  } catch {
    return "";
  }
}

async function fcMap(apiKey: string, url: string, search: string, limit: number): Promise<string[]> {
  try {
    const res = await fcFetch("map", apiKey, { url, search, limit, includeSubdomains: false }, 12000);
    if (!res.ok) return [];
    const json = (await res.json()) as { links?: string[]; data?: { links?: string[] } | string[] };
    if (Array.isArray(json.data)) return json.data;
    return json.data?.links ?? json.links ?? [];
  } catch {
    return [];
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length) as R[];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

function extract(text: string) {
  const emails = Array.from(new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())))
    .filter((e) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e));
  const phones = Array.from(new Set((text.match(PHONE_RE) ?? []).map((p) => p.trim())));
  return { emails, phones };
}

function normalizeDirectoryUrl(raw: string) {
  const url = new URL(raw);
  url.hash = "";
  return url.toString();
}

export const searchDoctors = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SearchInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; hits: SearchHit[]; queries: string[] }> => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    const allQueries = buildQueries(data);
    const queries = allQueries.slice(data.queryOffset, data.queryOffset + data.maxQueries);
    if (!apiKey) {
      return {
        ok: false,
        error: "Suche benötigt den Firecrawl-Connector im Lovable-Dashboard.",
        hits: [],
          queries: allQueries.map((q) => q.q),
      };
    }

    try {
      const results = await Promise.allSettled(
        queries.map((q) => fcSearch(apiKey, q.q, Math.min(data.limitPerGroup, 5), data.land).then((r) => ({ zg: q.zg, r })))
      );

      const byUrl = new Map<string, SearchHit>();
      for (const settled of results) {
        if (settled.status !== "fulfilled") continue;
        const { zg, r } = settled.value;
        for (const item of r) {
          const url = item.url ?? "";
          if (!url) continue;
          const text = `${item.title ?? ""}\n${item.description ?? ""}`;
          const { emails, phones } = extract(text);
          const existing = byUrl.get(url);
          if (existing) {
            existing.emails = Array.from(new Set([...existing.emails, ...emails]));
            existing.phones = Array.from(new Set([...existing.phones, ...phones]));
          } else {
            byUrl.set(url, {
              title: item.title ?? url,
              url,
              snippet: (item.description ?? "").slice(0, 280),
              emails,
              phones,
              zielgruppe: zg,
            });
          }
        }
      }

      let hits = Array.from(byUrl.values());

      // Deep scrape /kontakt + /impressum for hits without emails (cap + concurrency)
      if (data.deepScrape) {
        const noEmail = hits.filter((h) => h.emails.length === 0).slice(0, 3);
        await mapPool(noEmail, 2, async (h) => {
          try {
            const origin = new URL(h.url).origin;
            const candidates = data.land === "DE" ? ["/impressum"] : ["/kontakt"];
            for (const path of candidates) {
              const md = await fcScrape(apiKey, origin + path);
              if (!md) continue;
              const { emails, phones } = extract(md);
              h.emails = Array.from(new Set([...h.emails, ...emails]));
              h.phones = Array.from(new Set([...h.phones, ...phones]));
              if (h.emails.length > 0) break;
            }
          } catch {
            /* ignore */
          }
        });
      }

      // Sort: hits with emails first, then by zielgruppe
      hits = hits.sort((a, b) => (b.emails.length > 0 ? 1 : 0) - (a.emails.length > 0 ? 1 : 0));

      return { ok: true, hits, queries: allQueries.map((q) => q.q) };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Unbekannter Fehler",
        hits: [],
        queries: allQueries.map((q) => q.q),
      };
    }
  });

export const scanDirectoriesForEmails = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DirectoryScanInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; emails: DirectoryEmailHit[]; scannedUrls: string[] }> => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "Suche benötigt den Firecrawl-Connector im Lovable-Dashboard.", emails: [], scannedUrls: [] };
    }

    try {
      const searchTerms = [data.suchbegriff, data.land === "DE" ? "arzt email kontakt impressum" : "lekarz email kontakt"]
        .filter(Boolean)
        .join(" ");
      const discovered = await mapPool(data.urls, 2, async (url) => {
        const mapped = await fcMap(apiKey, url, searchTerms, data.maxPagesPerDirectory);
        return [normalizeDirectoryUrl(url), ...mapped.map(normalizeDirectoryUrl)];
      });
      const pages = Array.from(new Set(discovered.flat())).slice(0, data.urls.length * data.maxPagesPerDirectory);
      const emailByAddress = new Map<string, DirectoryEmailHit>();

      await mapPool(pages, 3, async (url) => {
        const markdown = await fcScrape(apiKey, url);
        const { emails } = extract(markdown);
        for (const email of emails) {
          if (!emailByAddress.has(email)) emailByAddress.set(email, { email, sourceUrl: url });
        }
      });

      return { ok: true, emails: Array.from(emailByAddress.values()), scannedUrls: pages };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Unbekannter Fehler",
        emails: [],
        scannedUrls: [],
      };
    }
  });
