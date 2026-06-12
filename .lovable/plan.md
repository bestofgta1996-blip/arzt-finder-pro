## Ziel

Pro Land (DE, PL, UK, FR, IT, ES) eine eigene Marketingliste mit allen Fachrichtungen + allen gefundenen Ärzten/Gutachtern mit E-Mail. Die Suche läuft stündlich automatisch im Hintergrund (Cron). Pro Lead wird angezeigt, ob er bereits per Outlook angeschrieben wurde.

## 1. Datenbank (Lovable Cloud)

Neue Tabellen:

- **leads** – persistent, alle Treffer aller Länder
  - `id`, `land`, `fachgebiet`, `zielgruppe`, `name`, `email` (unique pro land+email), `telefon`, `website`, `stadt`, `quelle_url`, `gerichtsgutachter`, `status` (`neu` / `angeschrieben` / `geantwortet` / `kunde` / `nicht_relevant`), `last_contacted_at`, `outlook_message_id`, `notiz`, `erstellt_am`, `updated_at`
- **search_jobs** – was die Hintergrundsuche stündlich durchläuft
  - `id`, `land`, `fachgebiet`, `zielgruppen[]`, `ort`, `gerichtsgutachter`, `aktiv`, `last_run_at`, `last_hit_count`
- **search_runs** – Log: wann, wie viele neue Treffer, Fehler

RLS: nur `authenticated`. GRANTs gemäß Konvention.

## 2. Server-Logik

Neue Server-Funktionen in `src/lib/leads.functions.ts`:

- `listLeads({ land })` – liefert alle Leads des Landes, sortiert nach Fachgebiet
- `upsertLeads(rows[])` – Dedupe per `land + email`
- `updateLeadStatus({ id, status, notiz })`
- `listSearchJobs()`, `upsertSearchJob(...)`, `deleteSearchJob(id)`
- `syncOutlookContacted()` – matcht Outlook-Sent-Mails gegen Leads (no-op solange Outlook nicht verbunden)

Neue Public-Route `src/routes/api/public/hooks/search-tick.ts`:
- wird stündlich von pg_cron aufgerufen
- holt aktive `search_jobs`, ruft die bestehende `searchDoctors`-Pipeline auf, schreibt neue E-Mails als Leads in die DB

pg_cron-Eintrag: `0 * * * *` ruft die Hook-URL mit `apikey`-Header auf.

## 3. UI

- Neuer Tab/Bereich „Marketinglisten" mit Unter-Tabs DE / PL / UK / FR / IT / ES
- Pro Land: Tabelle der Leads, gruppiert nach Fachgebiet, mit Spalten E-Mail · Status · Angeschrieben am · Quelle · Aktion
- Status-Badge: grün „angeschrieben" (aus Outlook-Sync oder manuell), grau „neu"
- Such-Panel bekommt Knopf „Als Dauersuche speichern" → schreibt einen `search_jobs`-Eintrag
- Verzeichnis-Scan-Treffer landen direkt in der Marketingliste des aktuellen Landes
- Manueller Toggle „Angeschrieben markieren" pro Lead (solange Outlook nicht verbunden)
- Hinweis-Banner: „Outlook verbinden für Auto-Abgleich" mit Connect-Button

## 4. Outlook-Anbindung (vorbereitet)

- Code-Pfad `syncOutlookContacted` ist gebaut und prüft `process.env.MICROSOFT_OUTLOOK_API_KEY`
- Solange nicht verbunden: gibt freundlich Bescheid, kein Crash
- Sobald du den Outlook-Connector freigibst, läuft der Sync automatisch (matcht Empfänger-E-Mail gegen Leads, setzt `status=angeschrieben` + `last_contacted_at` + `outlook_message_id`)

## 5. Migration der bestehenden lokalen Leads

Der bestehende lokale Lead-Store (`localStorage`) bekommt einen Button „In Cloud-Marketingliste übernehmen", der vorhandene Leads in die DB hochlädt. Danach ist die Cloud die führende Quelle.

## Was du nach Genehmigung tun musst

1. Plan freigeben
2. Anschließend Outlook-Connector verbinden, damit der Auto-Abgleich aktiv wird (kann auch später passieren)

## Technische Notizen

- Cron-Auth via `apikey`-Header (Supabase Anon Key) – kein zusätzliches Secret
- Firecrawl bleibt bestehen, wird nur jetzt serverseitig vom Cron-Hook getriggert
- Bestehende `searchDoctors` / `scanDirectoriesForEmails` werden wiederverwendet
- Realtime auf `leads` aktivieren, damit die Liste live aktualisiert wird, wenn der Cron neue Treffer einträgt
