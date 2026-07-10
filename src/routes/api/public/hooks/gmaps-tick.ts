import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-getriggerter Endpunkt: rotiert automatisch durch Zielgruppen × PLZ ×
 * Quelle (Google Maps / OpenStreetMap) und sammelt Leads im Datenschutz-Modus,
 * ganz ohne offenen Browser-Tab. Pfad: /api/public/hooks/gmaps-tick
 */
export const Route = createFileRoute("/api/public/hooks/gmaps-tick")({
  server: {
    handlers: {
      GET: async () => runTick(),
      POST: async () => runTick(),
    },
  },
});

// Repräsentative PLZ großer Städte – deckt über die Zeit weite Teile von DE ab.
const PLZ_LIST = [
  "10115", // Berlin
  "20095", // Hamburg
  "80331", // München
  "50667", // Köln
  "60311", // Frankfurt
  "70173", // Stuttgart
  "40213", // Düsseldorf
  "04109", // Leipzig
  "44135", // Dortmund
  "45127", // Essen
  "28195", // Bremen
  "01067", // Dresden
  "30159", // Hannover
  "90402", // Nürnberg
  "47051", // Duisburg
  "44787", // Bochum
  "42103", // Wuppertal
  "33602", // Bielefeld
  "53111", // Bonn
  "48143", // Münster
  "68159", // Mannheim
  "76133", // Karlsruhe
  "86150", // Augsburg
  "65183", // Wiesbaden
];

interface TickState {
  zielgruppe_idx: number;
  plz_idx: number;
  source_idx: number;
}

async function runTick(): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { scrapeGoogleMapsHealthcare, scrapeOsmHealthcare, DSB_ZIELGRUPPEN } = await import(
    "@/lib/sources.functions"
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;
  const { data: stateRow } = await admin
    .from("gmaps_tick_state")
    .select("zielgruppe_idx,plz_idx,source_idx")
    .eq("id", 1)
    .maybeSingle();
  const state: TickState = (stateRow as TickState | null) ?? {
    zielgruppe_idx: 0,
    plz_idx: 0,
    source_idx: 0,
  };

  const zielgruppe = DSB_ZIELGRUPPEN[state.zielgruppe_idx % DSB_ZIELGRUPPEN.length];
  const plz = PLZ_LIST[state.plz_idx % PLZ_LIST.length];
  const source = state.source_idx % 2 === 0 ? "gmaps" : "osm";

  let result: { ok: boolean; error?: string; found: number; inserted: number; places: number } = {
    ok: false,
    found: 0,
    inserted: 0,
    places: 0,
  };
  try {
    const runner = source === "gmaps" ? scrapeGoogleMapsHealthcare : scrapeOsmHealthcare;
    const r = await runner({
      data: { zielgruppe, plz, radiusKm: 15, limit: 150, mode: "dsb" },
    });
    result = { ok: r.ok, error: r.error, found: r.found, inserted: r.inserted, places: r.places };
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "unknown", found: 0, inserted: 0, places: 0 };
  }

  // Rotation weiterschalten, unabhängig vom Erfolg – ein einzelner fehlgeschlagener
  // Kombination soll den Tick nicht dauerhaft blockieren.
  let nextPlzIdx = state.plz_idx + 1;
  let nextZielgruppeIdx = state.zielgruppe_idx;
  let nextSourceIdx = state.source_idx;
  if (nextPlzIdx >= PLZ_LIST.length) {
    nextPlzIdx = 0;
    nextZielgruppeIdx += 1;
  }
  if (nextZielgruppeIdx >= DSB_ZIELGRUPPEN.length) {
    nextZielgruppeIdx = 0;
    nextSourceIdx = (nextSourceIdx + 1) % 2;
  }

  await admin.from("gmaps_tick_state").upsert({
    id: 1,
    zielgruppe_idx: nextZielgruppeIdx,
    plz_idx: nextPlzIdx,
    source_idx: nextSourceIdx,
    last_run_at: new Date().toISOString(),
    last_summary: { zielgruppe, plz, source, ...result },
  });

  return Response.json({ zielgruppe, plz, source, ...result });
}
