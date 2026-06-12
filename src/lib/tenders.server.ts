import { runTedSearch, DEFAULT_CPV_CODES } from "@/lib/tenders.functions";

/**
 * Stündlicher Hintergrund-Job für Ausschreibungen.
 * Holt aktive Such-Aufträge, ruft die TED-API ab und schreibt neue Treffer in die DB.
 */
export async function runTenderTick() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: jobs, error } = await supabaseAdmin
    .from("tender_search_jobs")
    .select("*")
    .eq("aktiv", true)
    .limit(10);
  if (error) {
    return { ok: false, error: error.message, new_tenders: 0 };
  }

  // Wenn noch kein Job angelegt wurde: einmalig Default-Suche mit IMB-Standard-CPVs
  const effective =
    jobs && jobs.length > 0
      ? jobs
      : [
          {
            id: "default",
            name: "Standard (IMB)",
            cpv_codes: DEFAULT_CPV_CODES,
            laender: ["DE", "AT", "CH", "EU"],
            schlagworte: [] as string[],
          },
        ];

  let totalNew = 0;
  const errors: string[] = [];

  for (const j of effective as Array<{
    id: string;
    name: string;
    cpv_codes: string[];
    laender: string[];
    schlagworte: string[];
  }>) {
    try {
      const hits = await runTedSearch({
        cpvCodes: j.cpv_codes,
        laender: j.laender,
        schlagworte: j.schlagworte,
        limit: 50,
      });
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
          status: "neu",
        }));
        const { data: inserted } = await supabaseAdmin
          .from("tenders")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(rows as any, { onConflict: "portal_slug,extern_id", ignoreDuplicates: true })
          .select("id");
        totalNew += inserted?.length ?? 0;
      }
      if (j.id !== "default") {
        await supabaseAdmin
          .from("tender_search_jobs")
          .update({ last_run_at: new Date().toISOString(), last_hit_count: hits.length })
          .eq("id", j.id);
      }
    } catch (e) {
      errors.push(`${j.name}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return { ok: true, jobs: effective.length, new_tenders: totalNew, errors };
}
