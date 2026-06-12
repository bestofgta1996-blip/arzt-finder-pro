
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qualitaet_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qualitaets_merkmale text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS leads_score_idx ON public.leads (qualitaet_score DESC, erstellt_am DESC);

ALTER TABLE public.tenders
  ADD COLUMN IF NOT EXISTS qualitaet_score integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS tenders_score_idx ON public.tenders (qualitaet_score DESC, gefunden_am DESC);
