import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// CPV-Codes mit Relevanz für IMB (medizinische Gutachten / Sachverständige)
export const DEFAULT_CPV_CODES = [
  "85100000", // Dienstleistungen des Gesundheitswesens
  "85120000", // Dienstleistungen von Arztpraxen
  "85140000", // Verschiedene Dienstleistungen im Gesundheitswesen
  "71319000", // Sachverständigendienste
  "71621000", // Technische Analysen oder Beratung
  "79419000", // Beratung im Bereich Bewertung
  "79530000", // Übersetzungsdienste
];

export const TENDER_STATUS = ["neu", "beobachtet", "beworben", "verworfen"] as const;
export type TenderStatus = (typeof TENDER_STATUS)[number];

export interface DbTender {
  id: string;
  portal_slug: string;
  extern_id: string;
  titel: string;
  auftraggeber: string | null;
  land: string | null;
  cpv: string | null;
  frist: string | null;
  wert: number | null;
  waehrung: string | null;
  url: string | null;
  beschreibung: string | null;
  status: TenderStatus;
  notiz: string | null;
  gefunden_am: string;
  updated_at: string;
}

export interface DbPortal {
  id: string;
  slug: string;
  name: string;
  land: string;
  region: string | null;
  wichtigkeit: number;
  verbindungstyp: "api" | "rss" | "suchlink" | "manuell";
  status: "live" | "geplant" | "manuell";
  such_url_vorlage: string | null;
  homepage: string | null;
  anmelde_hinweis: string | null;
  aktiv: boolean;
}

const APP_MODES_T = ["gutachten", "dsb"] as const;
const ModeSchemaT = z.enum(APP_MODES_T).optional().default("gutachten");

export const listTenders = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    status: z.enum([...TENDER_STATUS, "alle"] as const).optional(),
    land: z.string().optional(),
    mode: ModeSchemaT,
  }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("tenders")
      .select("*")
      .eq("mode", data.mode)
      .order("qualitaet_score", { ascending: false })
      .order("gefunden_am", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "alle") q = q.eq("status", data.status);
    if (data.land) q = q.eq("land", data.land);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as DbTender[];
  });

export const updateTenderStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; status: TenderStatus; notiz?: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { status: TenderStatus; notiz?: string } = { status: data.status };
    if (typeof data.notiz === "string") patch.notiz = data.notiz;
    const { error } = await supabaseAdmin.from("tenders").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTender = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tenders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPortals = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tender_portals")
    .select("*")
    .order("wichtigkeit", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DbPortal[];
});

export const togglePortal = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; aktiv: boolean }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tender_portals")
      .update({ aktiv: data.aktiv })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTenderSearchJobs = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ mode: ModeSchemaT }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("tender_search_jobs")
      .select("*")
      .eq("mode", data.mode)
      .order("erstellt_am", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const SearchJobInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  cpv_codes: z.array(z.string()).default(DEFAULT_CPV_CODES),
  laender: z.array(z.string()).default(["DE", "AT", "CH", "EU"]),
  schlagworte: z.array(z.string()).default([]),
  aktiv: z.boolean().default(true),
  mode: z.enum(APP_MODES_T).optional().default("gutachten"),
});

export const upsertTenderSearchJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SearchJobInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      name: data.name,
      cpv_codes: data.cpv_codes,
      laender: data.laender,
      schlagworte: data.schlagworte,
      aktiv: data.aktiv,
      mode: data.mode ?? "gutachten",
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("tender_search_jobs")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("tender_search_jobs").insert(row);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteTenderSearchJob = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tender_search_jobs")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTenderSearchJob = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tender_search_jobs")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * TED – Tenders Electronic Daily Search API (v3).
 * Öffentlich, kein Schlüssel nötig.
 * Doku: https://ted.europa.eu/en/release-notes/api
 */
export interface TedHit {
  extern_id: string;
  titel: string;
  auftraggeber: string | null;
  land: string | null;
  cpv: string | null;
  frist: string | null;
  url: string;
  beschreibung: string | null;
}

