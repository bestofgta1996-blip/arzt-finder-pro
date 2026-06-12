
-- tender_portals
CREATE TABLE public.tender_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  land text NOT NULL,
  region text,
  wichtigkeit smallint NOT NULL DEFAULT 3,
  verbindungstyp text NOT NULL DEFAULT 'suchlink',
  status text NOT NULL DEFAULT 'geplant',
  such_url_vorlage text,
  homepage text,
  anmelde_hinweis text,
  aktiv boolean NOT NULL DEFAULT true,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tender_portals TO anon, authenticated;
GRANT ALL ON public.tender_portals TO service_role;
ALTER TABLE public.tender_portals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tender_portals readable by all" ON public.tender_portals FOR SELECT USING (true);
CREATE POLICY "tender_portals insertable by all" ON public.tender_portals FOR INSERT WITH CHECK (true);
CREATE POLICY "tender_portals updatable by all" ON public.tender_portals FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "tender_portals deletable by all" ON public.tender_portals FOR DELETE USING (true);
CREATE TRIGGER tender_portals_touch BEFORE UPDATE ON public.tender_portals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- tenders
CREATE TABLE public.tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_slug text NOT NULL,
  extern_id text NOT NULL,
  titel text NOT NULL,
  auftraggeber text,
  land text,
  cpv text,
  frist timestamptz,
  wert numeric,
  waehrung text,
  url text,
  beschreibung text,
  status text NOT NULL DEFAULT 'neu',
  notiz text,
  gefunden_am timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_slug, extern_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenders TO anon, authenticated;
GRANT ALL ON public.tenders TO service_role;
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenders readable by all" ON public.tenders FOR SELECT USING (true);
CREATE POLICY "tenders insertable by all" ON public.tenders FOR INSERT WITH CHECK (true);
CREATE POLICY "tenders updatable by all" ON public.tenders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "tenders deletable by all" ON public.tenders FOR DELETE USING (true);
CREATE INDEX tenders_status_idx ON public.tenders(status);
CREATE INDEX tenders_land_idx ON public.tenders(land);
CREATE INDEX tenders_gefunden_idx ON public.tenders(gefunden_am DESC);
CREATE TRIGGER tenders_touch BEFORE UPDATE ON public.tenders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.tenders;

-- tender_search_jobs
CREATE TABLE public.tender_search_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cpv_codes text[] NOT NULL DEFAULT ARRAY['85100000','85120000','85140000','71319000','71621000','79419000','79530000']::text[],
  laender text[] NOT NULL DEFAULT ARRAY['DE','AT','CH','EU']::text[],
  schlagworte text[] NOT NULL DEFAULT ARRAY[]::text[],
  aktiv boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_hit_count integer,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tender_search_jobs TO anon, authenticated;
GRANT ALL ON public.tender_search_jobs TO service_role;
ALTER TABLE public.tender_search_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tender_jobs readable by all" ON public.tender_search_jobs FOR SELECT USING (true);
CREATE POLICY "tender_jobs insertable by all" ON public.tender_search_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "tender_jobs updatable by all" ON public.tender_search_jobs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "tender_jobs deletable by all" ON public.tender_search_jobs FOR DELETE USING (true);
CREATE TRIGGER tender_jobs_touch BEFORE UPDATE ON public.tender_search_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed portals (priority order)
INSERT INTO public.tender_portals (slug, name, land, region, wichtigkeit, verbindungstyp, status, such_url_vorlage, homepage, anmelde_hinweis) VALUES
('ted-eu', 'TED – Tenders Electronic Daily', 'EU', 'Europa', 1, 'api', 'live',
  'https://ted.europa.eu/de/search/result?search-scope=ACTIVE&query={q}',
  'https://ted.europa.eu',
  'Offene JSON-API, kein Login nötig. Wird automatisch stündlich abgefragt.'),
('bund-de', 'Bund.de – Datenservice öffentlicher Einkauf', 'DE', 'Bund', 1, 'suchlink', 'manuell',
  'https://www.bund.de/SiteGlobals/Forms/Suche/Expertensuche_Formular.html?nn=4641514&resourceId=4641482&input_=4641514&pageLocale=de&templateQueryString={q}',
  'https://www.bund.de',
  'Offene Suche, später per Datenservice-API anbindbar (eForms-DE).'),
