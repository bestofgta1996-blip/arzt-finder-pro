CREATE TABLE public.source_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quelle TEXT NOT NULL,
  fachgebiet TEXT NOT NULL,
  ort TEXT,
  land TEXT NOT NULL DEFAULT 'DE',
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  found INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  ok BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_searches TO authenticated, anon;
GRANT ALL ON public.source_searches TO service_role;

ALTER TABLE public.source_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "source_searches readable by all" ON public.source_searches FOR SELECT USING (true);
CREATE POLICY "source_searches insertable by all" ON public.source_searches FOR INSERT WITH CHECK (true);
CREATE POLICY "source_searches deletable by all" ON public.source_searches FOR DELETE USING (true);

CREATE INDEX source_searches_quelle_idx ON public.source_searches (quelle, erstellt_am DESC);