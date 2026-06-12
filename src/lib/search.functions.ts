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
});

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  emails: string[];
  phones: string[];
  zielgruppe: Zielgruppe;
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

async function fcSearch(apiKey: string, query: string, limit: number, land: "DE" | "PL") {
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit,
      lang: land === "DE" ? "de" : "pl",
      country: land === "DE" ? "de" : "pl",
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as {
    data?: Array<{ url?: string; title?: string; description?: string; markdown?: string }>;
  };
  return json.data ?? [];
}

async function fcScrape(apiKey: string, url: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { data?: { markdown?: string } };
    return json.data?.markdown ?? "";
  } catch {
    return "";
  }
}

function extract(text: string) {
  const emails = Array.from(new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())))
    .filter((e) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e));
  const phones = Array.from(new Set((text.match(PHONE_RE) ?? []).map((p) => p.trim())));
  return { emails, phones };
}

export const searchDoctors = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SearchInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; hits: SearchHit[]; queries: string[] }> => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    const queries = buildQueries(data);
    if (!apiKey) {
      return {
        ok: false,
        error: "Suche benötigt den Firecrawl-Connector im Lovable-Dashboard.",
        hits: [],
        queries: queries.map((q) => q.q),
      };
    }

    try {
      // Run all queries in parallel
      const results = await Promise.allSettled(
        queries.map((q) => fcSearch(apiKey, q.q, data.limitPerGroup, data.land).then((r) => ({ zg: q.zg, r })))
      );

      const byUrl = new Map<string, SearchHit>();
      for (const settled of results) {
        if (settled.status !== "fulfilled") continue;
        const { zg, r } = settled.value;
        for (const item of r) {
          const url = item.url ?? "";
          if (!url) continue;
          const text = `${item.title ?? ""}\n${item.description ?? ""}\n${item.markdown ?? ""}`;
          const { emails, phones } = extract(text);
          const existing = byUrl.get(url);
          if (existing) {
            existing.emails = Array.from(new Set([...existing.emails, ...emails]));
            existing.phones = Array.from(new Set([...existing.phones, ...phones]));
          } else {
            byUrl.set(url, {
              title: item.title ?? url,
              url,
              snippet: (item.description ?? item.markdown ?? "").slice(0, 280),
              emails,
              phones,
              zielgruppe: zg,
            });
          }
        }
      }

      let hits = Array.from(byUrl.values());

      // Deep scrape /kontakt + /impressum for hits without emails (limit to 12 to control costs)
      if (data.deepScrape) {
        const noEmail = hits.filter((h) => h.emails.length === 0).slice(0, 12);
        await Promise.allSettled(
          noEmail.map(async (h) => {
            try {
              const origin = new URL(h.url).origin;
              const candidates = data.land === "DE"
                ? ["/kontakt", "/impressum", "/kontakt/"]
                : ["/kontakt", "/kontakty"];
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
          })
        );
      }

      // Sort: hits with emails first, then by zielgruppe
      hits = hits.sort((a, b) => (b.emails.length > 0 ? 1 : 0) - (a.emails.length > 0 ? 1 : 0));

      return { ok: true, hits, queries: queries.map((q) => q.q) };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Unbekannter Fehler",
        hits: [],
        queries: queries.map((q) => q.q),
      };
    }
  });
