import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-Endpunkt für Ausschreibungen. Wird stündlich von pg_cron getriggert.
 * Pfad: /api/public/hooks/tenders-tick
 */
export const Route = createFileRoute("/api/public/hooks/tenders-tick")({
  server: {
    handlers: {
      GET: async () => run(),
      POST: async () => run(),
    },
  },
});

async function run(): Promise<Response> {
  try {
    const { runTenderTick } = await import("@/lib/tenders.server");
    const result = await runTenderTick();
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
