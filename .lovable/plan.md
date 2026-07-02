
## Ziel

Zwei Probleme lösen:

1. **„Keine E-Mails gefunden"** – Google Maps liefert für viele Praxen entweder keine Website oder Firecrawl findet auf `/impressum` nichts, weil viele Seiten JS-rendern, PDF-Impressen nutzen oder E-Mails als Bild einbetten.
2. **OpenStreetMap wird noch nicht genutzt** – OSM (Overpass API) enthält für Ärzte/Kliniken/Apotheken oft direkt `contact:email`, `email`, `contact:website` und `phone` als Tags. Kein Scraping, kostenlos, keine API-Key nötig.

## 1. Neuer OSM-Button in der Command-Bar

Neben „Suchen & importieren" (Google Maps) kommt ein zweiter Button:

```
[ Google Maps suchen ]   [ OpenStreetMap suchen ]
```

- Gleiche Eingaben: Zielgruppe, PLZ, Radius, Max. Treffer.
- OSM-Button ruft neue Server-Fn `scrapeOsmHealthcare` auf.
- Ergebnisse landen in derselben Tabelle „Aktuelle Treffer" und – falls E-Mail vorhanden – in der Marketingliste (`quelle_typ='openstreetmap'`).
- Statuszeile zeigt Herkunft: „OSM · 87 Orte · 41 mit E-Mail".

## 2. Neue Server-Funktion `scrapeOsmHealthcare`

Ablauf:

1. PLZ → Zentrum (bereits vorhandener `geocodePlz` via Google-Geocoding-Gateway; alternativ Nominatim, wenn kein Google-Key).
2. Overpass-API-Query (`https://overpass-api.de/api/interpreter`) mit Radius um Zentrum. Mapping Zielgruppe → OSM-Tag:
   - Arztpraxen & MVZ → `amenity=doctors` / `healthcare=doctor`
   - Kliniken & Reha → `amenity=hospital` / `healthcare=hospital`
   - Zahnärzte → `amenity=dentist` / `healthcare=dentist`
   - Physiotherapie → `healthcare=physiotherapist`
   - Heilpraktiker → `healthcare=alternative`
   - Apotheken → `amenity=pharmacy`
   - Pflegedienste → `amenity=nursing_home` / `healthcare=nursing`
   - Labore → `healthcare=laboratory`
3. Aus dem Response direkt lesen:
   - `name` = `tags.name`
   - `email` = `tags["contact:email"] || tags.email`
   - `phone` = `tags["contact:phone"] || tags.phone`
   - `website` = `tags["contact:website"] || tags.website`
   - `stadt` = `tags["addr:city"]`, `adresse` = `addr:street + addr:housenumber + addr:postcode`
4. Für Treffer **ohne** E-Mail aber **mit** Website: gleiches Firecrawl-Fallback wie bei Google Maps.
5. Dedupe über E-Mail, Insert in `leads` mit `quelle_typ='openstreetmap'`.

Keine externen API-Keys – Overpass ist offen; einmalige User-Agent-Header + kleine Wartepause zwischen Retries.

## 3. E-Mail-Extraktion verbessern (gilt für beide Quellen)

Die bestehende `scrapeEmailFromWebsite` in `src/lib/sources.functions.ts` wird erweitert:

- **Mehr Pfade** probieren: zusätzlich `/impressum/`, `/legal`, `/rechtliches`, `/imprint`, `/kontakt/`, `/ueber-uns`, `/team`, `/praxis`.
- **Google-Suche als Fallback**: wenn direktes Scraping 0 E-Mails liefert, ein Firecrawl-`search` mit `site:<domain> "@<domain>"` OR `"@t-online.de"` OR generisch `"mail" site:<domain>` – oft finden sich E-Mails in Cache/Snippets.
- **Bild-Mail-Heuristik**: wenn `<img alt="email">` oder `mailto:` mit JS-Encoding, Regex auf `data-cfemail` (Cloudflare) → decodieren.
- **Trefferzahl-Debug**: pro Lauf mitliefern, wie viele Orte Website hatten, wie viele davon E-Mail lieferten, damit der User sieht warum die Quote niedrig ist.
- **Firecrawl `waitFor`** = 3000 ms auf `/impressum`, damit React-Praxis-Websites (Jameda, Doctolib-Style) JS rendern.

Statuszeile zeigt anschließend: „120 Orte · 87 mit Website · 41 mit E-Mail extrahiert".

## 4. UI-Änderungen `MarketingPanel.tsx`

- Zweiter Button „OpenStreetMap suchen" (Outline-Style, gleicher Purple-Rahmen).
- `lastRun` bekommt Feld `quelle: 'gmaps' | 'osm'`; Statuszeile zeigt die Quelle.
- Marketingliste filtert weiterhin nach `quelle_typ IN ('google_maps','openstreetmap')` + gültige E-Mail.
- Kein neues Layout, nur ein Button + Debug-Zahlen mehr.

## 5. Nicht enthalten

- Keine Änderung an BRAK-Recherche.
- Kein neuer eigener Impressum-Crawler (nur bestehende Firecrawl-Basis erweitert).
- Keine Änderung an Auth/Rollen/Templates.

## Technische Details

- Neue Datei-Änderungen: `src/lib/sources.functions.ts` (Overpass-Query + Fallback-Erweiterung), `src/components/MarketingPanel.tsx` (zweiter Button, Quellen-Anzeige).
- DB: keine Migration nötig, `quelle_typ` ist bereits `text`.
- Overpass-Endpoint: `https://overpass-api.de/api/interpreter`; als Fallback `https://overpass.kumi.systems/api/interpreter`. Timeout 25 s, Retry 1×.
- Rate: Overpass duldet ~2 req/s; OSM-Button ist ein einziger Request pro Suche.
- Cloudflare-Email-Decode: `data-cfemail="..."` → XOR mit erstem Byte.
