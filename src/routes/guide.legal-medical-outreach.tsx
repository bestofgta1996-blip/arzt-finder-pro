import { createFileRoute, Link } from "@tanstack/react-router";

const TITLE = "Rechtskonforme Kaltakquise im Medizinbereich (DE & PL)";
const DESCRIPTION =
  "Praxisleitfaden zu DSGVO und RODO bei der B2B-Ansprache von Ärzten, Sachverständigen und Kliniken in Deutschland und Polen – Rechtsgrundlagen, Pflichtangaben und Best Practices.";
const URL = "https://arzt-finder-pro.lovable.app/guide/legal-medical-outreach";

export const Route = createFileRoute("/guide/legal-medical-outreach")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: URL },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          inLanguage: "de-DE",
          author: { "@type": "Organization", name: "IMB Akquise" },
          publisher: { "@type": "Organization", name: "IMB Akquise" },
          mainEntityOfPage: URL,
        }),
      },
    ],
  }),
  component: GuidePage,
});

function GuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← IMB Akquise
          </Link>
          <span className="text-xs text-muted-foreground">Leitfaden</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <article className="prose prose-neutral max-w-none dark:prose-invert">
          <h1>Rechtskonforme Kaltakquise im Medizinbereich – DSGVO &amp; RODO in DE und PL</h1>
          <p className="lead text-lg text-muted-foreground">
            Wer Ärzte, Sachverständige, Kliniken oder Reha-Einrichtungen für medizinische Gutachten, Versorgungsleistungen oder Kooperationen kontaktieren möchte, bewegt sich in einem stark regulierten Umfeld. Dieser Leitfaden fasst die wichtigsten rechtlichen Leitplanken für B2B-Outreach in Deutschland (DSGVO/UWG) und Polen (RODO) zusammen.
          </p>

          <h2>1. Welche Daten dürfen für Ärzteadressen genutzt werden?</h2>
          <p>
            Auch öffentlich verfügbare Ärzteadressen aus Arztsuchen, Klinikverzeichnissen oder dem amtlichen Anwaltsverzeichnis fallen unter die DSGVO, sobald eine natürliche Person identifizierbar ist (etwa <em>Dr. med. Vorname Nachname</em> mit Praxisadresse). Für reine Funktionspostfächer wie <code>info@klinik-musterstadt.de</code> gilt das in der Regel nicht – sie sind aber dennoch wettbewerbsrechtlich (UWG) geschützt.
          </p>
          <ul>
            <li>Quelle der Daten dokumentieren (z. B. BRAK-Register, Destatis-Krankenhausverzeichnis, Praxiswebsite).</li>
            <li>Zweckbindung beachten: Daten, die zur Patientenversorgung erhoben wurden, dürfen nicht ohne Weiteres zu Marketingzwecken genutzt werden.</li>
            <li>Speicherdauer begrenzen und Lösch-/Berichtigungsanfragen technisch ermöglichen.</li>
          </ul>

          <h2>2. Rechtsgrundlagen für die Erstansprache (DE)</h2>
          <p>
            Eine telefonische B2B-Kaltakquise ist gemäß § 7 Abs. 2 Nr. 1 UWG nur bei <strong>mutmaßlicher Einwilligung</strong> zulässig – sie muss sich aus konkreten Umständen ableiten lassen (z. B. bestehende Geschäftsbeziehung, deutlich erkennbares Interesse am Angebot). Für E-Mail-Werbung an personenbezogene Adressen ist grundsätzlich eine ausdrückliche Einwilligung erforderlich; alternativ kann <strong>Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)</strong> tragen, sofern eine sorgfältige Interessenabwägung dokumentiert ist und ein klarer fachlicher Bezug zur Tätigkeit der Empfänger:in besteht.
          </p>
          <ul>
            <li>Kein Werbe-Mailing an personalisierte Adressen ohne dokumentierte Interessenabwägung.</li>
            <li>Vollständiges Impressum und ein einfacher, jederzeitiger Widerspruchshinweis in jeder Nachricht.</li>
            <li>Keine irreführenden Betreffzeilen oder Absenderkennungen (§ 6 TMG, Art. 13 DSGVO).</li>
          </ul>

          <h2>3. Besonderheiten in Polen (RODO &amp; UŚUDE)</h2>
          <p>
            In Polen gelten neben der DSGVO (dort <em>RODO</em>) das Gesetz über die Erbringung elektronischer Dienstleistungen (<em>Ustawa o świadczeniu usług drogą elektroniczną</em>) und das Telekommunikationsgesetz. Werbe-E-Mails und Telefonanrufe an natürliche Personen erfordern in der Regel eine <strong>vorherige ausdrückliche Einwilligung</strong> (Art. 10 UŚUDE, Art. 172 PT).
          </p>
          <ul>
            <li>Polnische Aufsichtsbehörde: UODO (<em>Urząd Ochrony Danych Osobowych</em>).</li>
            <li>Information über Verantwortlichen, Zweck und Rechte in polnischer Sprache empfohlen.</li>
            <li>Bei grenzüberschreitender Verarbeitung Lead Supervisory Authority und ggf. Verarbeitungsverzeichnis pflegen.</li>
          </ul>

          <h2>4. Pflichtangaben in jeder Ansprache</h2>
          <ol>
            <li>Klarer Absender mit ladungsfähiger Anschrift.</li>
            <li>Konkreter, sachlicher Bezug zur Tätigkeit der angeschriebenen Person.</li>
            <li>Hinweis auf die Datenquelle (z. B. „Ihre öffentlich zugängliche Kammer- bzw. Klinikadresse").</li>
            <li>Hinweis auf das Widerspruchsrecht nach Art. 21 DSGVO mit einfachem Opt-out-Weg.</li>
            <li>Link auf die Datenschutzerklärung.</li>
          </ol>

          <h2>5. Technische Sorgfaltspflichten</h2>
          <ul>
            <li>Bounces, Antworten und Opt-outs in einer revisionssicheren Lead-Datenbank dokumentieren.</li>
            <li>Suppression-Listen für widersprechende Empfänger:innen führen – über alle Kampagnen hinweg.</li>
            <li>Auftragsverarbeitungsverträge (Art. 28 DSGVO) mit Mail-, CRM- und Hostinganbietern abschließen.</li>
            <li>Sichere Übertragung (TLS) und Zugriffsbeschränkung auf Personen mit fachlichem Bedarf.</li>
          </ul>

          <h2>6. Empfehlung für die Praxis</h2>
          <p>
            Wer Marketinglisten für medizinische Zielgruppen aufbaut, sollte Datenherkunft, Interessenabwägung, Kontakthistorie und Opt-outs zentral nachhalten. Tools wie <strong>IMB Akquise</strong> verbinden recherchierte Ärzte- und Gutachteradressen mit Statusverfolgung aus Outlook und ermöglichen so eine nachvollziehbare, DSGVO-/RODO-konforme Akquise.
          </p>

          <hr />
          <p className="text-sm text-muted-foreground">
            Hinweis: Dieser Leitfaden ist eine allgemeine Information und ersetzt keine Rechtsberatung im Einzelfall. Für konkrete Kampagnen empfehlen wir die Abstimmung mit einem auf IT- und Wettbewerbsrecht spezialisierten Fachanwalt.
          </p>
          <p>
            <Link to="/" className="text-primary underline-offset-4 hover:underline">
              ← Zurück zu IMB Akquise
            </Link>
          </p>
        </article>
      </main>
    </div>
  );
}