('dtvp', 'Deutsches Vergabeportal (DTVP / Vergabe24)', 'DE', 'Bund/Länder', 1, 'suchlink', 'manuell',
  'https://www.dtvp.de/Center/company/announcements/categoryOverview.do?method=showCategoryOverview&q={q}',
  'https://www.dtvp.de',
  'Kostenloses Bieterkonto empfohlen für Volltext-Zugriff.'),
('service-bund', 'Service.bund.de', 'DE', 'Bundesverwaltung', 2, 'suchlink', 'manuell',
  'https://www.service.bund.de/Content/DE/Ausschreibungen/Suche/Formular.html?nn=4641514&resourceId=4641482&input_=4641514&pageLocale=de&templateQueryString={q}',
  'https://www.service.bund.de',
  'Offene Suche der Bundesverwaltung.'),
('evergabe-online', 'evergabe-online.de (Beschaffungsamt BMI)', 'DE', 'Bund', 2, 'manuell', 'geplant',
  'https://www.evergabe-online.de/search.html?0&suchwort={q}',
  'https://www.evergabe-online.de',
  'Bieterkonto nötig. Für API-Zugang Login + Zertifikat anfragen.'),
('subreport-elvis', 'subreport ELViS', 'DE', 'Bund/Kommunen', 2, 'manuell', 'geplant',
  'https://www.subreport.de/elvis/?search={q}',
  'https://www.subreport.de',
  'Kostenloses Bieterkonto bei subreport.'),
('vmp-nrw', 'Vergabemarktplatz NRW', 'DE', 'NRW', 2, 'suchlink', 'manuell',
  'https://www.vergabe.nrw.de/VMPSatellite/public/company/project/CXP4YYDY5NU/de/overview?6&searchString={q}',
  'https://www.vergabe.nrw.de',
  'Offen einsehbar, Bieterkonto für Teilnahme.'),
('vmp-bayern', 'Vergabe Bayern', 'DE', 'Bayern', 2, 'suchlink', 'manuell',
  'https://www.vergabe.bayern.de/NetServer/PublicationSearchControllerServlet?function=SearchPublications&q={q}',
  'https://www.vergabe.bayern.de',
  'Offene Suche der Bayerischen Staatsverwaltung.'),
('anko-at', 'ANKÖ – Auftragnehmerkataster Österreich', 'AT', 'Österreich', 2, 'manuell', 'geplant',
  'https://www.ausschreibungen.at/?q={q}',
  'https://www.ankoe.at',
  'Kostenpflichtiges ANKÖ-Konto für Volltext.'),
('simap-ch', 'simap.ch', 'CH', 'Schweiz', 2, 'suchlink', 'manuell',
  'https://www.simap.ch/shabforms/COMMON/search/searchForm.jsf?q={q}',
  'https://www.simap.ch',
  'Offene Suche der Schweizer Bundesverwaltung.'),
('ungm', 'UN Global Marketplace (UNGM)', 'INT', 'Vereinte Nationen', 3, 'manuell', 'geplant',
  'https://www.ungm.org/Public/Notice?Title={q}',
  'https://www.ungm.org',
  'Kostenloses UNGM-Vendor-Konto für Volltext + Bewerbung.'),
('world-bank', 'World Bank Procurement', 'INT', 'Weltbank', 3, 'suchlink', 'manuell',
  'https://projects.worldbank.org/en/projects-operations/procurement?searchTerm={q}',
  'https://projects.worldbank.org',
  'Offene Suche, für Bewerbung Lieferantenregistrierung.'),
('uk-contracts-finder', 'UK Contracts Finder', 'UK', 'Vereinigtes Königreich', 3, 'suchlink', 'manuell',
  'https://www.contractsfinder.service.gov.uk/Search?Keywords={q}',
  'https://www.contractsfinder.service.gov.uk',
  'Offen, für Find-a-Tender API ist Registrierung beim Cabinet Office nötig.'),
('boamp-fr', 'BOAMP (Frankreich)', 'FR', 'Frankreich', 3, 'suchlink', 'manuell',
  'https://www.boamp.fr/pages/recherche/?q={q}',
  'https://www.boamp.fr',
  'Offene Suche, REST-API über data.gouv.fr verfügbar.'),
('place-fr', 'PLACE (Frankreich)', 'FR', 'Frankreich', 3, 'manuell', 'geplant',
  'https://www.marches-publics.gouv.fr/?page=Entreprise.EntrepriseAdvancedSearch&AllCons&keyWord={q}',
  'https://www.marches-publics.gouv.fr',
  'Bieterkonto nötig.');
