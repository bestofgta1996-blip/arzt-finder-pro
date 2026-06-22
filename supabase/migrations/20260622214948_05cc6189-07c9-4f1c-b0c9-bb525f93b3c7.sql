-- Email templates
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zielgruppe TEXT NOT NULL,
  sprache TEXT NOT NULL DEFAULT 'de',
  betreff TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (zielgruppe, sprache, betreff)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated, anon;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_templates readable by all" ON public.email_templates FOR SELECT USING (true);
CREATE POLICY "email_templates insertable by all" ON public.email_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "email_templates updatable by all" ON public.email_templates FOR UPDATE USING (true);
CREATE POLICY "email_templates deletable by all" ON public.email_templates FOR DELETE USING (true);

CREATE TRIGGER email_templates_touch BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Gmail sync state
CREATE TABLE public.gmail_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_sent_check_at TIMESTAMPTZ,
  last_inbox_check_at TIMESTAMPTZ,
  last_bounce_check_at TIMESTAMPTZ,
  last_full_sync_at TIMESTAMPTZ,
  last_summary JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_sync_state TO authenticated, anon;
GRANT ALL ON public.gmail_sync_state TO service_role;
ALTER TABLE public.gmail_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmail_sync_state readable by all" ON public.gmail_sync_state FOR SELECT USING (true);
CREATE POLICY "gmail_sync_state insertable by all" ON public.gmail_sync_state FOR INSERT WITH CHECK (true);
CREATE POLICY "gmail_sync_state updatable by all" ON public.gmail_sync_state FOR UPDATE USING (true);

-- Gmail labels
CREATE TABLE public.gmail_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  land TEXT NOT NULL,
  fachgebiet TEXT NOT NULL,
  label_id TEXT NOT NULL,
  label_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (land, fachgebiet)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_labels TO authenticated, anon;
GRANT ALL ON public.gmail_labels TO service_role;
ALTER TABLE public.gmail_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmail_labels readable by all" ON public.gmail_labels FOR SELECT USING (true);
CREATE POLICY "gmail_labels insertable by all" ON public.gmail_labels FOR INSERT WITH CHECK (true);
CREATE POLICY "gmail_labels updatable by all" ON public.gmail_labels FOR UPDATE USING (true);
CREATE POLICY "gmail_labels deletable by all" ON public.gmail_labels FOR DELETE USING (true);

-- Leads: Gmail-Spalten
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS gmail_draft_id TEXT,
  ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS gmail_message_id TEXT,
  ADD COLUMN IF NOT EXISTS gmail_label_id TEXT;

-- Default-Vorlagen
INSERT INTO public.email_templates (zielgruppe, sprache, betreff, body_text, is_default) VALUES
  ('anwaelte', 'de',
   'Medizinische Begutachtung – Kooperation Kanzlei {name}',
   E'Sehr geehrte Damen und Herren,\n\nim Bereich {fachgebiet} unterstützt das Institut für Medizinische Begutachtung (IMB) Kanzleien in {stadt} mit unabhängigen medizinischen Gutachten zu Kausalität, MdE/GdB und Berufsunfähigkeit.\n\nWir arbeiten bundesweit, halten Fristen verlässlich ein und liefern gerichtsfeste Gutachten in der Sprache, die Versicherer und Gerichte erwarten.\n\nDarf ich Ihnen unverbindlich unser Leistungsspektrum sowie eine Übersicht typischer Honorarrahmen zusenden?\n\nMit freundlichen Grüßen\nIhr IMB-Team',
   true),
  ('gutachter', 'de',
   'Netzwerk medizinischer Gutachter – {fachgebiet} in {stadt}',
   E'Sehr geehrte Kollegin, sehr geehrter Kollege,\n\ndas Institut für Medizinische Begutachtung (IMB) baut sein bundesweites Netzwerk im Bereich {fachgebiet} weiter aus und sucht erfahrene Gutachter:innen in {stadt} und Umgebung.\n\nWir vermitteln Aufträge von Versicherungen, Anwaltskanzleien und Gerichten, übernehmen die komplette Auftragsabwicklung und sorgen für eine pünktliche Vergütung.\n\nWenn Interesse an einer Zusammenarbeit besteht, sende ich Ihnen gerne unsere Konditionen sowie ein kurzes Aufnahmegespräch zu.\n\nMit freundlichen Grüßen\nIhr IMB-Team',
   true),
  ('kliniken', 'de',
   'Medizinische Begutachtung – Kooperation mit {name}',
   E'Sehr geehrte Damen und Herren,\n\ndas Institut für Medizinische Begutachtung (IMB) kooperiert bundesweit mit Kliniken im Bereich {fachgebiet} – als Zuweiser, Zweitmeinungspartner und für versicherungsmedizinische Fragestellungen.\n\nFür Ihr Haus in {stadt} würde ich gerne unverbindlich vorstellen, wie eine Zusammenarbeit aussehen kann und welche Vorteile sich daraus für Ihre Patienten und Ihre Abrechnung ergeben.\n\nDarf ich Ihnen Unterlagen zusenden oder einen kurzen Termin vereinbaren?\n\nMit freundlichen Grüßen\nIhr IMB-Team',
   true),
  ('versicherungen', 'de',
   'Unabhängige medizinische Gutachten – IMB',
   E'Sehr geehrte Damen und Herren,\n\ndas Institut für Medizinische Begutachtung (IMB) erstellt unabhängige medizinische Gutachten für Versicherungen im Bereich {fachgebiet} – qualitätsgesichert, fristgerecht und nach den anerkannten Richtlinien (AWMF, BG, RVO).\n\nGerne stelle ich Ihnen unsere Leistungen, Bearbeitungszeiten und Honorarmodelle vor.\n\nMit freundlichen Grüßen\nIhr IMB-Team',
   true);