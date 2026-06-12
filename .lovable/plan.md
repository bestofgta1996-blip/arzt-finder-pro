## Ziel
Suche wird **rein manuell** (kein Cron mehr). Marketinglisten aktualisieren sich automatisch via **Microsoft Outlook-Abgleich** (gesendet / geantwortet / Bounce). Leads werden zusätzlich nach **Fachrichtung** organisiert – als virtuelle Ordner im UI **und** als echte Mail-Ordner im verbundenen Outlook.

---

## 1. Cron deaktivieren
- pg_cron-Jobs `search-tick` und `tenders-tick` entfernen (per insert-Tool `cron.unschedule(...)`)
- Bestehende Suchfunktionen (`runSearchSlice`, `runTenderSlice`) bleiben, werden aber nur noch per Button im UI getriggert
- UI: Toggle "Automatische Dauersuche" entfernt, statt dessen ein klarer **„Suche starten"-Button** pro Quelle (Firecrawl / TED) mit Fortschrittsanzeige

---

## 2. Microsoft Outlook anbinden
- **Connector**: `microsoft_outlook` (ein zentrales Postfach, OAuth durch dich) – über Lovable Connector Gateway
- Neue Server-Functions in `src/lib/outlook.functions.ts`:
  - `syncOutlookSent` – holt gesendete Mails der letzten X Tage aus `/me/mailFolders/sentitems/messages`
  - `syncOutlookInbox` – holt Inbox-Antworten (Match per `inReplyTo` / Betreff / Absender)
  - `syncOutlookBounces` – erkennt MAILER-DAEMON-Mails / Failure Notifications

---

## 3. Schema-Erweiterung `leads`
Migration ergänzt:
- `status` TEXT (`neu`, `kontaktiert`, `geantwortet`, `ungültig`, `bounce`) – Default `neu`
- `last_contacted_at` TIMESTAMPTZ
- `last_replied_at` TIMESTAMPTZ
- `outlook_message_id` TEXT – letzte Mail-Referenz
- Index auf `lower(email)` für schnelles Matching

Neue Tabelle `outlook_sync_state`:
- `last_sent_check_at`, `last_inbox_check_at`, `last_bounce_check_at`
- Damit pro Sync nur Delta geholt wird (`$filter=receivedDateTime gt ...`)

---

## 4. Matching-Logik
Im Sync wird pro Outlook-Mail geprüft:
- **Gesendet**: jede `toRecipients[].emailAddress.address` → Lead mit gleicher E-Mail finden → Status `kontaktiert`, `last_contacted_at` setzen
- **Antwort** (Inbox): Absender-Adresse → Lead finden → Status `geantwortet`, `last_replied_at` setzen
- **Bounce**: Failure-Notification parsen (Original-Empfänger aus Body / Header) → Lead → Status `bounce`

Statushierarchie: `geantwortet` > `bounce` > `kontaktiert` > `neu` (höherer Status wird nicht zurückgestuft)

---

## 5. Fachrichtungs-Ordner

### Virtuell im UI
- Linke Sidebar im Marketing-Listen-Tab: Baum mit allen vorkommenden Fachrichtungen
- Klick filtert Tabelle nach `specialty`
- Zähler pro Ordner (Gesamt / Neu / Kontaktiert / Geantwortet)
- Fachrichtungs-übergreifender Ordner „Alle"
- Eigener Ordner pro Land (DE/PL/AT/CH) als zweite Ebene

### Echt in Outlook
- Neue Server-Function `ensureOutlookFolders`:
  - Liest alle distinkten `specialty` aus `leads`
  - Erstellt (falls fehlend) Unterordner unter Posteingang: `Leads/<Land>/<Fachrichtung>`
  - Nutzt `POST /me/mailFolders/{parent}/childFolders`
- Beim Sync: gesendete/empfangene Mails, die zu einem Lead gehören, werden per `POST /me/messages/{id}/move` in den passenden Fachrichtungs-Ordner einsortiert
- Speichert `outlook_folder_id` pro Fachrichtung in neuer kleiner Tabelle `outlook_folders` (specialty, country, folder_id)

---

## 6. UI-Änderungen
- Neuer Tab/Bereich **„Outlook-Sync"** mit:
  - Status der Verbindung (Connector verbunden? letzte Sync-Zeit)
  - Button **„Jetzt mit Outlook abgleichen"** (triggert alle 3 Syncs nacheinander)
  - Button **„Outlook-Ordner neu anlegen"** (für neue Fachrichtungen)
  - Anzeige: x Leads aktualisiert, y neue Antworten, z Bounces
- Marketinglisten-Tabelle: neue Spalte **Status** mit farbigem Badge, sortier-/filterbar
- Sidebar mit Fachrichtungs-Baum (statt aktuelles flaches Layout)

---

## 7. Was bleibt unverändert
- Bestehende Firecrawl- & TED-Suche – nur Trigger ändert sich (manuell statt Cron)
- Bestehende `leads`-Daten bleiben, bekommen nur neue Felder mit Default `neu`
- Ausschreibungen-Tab bleibt

---

## Voraussetzungen (du musst zustimmen / dranziehen)
1. **Microsoft Outlook Connector** muss verbunden werden (einmaliger OAuth-Login mit dem Postfach, das die Marketing-Mails sendet). Ich starte den Connect-Flow nach Plan-Approval.
2. Für Bounce-Erkennung wird das Postfach gelesen – das Konto braucht entsprechende Postfach-Rechte (bei privatem Outlook automatisch gegeben).

Soll ich so umsetzen?
