
-- LEADS ------------------------------------------------------------
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  land text NOT NULL,
  fachgebiet text,
  zielgruppe text,
  name text,
  email text NOT NULL,
  telefon text,
  website text,
  stadt text,
  quelle_url text,
  quelle_typ text,
  gerichtsgutachter boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'neu',
  last_contacted_at timestamptz,
  outlook_message_id text,
  notiz text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_land_email_uniq UNIQUE (land, email)
);
CREATE INDEX leads_land_idx ON public.leads (land);
CREATE INDEX leads_fachgebiet_idx ON public.leads (fachgebiet);
CREATE INDEX leads_status_idx ON public.leads (status);
CREATE INDEX leads_email_idx ON public.leads (lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads readable by all" ON public.leads FOR SELECT USING (true);
CREATE POLICY "leads insertable by all" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "leads updatable by all" ON public.leads FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "leads deletable by all" ON public.leads FOR DELETE USING (true);

-- SEARCH JOBS ------------------------------------------------------
CREATE TABLE public.search_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  land text NOT NULL,
  fachgebiet text NOT NULL,
  ort text,
  zielgruppen text[] NOT NULL DEFAULT ARRAY['gutachter','fachaerzte','kliniken'],
  gerichtsgutachter boolean NOT NULL DEFAULT false,
  aktiv boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_hit_count integer,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_jobs TO anon, authenticated;
GRANT ALL ON public.search_jobs TO service_role;
ALTER TABLE public.search_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "search_jobs readable by all" ON public.search_jobs FOR SELECT USING (true);
CREATE POLICY "search_jobs insertable by all" ON public.search_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "search_jobs updatable by all" ON public.search_jobs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "search_jobs deletable by all" ON public.search_jobs FOR DELETE USING (true);

-- SEARCH RUNS ------------------------------------------------------
CREATE TABLE public.search_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  jobs_run integer NOT NULL DEFAULT 0,
  new_leads integer NOT NULL DEFAULT 0,
  errors text
);
GRANT SELECT, INSERT, UPDATE ON public.search_runs TO anon, authenticated;
GRANT ALL ON public.search_runs TO service_role;
ALTER TABLE public.search_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "search_runs readable by all" ON public.search_runs FOR SELECT USING (true);
CREATE POLICY "search_runs insertable by all" ON public.search_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "search_runs updatable by all" ON public.search_runs FOR UPDATE USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER search_jobs_touch BEFORE UPDATE ON public.search_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
