
-- Drop all permissive policies
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename IN (
             'leads','email_templates','gmail_labels','gmail_sync_state',
             'outlook_folders','outlook_sync_state','search_jobs','search_runs',
             'source_searches','tender_portals','tender_search_jobs','tenders'
           )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Revoke access from anon/authenticated on all these tables
REVOKE ALL ON public.leads, public.email_templates, public.gmail_labels, public.gmail_sync_state,
  public.outlook_folders, public.outlook_sync_state, public.search_jobs, public.search_runs,
  public.source_searches, public.tender_portals, public.tender_search_jobs, public.tenders
  FROM anon, authenticated;

GRANT ALL ON public.leads, public.email_templates, public.gmail_labels, public.gmail_sync_state,
  public.outlook_folders, public.outlook_sync_state, public.search_jobs, public.search_runs,
  public.source_searches, public.tender_portals, public.tender_search_jobs, public.tenders
  TO service_role;

-- Ensure RLS is enabled (default deny)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlook_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlook_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tender_portals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tender_search_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;

-- Remove leads from realtime publication if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='leads') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.leads';
  END IF;
END $$;
