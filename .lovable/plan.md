
# Neuer Modus: „Datenschutz" neben „Gutachten"

Ziel: eigener Bereich für deine DSB-Akquise im Gesundheitswesen, sauber getrennt von der bestehenden Gutachten-Akquise – gleiches Login, gleiche Tabellen, aber alle Daten sind pro Modus gefiltert.

## Umschalter oben in der App

- Neuer Segmented-Switch im Header: **Gutachten | Datenschutz**.
- Ausgewählter Modus wird pro Nutzer gespeichert (localStorage + URL-Search-Param `?modus=dsb`), damit Refresh und geteilte Links funktionieren.
- Der Modus wird an alle Panels (Suche, Leads, Vorlagen, Outlook/Gmail-Ansicht, Ausschreibungen) durchgereicht.

## Datenmodell – ein neues Feld, sonst nichts verschieben

Neue Spalte `mode` auf:
- `leads` → `mode text not null default 'gutachten'` (Werte: `gutachten` | `dsb`)
- `email_templates` → dito
- `source_searches` → dito
- `tender_search_jobs` / `tenders` → dito (damit du DSB-relevante Ausschreibungen separat verwalten kannst)

Vorteile: keine doppelten Tabellen, RLS bleibt unverändert (weiterhin `auth.uid()`), Bestandsdaten laufen automatisch als „gutachten" weiter.

Indizes: `(user_id, mode)` auf `leads`, `source_searches`, `email_templates`.

## Recherche-Presets für DSB (Zielgruppen)

Neue Standard-Presets, die beim ersten Wechsel in den DSB-Modus einmalig für den Nutzer angelegt werden (leer editierbar):

- **Arztpraxen & MVZ (DE)** – Suchbegriffe: „Arztpraxis", „MVZ", „Hausarzt", „Facharzt" + Region.
- **Kliniken & Reha** – „Krankenhaus", „Klinik", „Reha-Klinik", „Tagesklinik".
- **Zahnärzte, Physio, Heilpraktiker** – jeweils eigenes Preset.
- **Apotheken, Pflegedienste, Labore** – jeweils eigenes Preset.

Jedes Preset schreibt `mode='dsb'` in die neuen Leads, damit sie nur im DSB-Bereich auftauchen.

Fachgebiet-Feld auf Leads wird im DSB-Modus mit der Zielgruppe (z. B. „Zahnarztpraxis") belegt.

## Vorlagen-Bereich

- Vorlagen-Panel filtert nach aktuellem Modus.
- Im DSB-Modus zeigt es zunächst nur eine leere Kategorie „Datenschutz" – du schreibst die Anschreiben selbst (wie gewünscht).
- Vorhandene Gutachten-Vorlagen bleiben im Gutachten-Modus sichtbar, im DSB-Modus unsichtbar.

## Mail-Integration (Outlook + Gmail)

- Beim Anlegen von Entwürfen wird das Vorlagen-Dropdown ebenfalls modus-gefiltert.
- Sync (Sent / Reply / Bounce) läuft unverändert für alle Leads beider Modi – nur die Anzeige ist getrennt.
- Optional: eigene Label-/Ordner-Hierarchie `Datenschutz/[Zielgruppe]` in Gmail/Outlook, parallel zu `Leads/[Land]/[Fachgebiet]` für Gutachten.

## UI-Änderungen (Frontend)

- `src/routes/index.tsx`: Header-Switch `Gutachten | Datenschutz`, gemeinsamer `ModeProvider` (React Context) für alle Panels.
- Farbliche Kennung: dezenter Badge/Untertitel („Modus: Datenschutz"), Primärfarbe unverändert – bleibt seriös.
- Alle Listen (`LeadsList`, `MarketingPanel`, `TemplatesPanel`, `SearchPanel`, `TendersPanel`) lesen `mode` aus Context und übergeben ihn an alle Server-Funktionsaufrufe.
- CSV-Import legt Leads ebenfalls im aktuell aktiven Modus an.

## Server-Funktionen anpassen

Nur zusätzliche `mode`-Parameter, keine neuen Endpunkte:
- `sources.functions.ts`: `runSourceSearch`, `listSources`, `upsertSource` bekommen `mode`.
- `marketing.functions.ts` (Leads-CRUD): `listLeads`, `createLead`, `updateLead`, `importLeadsCsv` bekommen `mode`.
- `gmail.functions.ts` / Outlook-Pendant: `createDraft` liest `mode` für Vorlagen-Auswahl und Labels.
- `tenders.functions.ts`: Filter nach `mode`.

Fallback: fehlt der Parameter, gilt `gutachten` (Rückwärtskompatibilität).

## Migrations-Reihenfolge (eine Migration)

1. `ALTER TABLE` für `mode`-Spalten mit Default `'gutachten'`.
2. Check-Constraint `mode IN ('gutachten','dsb')`.
3. Indizes anlegen.
4. Bestehende Zeilen bleiben `gutachten`.

## Was NICHT geändert wird

- Bestehende Gutachten-Recherche, -Leads, -Vorlagen, -Outlook/Gmail-Logik – funktional unverändert.
- RLS-Policies, Auth, Bezahlung/Sekrete.
- Keine Team-Funktionen, keine neue Route – alles im bekannten Dashboard, nur mit Modus-Umschalter.

## Optionale Erweiterung (später, jetzt nicht enthalten)

- Eigene DSB-spezifische Lead-Felder (z. B. „Anzahl Mitarbeiter", „Verarbeitungsverzeichnis vorhanden") – kann später als JSON-Feld `mode_data` ergänzt werden, ohne die Kern-Tabelle aufzublähen.
