## Ziel

Neuer Tab **„Ausschreibungen"** in der IMB-App. Du siehst aktuelle öffentliche Ausschreibungen (medizinische Gutachten, Sachverständigenleistungen, ärztliche Dienstleistungen) aus den wichtigsten Portalen – europaweit, deutschlandweit, international – sortiert nach Wichtigkeit. Portale werden Schritt für Schritt angebunden; pro Portal siehst du klar, ob es „live", „nur Suchlink" oder „noch nicht verbunden" ist.

## 1. Portal-Priorisierung (nach Wichtigkeit für IMB)

**Stufe 1 – Pflicht (EU-weit, offizielle Quellen, offene APIs):**
1. **TED – Tenders Electronic Daily** (EU-Amtsblatt, alle EU-Ausschreibungen über Schwellenwert) – offizielle JSON-API verfügbar
2. **eForms-DE / Bund.de Datenservice öffentlicher Einkauf** (Deutschland, offen)
3. **Vergabe24 / Deutsches Vergabeportal (DTVP)** – Suchlink + RSS

**Stufe 2 – Wichtige deutschsprachige Portale:**
4. **Service.bund.de** (Bundesverwaltung)
5. **evergabe-online.de** (Beschaffungsamt BMI)
6. **subreport ELViS**
7. **Vergabemarktplatz NRW / Bayern / BW** (Landesportale)
8. **Vergabeportal Österreich (ANKÖ)** + **simap.ch** (Schweiz)

**Stufe 3 – International / spezialisiert:**
9. **UN Global Marketplace (UNGM)** – WHO, UNICEF, UNDP
10. **World Bank Procurement**
11. **NHS Supply Chain / Contracts Finder (UK)**
12. **BOAMP (FR)**, **PLACE (FR)**, **Portale Acquisti (IT)**

Jedes Portal bekommt einen Eintrag mit: Name, Land/Region, Wichtigkeit (1–3), Verbindungstyp (`api` / `rss` / `suchlink` / `manuell`), Status (`live` / `geplant` / `manuell`), Such-URL-Vorlage, Hinweise zur Anmeldung.

## 2. Was sofort live geht (ohne weitere Logins)

- **TED-API**: vollwertige Suche nach CPV-Codes (medizinische Dienstleistungen: 85100000, Sachverständigengutachten: 71319000/71621000, Übersetzung medizinischer Befunde etc.) – Ergebnisse direkt in der App
- **Service.bund.de / Bund.de**: offene Suche (Suchlink-Modus mit vorbereiteten Queries)
- **Alle übrigen Portale**: vorkonfigurierte **Tiefen-Suchlinks** („Auf Portal öffnen"), damit du sofort den richtigen Trefferbereich erreichst, auch bevor ein Login eingerichtet ist

## 3. UI

Neuer Tab **„Ausschreibungen"** mit zwei Unter-Bereichen:

**a) Aktuelle Treffer** (Default-Ansicht)
- Filter: Land, CPV-Bereich, Zeitraum, Schwellenwert, Sprache
- Liste: Titel · Auftraggeber · Land · Frist · Wert · Quelle-Badge · Aktionen (Detail · auf Portal öffnen · in Watchlist)
- Status-Badge pro Treffer: „neu" / „beobachtet" / „beworben" / „verworfen"
- Realtime-Update wenn der Hintergrund-Cron neue Treffer einträgt

**b) Portale & Verbindungen**
- Tabelle aller Portale, gruppiert nach Stufe 1/2/3
- Pro Portal: Status-Badge, „Konto verbinden"-Button (öffnet portalspezifische Anleitung), Toggle „in Dauer-Suche aufnehmen"
- Hinweis-Karte: „Für vollautomatischen Login bei [Portal X] brauchen wir folgende Daten…" – wir fragen erst, wenn du das Portal aktivierst

## 4. Datenbank (Lovable Cloud)

Neue Tabellen:
- **tender_portals** – Stammdaten der Portale (Wichtigkeit, Verbindungstyp, Such-URL-Vorlage, Status). Wird per Migration mit den o.g. Portalen geseedet.
- **tenders** – gefundene Ausschreibungen (`portal_id`, `extern_id`, `titel`, `auftraggeber`, `land`, `cpv`, `frist`, `wert`, `waehrung`, `url`, `beschreibung`, `status` `neu`/`beobachtet`/`beworben`/`verworfen`, `notiz`, `gefunden_am`). Unique pro `portal_id + extern_id`.
- **tender_search_jobs** – gespeicherte Suchen (CPV-Set, Länder, Schlagworte, aktiv-Flag) für die Dauersuche.

RLS + GRANTs gemäß Konvention. Realtime auf `tenders`.

## 5. Server-Logik

- `src/lib/tenders.functions.ts`: `listTenders`, `updateTenderStatus`, `listPortals`, `togglePortal`, `listSearchJobs`, `upsertSearchJob`, `runTedSearch` (TED-API)
- `src/routes/api/public/hooks/tenders-tick.ts`: stündlicher Cron, ruft TED-API + RSS-Quellen ab, schreibt neue Treffer in `tenders`
- pg_cron: `15 * * * *` (versetzt zum bestehenden Ärzte-Cron um Last zu verteilen)

## 6. Schrittweise Portal-Anbindung

Wenn du in der UI „Konto verbinden" für ein Stufe-2/3-Portal anklickst:
1. Wir zeigen dir, welche Zugangsdaten/API-Keys das Portal anbietet
2. Du legst das Konto beim Portal an (Anleitung in der App)
3. Du gibst uns den Key/Login → wir speichern als Secret
4. Sobald Secret vorhanden, springt das Portal in der Liste auf „live" und wird vom Cron mitgezogen

Solange ein Portal nicht verbunden ist: bleibt im **Suchlink-Modus** – du kommst mit einem Klick zur richtigen Trefferseite, ohne dass Treffer importiert werden.

## 7. Was du nach Freigabe tust

1. **Plan freigeben** – ich baue Stufe 1 (TED live + alle Portale als Suchlink + UI + Cron)
2. Optional gleich danach: einzelne Stufe-2-Portale freischalten, ich frage dann gezielt nach den Zugangsdaten pro Portal

## Technische Notizen

- TED-API: `https://api.ted.europa.eu/v3/notices/search`, kein API-Key nötig, CPV-Filter via Expert-Query
- CPV-Vorauswahl medizinisch: 85100000 (Gesundheitsdienste), 85120000 (ärztliche Praxis), 85140000 (sonstige Gesundheitsdienste), 71319000 (Sachverständigendienste), 79419000 (Beratungsdienste im Bewertungsbereich), 79530000 (Übersetzung)
- Cron-Auth wie bisher per `apikey`-Header (Anon Key)
- Keine PII in `/api/public/*`-Endpunkten
