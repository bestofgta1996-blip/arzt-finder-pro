-- Rotationszustand für den automatischen Kartenrecherche-Tick (gmaps-tick.ts).
-- Singleton-Row wie bei outlook_sync_state/gmail_sync_state.
CREATE TABLE IF NOT EXISTS public.gmaps_tick_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  zielgruppe_idx INT NOT NULL DEFAULT 0,
  plz_idx INT NOT NULL DEFAULT 0,
  source_idx INT NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_summary JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.gmaps_tick_state TO authenticated, anon;
GRANT ALL ON public.gmaps_tick_state TO service_role;

ALTER TABLE public.gmaps_tick_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmaps_tick_state readable by all" ON public.gmaps_tick_state FOR SELECT USING (true);
CREATE POLICY "gmaps_tick_state insertable by all" ON public.gmaps_tick_state FOR INSERT WITH CHECK (true);
CREATE POLICY "gmaps_tick_state updatable by all" ON public.gmaps_tick_state FOR UPDATE USING (true);

CREATE TRIGGER gmaps_tick_state_touch BEFORE UPDATE ON public.gmaps_tick_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.gmaps_tick_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
