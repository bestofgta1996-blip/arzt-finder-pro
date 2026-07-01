## Ziel

Die Marketingliste zeigt **ausschließlich** durch die Google-Maps-Recherche importierte Leads mit E-Mail. Die Suche liefert deutlich mehr Treffer (>60) durch automatische Grid-Aufteilung. Alles auf einem Screen: Suchleiste oben, Ergebnistabelle darunter.

## 1. Marketingliste bereinigen

- Neues Feld `leads.source = 'gmaps'` (Migration, Default `'manual'`).
- `MarketingPanel` listet nur Leads mit `source='gmaps'` **und** vorhandener E-Mail.
- Google-Maps-Import setzt `source='gmaps'` automatisch.
- Bestehende manuelle/CSV-Leads bleiben in Tab „Lokal" sichtbar, verschwinden aber aus der Marketingliste.
- Kein Auto-Push mehr aus `addLeads()` in die Cloud-Marketingliste – nur der Maps-Import schreibt dorthin.

## 2. Suche verbessern (>60 Treffer via Grid)

`searchPlaces` in `src/lib/sources.functions.ts` wird zu einer **Grid-Suche**:

- PLZ → Zentrum (Geocoding, bereits vorhanden).
- Wenn Radius > 5 km: Zentrum wird in ein Hex-Grid aus Teilzellen à ~4 km zerlegt (Standard-Radius/4).
- Für jede Zelle: `places:searchNearby` (statt Textsearch) mit dem passenden Google-Typ (`doctor`, `hospital`, `dentist`, `pharmacy` …) + Pagination (3 Seiten × 20).
- Deduplizierung über `place.id`.
- Harte Obergrenze konfigurierbar (Default 300 Orte), damit Kosten kalkulierbar bleiben.
- Fortschritt wird als Zahl (`X / Y Zellen`) im Response-Feld `progress` mitgeliefert und in der UI angezeigt.

E-Mail-Scraping bleibt (parallel, 5 Worker), nur Orte **mit** E-Mail landen als Leads in der Marketingliste; alle Treffer erscheinen weiterhin in der Ergebnistabelle unterhalb der Suche zur Kontrolle.

## 3. UI: Ein-Screen-Layout (Power Apps Stil)

`MarketingPanel` wird umgebaut:

```text
┌──────────────────────────────────────────────────────────┐
│ Command-Bar:  [PLZ] [Radius km] [Zielgruppe ▾] [Suchen] │
│               Fortschritt: 42/64 Zellen · 187 Treffer   │
├──────────────────────────────────────────────────────────┤
│ Ergebnistabelle (scrollbar, sticky header)              │
│ Name │ Stadt │ Adresse │ Telefon │ E-Mail │ Website │ ⋯ │
└──────────────────────────────────────────────────────────┘
```

- Kein Akkordeon, keine zweite Karte – alles sofort sichtbar.
- Filter-Chips über der Tabelle: „Nur mit E-Mail" (Default an), „Nur neu importiert".
- Sofort-Aktionen pro Zeile: `mailto:`, `tel:`, Website öffnen, „In Marketingliste behalten / entfernen".
- Fluent-UI-Farben (Lila `#742774`) bleiben.

## 4. Nicht enthalten

- Keine Änderung an Vorlagen, Outlook/Gmail-Sync, Ausschreibungen.
- Keine neuen Zielgruppen-Presets in diesem Schritt (nur die bereits vorhandenen).
- Keine Team-/Rollen-Funktionen.

## Technische Details

- Migration: `ALTER TABLE leads ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv','gmaps'))` + Index `(user_id, mode, source)`.
- `upsertLeads` akzeptiert `source`; `runGmapsSearch` setzt `source='gmaps'`.
- Grid-Berechnung: einfache Lat/Lng-Offsets (ohne externe Geo-Lib), ~111 km/° Lat, `cos(lat)` für Lng.
- Rate-Limit: max. 8 parallele Places-Requests, kleine Pausen zwischen Seiten (Google verlangt kurz Wartezeit für `nextPageToken`).
- Frontend hält den Fortschritt via Polling **nicht** – einfacher: Server-Fn streamt nicht, sondern gibt am Ende alles zurück; ein Client-seitiger Spinner + Zellen-Zähler wird aus der Response-Statistik gefüllt.
