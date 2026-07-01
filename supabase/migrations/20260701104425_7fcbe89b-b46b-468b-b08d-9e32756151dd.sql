-- Add mode column to all mode-scoped tables
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'gutachten';
ALTER TABLE public.leads ADD CONSTRAINT leads_mode_check CHECK (mode IN ('gutachten','dsb'));

ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'gutachten';
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_mode_check CHECK (mode IN ('gutachten','dsb'));

ALTER TABLE public.source_searches ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'gutachten';
ALTER TABLE public.source_searches ADD CONSTRAINT source_searches_mode_check CHECK (mode IN ('gutachten','dsb'));

ALTER TABLE public.search_jobs ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'gutachten';
ALTER TABLE public.search_jobs ADD CONSTRAINT search_jobs_mode_check CHECK (mode IN ('gutachten','dsb'));

ALTER TABLE public.tender_search_jobs ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'gutachten';
ALTER TABLE public.tender_search_jobs ADD CONSTRAINT tender_search_jobs_mode_check CHECK (mode IN ('gutachten','dsb'));

ALTER TABLE public.tenders ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'gutachten';
ALTER TABLE public.tenders ADD CONSTRAINT tenders_mode_check CHECK (mode IN ('gutachten','dsb'));

-- Indexes for fast mode filtering
CREATE INDEX IF NOT EXISTS leads_mode_idx ON public.leads(mode);
CREATE INDEX IF NOT EXISTS email_templates_mode_idx ON public.email_templates(mode);
CREATE INDEX IF NOT EXISTS source_searches_mode_idx ON public.source_searches(mode);
CREATE INDEX IF NOT EXISTS search_jobs_mode_idx ON public.search_jobs(mode);
CREATE INDEX IF NOT EXISTS tender_search_jobs_mode_idx ON public.tender_search_jobs(mode);
CREATE INDEX IF NOT EXISTS tenders_mode_idx ON public.tenders(mode);