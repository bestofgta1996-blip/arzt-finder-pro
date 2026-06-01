export interface MailTemplate {
  id: string;
  sprache: "DE" | "PL";
  titel: string;
  betreff: string;
  body: string;
}

export const DEFAULT_TEMPLATES: MailTemplate[] = [
  {
    id: "de-erstkontakt",
    sprache: "DE",
    titel: "Erstkontakt – Kooperation Gutachten",
    betreff: "Kooperationsanfrage – medizinische Gutachten",
    body: `Sehr geehrte/r Frau/Herr {{name}},

mein Name ist [Ihr Name] und ich wende mich an Sie mit der Anfrage einer fachlichen Zusammenarbeit im Bereich medizinischer Gutachten.

Wir suchen erfahrene Fachärztinnen und Fachärzte – insbesondere mit Erfahrung als Gerichtsgutachter – für eine langfristige, honorierte Kooperation. Die Aufträge umfassen [kurze Beschreibung: Fachgebiet, Umfang, Vergütung].

Über ein kurzes Gespräch zur Klärung Ihres Interesses und Ihrer Verfügbarkeit würden wir uns sehr freuen.

Mit freundlichen Grüßen
[Ihr Name]
[Funktion]
[Telefon] | [E-Mail]`,
  },
  {
    id: "de-gerichtsgutachter",
    sprache: "DE",
    titel: "Gerichtsgutachter – Anfrage",
    betreff: "Anfrage – Erstellung gerichtlicher Gutachten",
    body: `Sehr geehrte/r {{name}},

wir sind auf der Suche nach öffentlich bestellten und vereidigten Sachverständigen im Fachbereich {{fachgebiet}} für die Erstellung gerichtlicher Gutachten in unserem Auftragsumfeld.

Bei Interesse an einer Kooperation würden wir uns über eine kurze Rückmeldung mit Angabe Ihrer Kapazitäten und Konditionen freuen.

Mit kollegialen Grüßen
[Ihr Name]`,
  },
  {
    id: "pl-erstkontakt",
    sprache: "PL",
    titel: "Pierwszy kontakt – współpraca opinie medyczne",
    betreff: "Propozycja współpracy – opinie i ekspertyzy medyczne",
    body: `Szanowna Pani / Szanowny Panie {{name}},

nazywam się [Imię Nazwisko] i zwracam się z propozycją współpracy w zakresie sporządzania opinii i ekspertyz medycznych.

Poszukujemy lekarzy specjalistów – w szczególności biegłych sądowych – do długoterminowej, odpłatnej współpracy. Zlecenia obejmują [krótki opis: specjalizacja, zakres, wynagrodzenie].

Będę wdzięczna/wdzięczny za krótką rozmowę w celu omówienia Pani/Pana zainteresowania oraz dostępności.

Z wyrazami szacunku
[Imię Nazwisko]
[Stanowisko]
[Telefon] | [E-mail]`,
  },
  {
    id: "pl-biegly",
    sprache: "PL",
    titel: "Biegły sądowy – zapytanie",
    betreff: "Zapytanie – sporządzanie opinii sądowych",
    body: `Szanowna Pani / Szanowny Panie {{name}},

poszukujemy biegłych sądowych ze specjalizacji {{fachgebiet}} do sporządzania opinii na potrzeby postępowań sądowych.

W przypadku zainteresowania współpracą uprzejmie prosimy o krótką informację zwrotną wraz z podaniem dostępności i warunków.

Z poważaniem
[Imię Nazwisko]`,
  },
];

export function applyTemplate(tpl: MailTemplate, vars: Record<string, string>): { betreff: string; body: string } {
  const fill = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `[${k}]`);
  return { betreff: fill(tpl.betreff), body: fill(tpl.body) };
}