export async function runTedSearch(opts: {
  cpvCodes: string[];
  laender?: string[];
  schlagworte?: string[];
  limit?: number;
}): Promise<TedHit[]> {
  const cpvList = (opts.cpvCodes ?? DEFAULT_CPV_CODES).slice(0, 20);
  if (cpvList.length === 0) return [];

  const cpvExpr = cpvList.map((c) => `classification-cpv=${c}`).join(" OR ");
  // TED akzeptiert für "buyer-country" 3-stellige ISO-Codes (DEU, AUT, CHE, FRA …)
  const ISO2_TO_ISO3: Record<string, string> = {
    DE: "DEU", AT: "AUT", CH: "CHE", FR: "FRA", IT: "ITA", ES: "ESP",
    NL: "NLD", BE: "BEL", PL: "POL", CZ: "CZE", DK: "DNK", SE: "SWE",
    NO: "NOR", FI: "FIN", GB: "GBR", UK: "GBR", IE: "IRL", PT: "PRT",
    LU: "LUX", HU: "HUN", RO: "ROU", BG: "BGR", GR: "GRC", SI: "SVN",
    SK: "SVK", HR: "HRV", LT: "LTU", LV: "LVA", EE: "EST",
  };
  const countryExpr = (opts.laender ?? [])
    .filter((c) => c && c !== "EU")
    .map((c) => ISO2_TO_ISO3[c.toUpperCase()] ?? c.toUpperCase())
    .map((c) => `buyer-country=${c}`)
    .join(" OR ");
  const kwExpr = (opts.schlagworte ?? [])
    .filter(Boolean)
    .map((k) => `notice-title~"${k.replace(/"/g, "")}"`)
    .join(" OR ");

  const parts = [`(${cpvExpr})`];
  if (countryExpr) parts.push(`(${countryExpr})`);
  if (kwExpr) parts.push(`(${kwExpr})`);
  const query = parts.join(" AND ") + " SORT BY publication-date DESC";

  const body = {
    query,
    fields: [
      "publication-number",
      "notice-title",
      "buyer-name",
      "place-of-performance",
      "classification-cpv",
      "deadline-receipt-tender-date-lot",
      "description-lot",
      "links",
    ],
    limit: Math.min(opts.limit ?? 50, 100),
    page: 1,
    scope: "ACTIVE",
  };

  const res = await fetch("https://api.ted.europa.eu/v3/notices/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`TED API ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as { notices?: Array<Record<string, unknown>> };
  const notices = json.notices ?? [];

  const pickStr = (v: unknown): string | null => {
    if (typeof v === "string") return v;
    if (Array.isArray(v) && v.length > 0) return pickStr(v[0]);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const lang = o["deu"] ?? o["eng"] ?? o["fra"] ?? Object.values(o)[0];
      return pickStr(lang);
    }
    return null;
  };

  return notices.map((n) => {
    const id = pickStr(n["publication-number"]) ?? crypto.randomUUID();
    const title = pickStr(n["notice-title"]) ?? "(ohne Titel)";
    const buyer = pickStr(n["buyer-name"]);
    const country = pickStr(n["place-of-performance"]);
    const cpv = pickStr(n["classification-cpv"]);
    const deadline = pickStr(n["deadline-receipt-tender-date-lot"]);
    const desc = pickStr(n["description-lot"]);
    const links = n["links"] as Record<string, unknown> | undefined;
    const htmlLinks = links?.["html"] as Record<string, unknown> | undefined;
    const url =
      pickStr(htmlLinks?.["deu"]) ??
      pickStr(htmlLinks?.["eng"]) ??
      pickStr(htmlLinks) ??
      `https://ted.europa.eu/de/notice/-/detail/${id}`;
    return {
      extern_id: id,
      titel: title,
      auftraggeber: buyer,
      land: country,
      cpv,
      frist: deadline,
      url,
      beschreibung: desc,
    } satisfies TedHit;
  });
}

/** Manueller Trigger der Dauer-Suche aus der UI (ruft denselben Code wie der Cron). */
export const runTendersNow = createServerFn({ method: "POST" }).handler(async () => {
  const { runTenderTick } = await import("@/lib/tenders.server");
  return runTenderTick();
});

/**
 * Ad-hoc-Suche aus der UI: Nutzer gibt Schlagworte/Länder/CPV ein,
 * wir rufen TED direkt ab und upserten die Treffer in die DB.
 */
export const runManualTenderSearch = createServerFn({ method: "POST" })
  .inputValidator((d: { schlagworte?: string[]; laender?: string[]; cpv_codes?: string[]; limit?: number }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cpv = data.cpv_codes && data.cpv_codes.length > 0 ? data.cpv_codes : DEFAULT_CPV_CODES;
    const hits = await runTedSearch({
      cpvCodes: cpv,
      laender: data.laender ?? ["DE", "AT", "CH", "EU"],
      schlagworte: data.schlagworte ?? [],
      limit: Math.min(data.limit ?? 50, 100),
    });
    let neu = 0;
    if (hits.length > 0) {
      const rows = hits.map((h) => ({
        portal_slug: "ted-eu",
        extern_id: h.extern_id,
        titel: h.titel.slice(0, 500),
        auftraggeber: h.auftraggeber,
        land: h.land,
        cpv: h.cpv,
        frist: h.frist,
        url: h.url,
        beschreibung: h.beschreibung?.slice(0, 4000) ?? null,
        status: "neu" as const,
      }));
      const { data: inserted } = await supabaseAdmin
        .from("tenders")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(rows as any, { onConflict: "portal_slug,extern_id", ignoreDuplicates: true })
        .select("id");
      neu = inserted?.length ?? 0;
    }
    return { ok: true, treffer: hits.length, neu };
  });
