import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SearchInput = z.object({
  fachgebiet: z.string().min(1).max(120),
  ort: z.string().max(120).optional().default(""),
  land: z.enum(["DE", "PL"]),
  gerichtsgutachter: z.boolean().default(false),
  limit: z.number().int().min(1).max(20).default(10),
});

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  emails: string[];
  phones: string[];
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s().\-/]{6,}\d)/g;

function buildQuery(input: z.infer<typeof SearchInput>): string {
  const parts: string[] = [];
  if (input.land === "DE") {
    parts.push(input.gerichtsgutachter ? "Gerichtsgutachter Sachverständiger" : "Arzt Praxis");
  } else {
    parts.push(input.gerichtsgutachter ? "biegły sądowy lekarz" : "lekarz gabinet");
  }
  parts.push(input.fachgebiet);
  if (input.ort) parts.push(input.ort);
  parts.push(input.land === "DE" ? "Kontakt Email" : "kontakt email");
  return parts.join(" ");
}

export const searchDoctors = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SearchInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; hits: SearchHit[]; query: string }> => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    const query = buildQuery(data);

    if (!apiKey) {
      return {
        ok: false,
        error:
          "Suchfunktion benötigt den Firecrawl-Connector. Bitte im Lovable-Dashboard verbinden, dann erneut versuchen.",
        hits: [],
        query,
      };
    }

    try {
      const res = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: data.limit,
          lang: data.land === "DE" ? "de" : "pl",
          country: data.land === "DE" ? "de" : "pl",
          scrapeOptions: { formats: ["markdown"] },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: `Firecrawl HTTP ${res.status}: ${text.slice(0, 200)}`, hits: [], query };
      }

      const json = (await res.json()) as { data?: Array<{ url?: string; title?: string; description?: string; markdown?: string }> };
      const raw = json.data ?? [];
      const hits: SearchHit[] = raw.map((r) => {
        const text = `${r.title ?? ""}\n${r.description ?? ""}\n${r.markdown ?? ""}`;
        const emails = Array.from(new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())));
        const phones = Array.from(new Set((text.match(PHONE_RE) ?? []).map((p) => p.trim())));
        return {
          title: r.title ?? r.url ?? "(ohne Titel)",
          url: r.url ?? "",
          snippet: (r.description ?? r.markdown ?? "").slice(0, 280),
          emails,
          phones,
        };
      });
      return { ok: true, hits, query };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Unbekannter Fehler", hits: [], query };
    }
  });
