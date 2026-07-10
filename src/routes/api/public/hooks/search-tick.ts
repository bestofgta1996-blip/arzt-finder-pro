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

// Standard-Dauersuche, die automatisch angelegt wird, wenn noch keine Jobs existieren.
// Pro Land × Fachgebiet ein Job. Cron rotiert dann durch alle.
const DEFAULT_JOBS: Array<{ land: "DE" | "PL"; fachgebiet: string }> = [
  { land: "DE", fachgebiet: "Orthopädie" },
  { land: "DE", fachgebiet: "Unfallchirurgie" },
  { land: "DE", fachgebiet: "Neurologie" },
  { land: "DE", fachgebiet: "Psychiatrie" },
  { land: "DE", fachgebiet: "Innere Medizin" },
  { land: "DE", fachgebiet: "Allgemeinmedizin" },
  { land: "DE", fachgebiet: "Radiologie" },
  { land: "DE", fachgebiet: "Anästhesie" },
  { land: "PL", fachgebiet: "Ortopedia" },
  { land: "PL", fachgebiet: "Neurologia" },
  { land: "PL", fachgebiet: "Psychiatria" },
  { land: "PL", fachgebiet: "Chirurgia" },
];

async function ensureDefaultJobs(supabaseAdmin: {
  from: (t: string) => {
    select: (s: string) => {
      limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
    insert: (rows: unknown) => Promise<{ error: unknown }>;
  };
}) {
  const { data: existing } = await supabaseAdmin.from("search_jobs").select("id").limit(1);
  if (existing && existing.length > 0) return;
  await supabaseAdmin.from("search_jobs").insert(
    DEFAULT_JOBS.map((j) => ({
      land: j.land,
      fachgebiet: j.fachgebiet,
      ort: null,
      zielgruppen: ["gutachter", "fachaerzte", "kliniken"],
      gerichtsgutachter: false,
      aktiv: true,
    })),
  );
}

async function runTick(): Promise<Response> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "FIRECRAWL_API_KEY missing" }, { status: 500 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { searchDoctors } = await import("@/lib/search.functions");
  const { scoreLead } = await import("@/lib/scoring");

  await ensureDefaultJobs(supabaseAdmin as never);

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

  const CITIES_DE = [
    "", "Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Stuttgart",
    "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden",
    "Hannover", "Nürnberg", "Duisburg", "Bochum", "Wuppertal", "Bielefeld",
    "Bonn", "Münster", "Mannheim", "Karlsruhe", "Augsburg", "Wiesbaden",
    "Kiel", "Halle", "Magdeburg", "Freiburg", "Erfurt", "Rostock",
  ];
  const CITIES_PL = [
    "", "Warszawa", "Kraków", "Łódź", "Wrocław", "Poznań", "Gdańsk",
    "Szczecin", "Bydgoszcz", "Lublin", "Katowice", "Białystok", "Gdynia",
    "Częstochowa", "Radom", "Toruń", "Rzeszów", "Kielce", "Olsztyn",
  ];
  const STEP = 3; // wie viele Query-Varianten pro Tick abgearbeitet werden

  for (const j of jobs ?? []) {
    const job = j as {
      id: string;
      land: string;
      fachgebiet: string;
      ort: string | null;
      zielgruppen: string[];
      gerichtsgutachter: boolean;
      query_offset?: number | null;
      city_index?: number | null;
    };
    try {
      const land = (["DE", "PL"].includes(job.land) ? job.land : "DE") as "DE" | "PL";
      const cities = land === "DE" ? CITIES_DE : CITIES_PL;
      const cityIdx = ((job.city_index ?? 0) % cities.length + cities.length) % cities.length;
      const ort = job.ort && job.ort.trim() ? job.ort : cities[cityIdx];
      const offset = Math.max(0, job.query_offset ?? 0);

      const res = await searchDoctors({
        data: {
          fachgebiet: job.fachgebiet,
          ort: ort ?? "",
          land,
          zielgruppen: job.zielgruppen as never,
          gerichtsgutachter: job.gerichtsgutachter,
          limitPerGroup: 5,
          deepScrape: true,
          queryOffset: offset,
          maxQueries: STEP,
        },
      });

      const rows: Array<Record<string, unknown>> = [];
      let hitCount = 0;
      for (const hit of res.hits ?? []) {
        for (const email of hit.emails) {
          const base = {
            land: job.land,
            fachgebiet: job.fachgebiet,
            zielgruppe: hit.zielgruppe,
            name: hit.title.slice(0, 240),
            email: email.toLowerCase(),
            telefon: hit.phones[0] ?? null,
            website: hit.url,
            stadt: ort || job.ort,
            quelle_url: hit.url,
            quelle_typ: "cron-suche",
            gerichtsgutachter: job.gerichtsgutachter,
            status: "neu",
          };
          const s = scoreLead(base);
          rows.push({ ...base, qualitaet_score: s.score, qualitaets_merkmale: s.merkmale });
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

      // Rotation: nächster Query-Block; wenn alle Varianten durch → nächste Stadt
      const totalQueries = (res.queries ?? []).length || offset + STEP;
      let nextOffset = offset + STEP;
      let nextCityIdx = cityIdx;
      if (nextOffset >= totalQueries) {
        nextOffset = 0;
        nextCityIdx = (cityIdx + 1) % cities.length;
      }

      await supabaseAdmin
        .from("search_jobs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          last_run_at: new Date().toISOString(),
          last_hit_count: hitCount,
          query_offset: nextOffset,
          city_index: nextCityIdx,
        } as any)
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
