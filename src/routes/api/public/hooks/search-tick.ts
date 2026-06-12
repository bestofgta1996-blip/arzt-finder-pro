import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-getriggerter Endpunkt: läuft stündlich via pg_cron.
 * Holt aktive search_jobs, ruft die bestehende Such-Pipeline auf und
 * legt neue E-Mail-Treffer als Leads in der DB an.
 */
export const Route = createFileRoute("/api/public/hooks/search-tick")({
  server: {
    handlers: {
      POST: async () => runTick(),
      GET: async () => runTick(),
    },
  },
});

async function runTick(): Promise<Response> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "FIRECRAWL_API_KEY missing" }, { status: 500 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { searchDoctors } = await import("@/lib/search.functions");

  const { data: jobs, error } = await supabaseAdmin
    .from("search_jobs")
    .select("*")
    .eq("aktiv", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })
    .limit(6);

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const { data: runRow } = await supabaseAdmin
    .from("search_runs")
    .insert({ jobs_run: jobs?.length ?? 0 })
    .select("id")
    .single();
  const runId = (runRow as { id?: string } | null)?.id;

  let totalNew = 0;
  const errors: string[] = [];

  for (const j of jobs ?? []) {
    const job = j as {
      id: string;
      land: string;
      fachgebiet: string;
      ort: string | null;
      zielgruppen: string[];
      gerichtsgutachter: boolean;
    };
    try {
      const land = (["DE", "PL"].includes(job.land) ? job.land : "DE") as "DE" | "PL";
      const res = await searchDoctors({
        data: {
          fachgebiet: job.fachgebiet,
          ort: job.ort ?? "",
          land,
          zielgruppen: job.zielgruppen as never,
          gerichtsgutachter: job.gerichtsgutachter,
          limitPerGroup: 5,
          deepScrape: true,
          queryOffset: 0,
          maxQueries: 3,
        },
      });

      const rows: Array<Record<string, unknown>> = [];
      let hitCount = 0;
      for (const hit of res.hits ?? []) {
        for (const email of hit.emails) {
          rows.push({
            land: job.land,
            fachgebiet: job.fachgebiet,
            zielgruppe: hit.zielgruppe,
            name: hit.title.slice(0, 240),
            email: email.toLowerCase(),
            telefon: hit.phones[0] ?? null,
            website: hit.url,
            stadt: job.ort,
            quelle_url: hit.url,
            quelle_typ: "cron-suche",
            gerichtsgutachter: job.gerichtsgutachter,
            status: "neu",
          });
          hitCount++;
        }
      }

      if (rows.length > 0) {
        const { data: inserted } = await supabaseAdmin
          .from("leads")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(rows as any, { onConflict: "land,email", ignoreDuplicates: true })
          .select("id");
        totalNew += inserted?.length ?? 0;
      }

      await supabaseAdmin
        .from("search_jobs")
        .update({ last_run_at: new Date().toISOString(), last_hit_count: hitCount })
        .eq("id", job.id);
    } catch (e) {
      errors.push(`${job.id}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  if (runId) {
    await supabaseAdmin
      .from("search_runs")
      .update({
        finished_at: new Date().toISOString(),
        new_leads: totalNew,
        errors: errors.length ? errors.join(" | ") : null,
      })
      .eq("id", runId);
  }

  return Response.json({ ok: true, jobs: jobs?.length ?? 0, new_leads: totalNew, errors });
}
