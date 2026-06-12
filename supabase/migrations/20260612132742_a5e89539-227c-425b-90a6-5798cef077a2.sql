-- Erweiterung leads: Antwort + Bounce + Folder-Zuordnung
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outlook_folder_id TEXT;

-- Outlook-Ordner-Mapping
CREATE TABLE IF NOT EXISTS public.outlook_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  land TEXT NOT NULL,
  fachgebiet TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  folder_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (land, fachgebiet)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlook_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlook_folders TO anon;
GRANT ALL ON public.outlook_folders TO service_role;

ALTER TABLE public.outlook_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outlook_folders readable by all" ON public.outlook_folders FOR SELECT USING (true);
CREATE POLICY "outlook_folders insertable by all" ON public.outlook_folders FOR INSERT WITH CHECK (true);
CREATE POLICY "outlook_folders updatable by all" ON public.outlook_folders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "outlook_folders deletable by all" ON public.outlook_folders FOR DELETE USING (true);

CREATE TRIGGER outlook_folders_touch BEFORE UPDATE ON public.outlook_folders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Sync-State (Singleton-Row)
CREATE TABLE IF NOT EXISTS public.outlook_sync_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_sent_check_at TIMESTAMPTZ,
  last_inbox_check_at TIMESTAMPTZ,
  last_bounce_check_at TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  last_summary JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.outlook_sync_state TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.outlook_sync_state TO anon;
GRANT ALL ON public.outlook_sync_state TO service_role;

ALTER TABLE public.outlook_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outlook_sync_state readable by all" ON public.outlook_sync_state FOR SELECT USING (true);
CREATE POLICY "outlook_sync_state insertable by all" ON public.outlook_sync_state FOR INSERT WITH CHECK (true);
CREATE POLICY "outlook_sync_state updatable by all" ON public.outlook_sync_state FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER outlook_sync_state_touch BEFORE UPDATE ON public.outlook_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.outlook_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;