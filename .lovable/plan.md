
## Ziel

Die Karten-Recherche im Datenschutz-Modus einmalig automatisch durchlaufen lassen, bis **mindestens 100 Leads mit E-Mail** in der Marketingliste stehen. Dabei sowohl Google Maps als auch OpenStreetMap nutzen, Fehler beheben falls die Suche aktuell nicht läuft.

## Vorgehen

### 1. Runtime-Fehler prüfen
Aktuell meldet die Vorschau `TypeError: null is not an object (evaluating 'resolveDispatcher().use')` – das ist ein React-Hook-Fehler aus `AwaitInner` (TanStack Router). Vor dem Testlauf checken, ob das die Suche blockiert, und ggf. die betroffene Stelle (vermutlich ein `use()`-Aufruf in einem Loader/Await) korrigieren.

### 2. Automatischer Testlauf-Modus
Neuen Button **„Testlauf bis 100"** in der Command Bar hinzufügen (nur im Datenschutz-Modus sichtbar). Beim Klick:

1. Startet mit der aktuell gewählten Zielgruppe + PLZ + Radius.
2. Ruft nacheinander `scrapeGoogleMapsHealthcare` und `scrapeOsmHealthcare` auf.
3. Wenn danach < 100 Leads mit E-Mail in der Marketingliste: automatisch mit den nächsten Zielgruppen aus `DSB_ZIELGRUPPEN` fortfahren (Reihenfolge: Arztpraxen & MVZ → Zahnärzte → Kliniken → Physiotherapie → Apotheken → Pflegedienste → Heilpraktiker → Labore).
4. Wenn Zielgruppen erschöpft und immer noch < 100: Radius um 10 km erhöhen (max. 50 km) und von vorne.
5. Abbruch sobald 100 erreicht **oder** kein neuer Treffer mehr in einer kompletten Runde (Schutz vor Endlosschleife).

### 3. Fortschrittsanzeige
Während des Laufs eine Progress-Zeile zeigen:
```
Testlauf: 47 / 100 · aktuell: Zahnärzte · Radius 15 km · 3. Iteration
```
Mit Abbrechen-Button.

### 4. Reporting am Ende
Toast + Statuszeile: `Testlauf beendet: 100 Leads · 6 Zielgruppen · 2 Quellen · X min`.

## Nicht enthalten
- Keine Änderung an Auth, DB-Schema, Templates, Gmail/Outlook-Sync.
- Kein neuer Cron – bleibt ein manuell gestarteter Einmal-Lauf.

## Technische Details

- Neue Datei-Änderungen: `src/components/MarketingPanel.tsx` (Testlauf-Button, Schleifen-Logik, Progress-UI), evtl. `src/lib/sources.functions.ts` (Hilfsfunktion `countMarketingLeads(mode)` falls nicht vorhanden).
- Schleife läuft rein clientseitig über die bestehenden Server-Fns – keine neue Backend-Logik nötig.
- Zwischen den Requests ~500 ms Pause, damit Overpass/Google-Gateway nicht ratelimiten.
- Zählung über `listLeads({ mode: 'dsb' })` gefiltert auf `quelle_typ IN ('google_maps','openstreetmap')` + gültige E-Mail (gleiche Logik wie aktuelle Marketingliste).
- Runtime-Fehler `resolveDispatcher().use` zuerst per `read_runtime_errors` genau lokalisieren und fixen, bevor der Testlauf startet.
