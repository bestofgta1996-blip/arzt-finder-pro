## Gmail-Integration (parallel zu Outlook)

Gmail-Konto verbinden, automatische E-Mail-Entwürfe pro Lead anlegen und Postfach-Abgleich für Status-Updates – ergänzend zum bestehenden Outlook-Abgleich.

### 1. Gmail-Connector verknüpfen

Den bestehenden Workspace-Connector „David's Gmail" mit dem Projekt verknüpfen, damit Gmail-API-Calls möglich werden. Erfordert deine Bestätigung im Dialog – kein neuer API-Key nötig.

### 2. Neue Karte „Gmail-Abgleich" im Marketing-Panel

Direkt neben der vorhandenen Outlook-Karte, gleicher Aufbau für Wiedererkennung:
- Status-Anzeige (verbunden / nicht verbunden, letzter Abgleich, letzte Zusammenfassung)
- Button **Jetzt abgleichen** – scannt gesendete Mails, Posteingang und Bounces, aktualisiert Lead-Status (neu → angeschrieben → geantwortet / bounce)
- Button **Labels anlegen** – legt pro Fachgebiet ein Gmail-Label an (Pendant zu den Outlook-Ordnern)
- Optional Checkbox **Eingegangene Antworten labeln** – versieht Antworten von bekannten Leads mit dem passenden Fachgebiet-Label
- Beide Abgleiche (Outlook + Gmail) laufen unabhängig, Lead-Status zeigt jeweils das aktuellere Ergebnis

### 3. Button „Entwurf in Gmail anlegen" pro Lead

In der Lead-Liste neben den vorhandenen Aktionen (Status setzen, löschen):
- Neuer Button **Entwurf anlegen** (Gmail-Icon)
- Öffnet kleinen Dialog mit Vorlagen-Auswahl (Anwälte / Gutachter / Kliniken / Versicherungen) und befüllbarem Betreff/Text – Platzhalter `{name}`, `{stadt}`, `{fachgebiet}` werden automatisch eingesetzt
- Beim Speichern: Entwurf landet in deinem Gmail-Ordner „Entwürfe"; du prüfst und sendest manuell
- Lead-Status bleibt auf „neu", bis du tatsächlich sendest (der Abgleich erkennt das später automatisch)

### 4. Vorlagen-Verwaltung (klein)

Eine simple Vorlagen-Tabelle, damit Anschreiben nicht jedes Mal neu getippt werden müssen:
- Pro Zielgruppe (Anwälte, Gutachter, …) je ein Standard-Template (Betreff + HTML/Text)
- Bearbeitbar über eigene kleine Karte „Anschreiben-Vorlagen" unter den Such-Profilen
- Werden beim Entwurf-Anlegen vorgeschlagen, lassen sich pro Lead noch anpassen

### Technische Details

- **Datenmodell:**
  - Neue Tabelle `email_templates` (zielgruppe, sprache, betreff, body_html, body_text)
  - Erweiterung `outlook_sync_state` → generisch zu `mailbox_sync_state` mit `provider`-Spalte (`outlook` / `gmail`); bestehende Daten migrieren. Alternativ separate Tabelle `gmail_sync_state` (weniger Refactor, doppelte Struktur) – ich nehme den Refactor, sauberer.
  - Leads bekommen optional `gmail_draft_id` und `gmail_thread_id` (für Wiedererkennung beim Abgleich)
- **Server-Funktionen** in `src/lib/gmail.functions.ts`:
  - `getGmailSyncState`, `syncGmailAll({ moveToLabels })`, `ensureGmailLabels`
  - `createGmailDraft({ leadId, subject, bodyHtml })`
  - Alle Calls über Connector-Gateway `https://connector-gateway.lovable.dev/google_mail/gmail/v1`, Auth via `LOVABLE_API_KEY` + `GOOGLE_MAIL_API_KEY`
- **Scopes:** der Connector braucht `gmail.compose` (Entwürfe), `gmail.readonly` (Abgleich), `gmail.modify` (Labels setzen), `gmail.labels` (Labels anlegen). Falls beim ersten Call ein 403 „insufficient scopes" zurückkommt, löse ich ein einmaliges Reconnect aus.
- **Abgleich-Logik:** identisch zum Outlook-Abgleich – pro Lead-E-Mail per `q=to:<email>` oder `q=from:<email>` suchen, neueste Mail prüfen, Status setzen, Bounce-Heuristik (Mailer-Daemon-Adressen) wie bisher.
- **Outlook-Code unverändert** – wirklich nichts angefasst, beide Provider laufen parallel.

### Was du danach hast

- Outlook *und* Gmail werden zusammen abgeglichen, Lead-Status spiegelt das aktuelle Ergebnis aus beiden Postfächern
- Pro Lead ein Klick zum vorbefüllten Entwurf in Gmail
- Vorlagen-Verwaltung für wiederkehrende Anschreiben
- Gmail-Labels analog zur Outlook-Ordnerstruktur
