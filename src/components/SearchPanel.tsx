import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  scanDirectoriesForEmails,
  searchDoctors,
  type DirectoryEmailHit,
  type SearchHit,
  type Zielgruppe,
} from "@/lib/search.functions";
import { newId, type Lead, type Country } from "@/lib/leads";
import { Loader2, Plus, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onAddLeads: (leads: Lead[]) => void;
}

const ZIELGRUPPEN_LABEL: Record<Zielgruppe, string> = {
  gutachter: "Gutachter / Sachverständige",
  fachaerzte: "Fachärzte / Praxen",
  kliniken: "Kliniken / Chefärzte",
  versicherungen: "Versicherungen",
  anwaelte: "Anwälte (Medizinrecht)",
  reha: "Reha-Einrichtungen",
  berufsgenossenschaft: "Berufsgenossenschaften / BG",
};

const ZG_ORDER: Zielgruppe[] = [
  "gutachter",
  "fachaerzte",
  "kliniken",
  "reha",
  "versicherungen",
  "anwaelte",
  "berufsgenossenschaft",
];

const QUERY_COUNT: Record<"DE" | "PL", Record<Zielgruppe, number>> = {
  DE: { gutachter: 3, fachaerzte: 2, kliniken: 2, versicherungen: 2, anwaelte: 2, reha: 2, berufsgenossenschaft: 2 },
  PL: { gutachter: 2, fachaerzte: 1, kliniken: 2, versicherungen: 1, anwaelte: 1, reha: 1, berufsgenossenschaft: 1 },
};

type DirectoryPreset = {
  label: string;
  note: string;
  urls: string[];
};

const DIRECTORY_PRESETS: Record<"DE" | "PL" | "INT", DirectoryPreset[]> = {
  DE: [
    {
      label: "DE · Offizielle Register",
      note: "116117 / KBV / gesund.bund / Arzt-Auskunft",
      urls: [
        "https://www.116117.de/de/arztsuche.php",
        "https://gesund.bund.de/arztsuche",
        "https://www.arzt-auskunft.de/",
      ],
    },
    {
      label: "DE · Termin- & Bewertungsportale",
      note: "jameda / Doctolib / Docplanner / docinsider / sanego",
      urls: [
        "https://www.jameda.de/",
        "https://www.doctolib.de/",
        "https://www.doctolib.de/fachaerzte",
        "https://www.docinsider.de/",
        "https://www.sanego.de/",
      ],
    },
    {
      label: "DE · Qualitäts- & Klinikportale",
      note: "Weiße Liste (Bertelsmann Stiftung) / Arzt.de",
      urls: [
        "https://www.weisse-liste.de/",
        "https://www.arzt.de/",
      ],
    },
    {
      label: "DE · Gutachter / Sachverständige",
      note: "Gerichtsgutachter / IHK / BDSF",
      urls: [
        "https://www.justiz.de/onlinedienste/sachverstaendige/",
        "https://svv.ihk.de/",
        "https://www.bdsf.de/sachverstaendige",
      ],
    },
    {
      label: "DE · Anwaltssuche (Medizinrecht)",
      note: "Offizielle DAV-Anwaltauskunft / anwalt.de",
      urls: [
        "https://anwaltauskunft.de/",
        "https://www.anwalt.de/",
      ],
    },
    {
      label: "DE · Fachgesellschaften & Leitlinien",
      note: "AWMF / DGOU / DGN / DGPPN",
      urls: [
        "https://www.awmf.org/leitlinien",
        "https://dgou.de/",
        "https://dgn.org/",
      ],
    },
  ],
  PL: [
    {
      label: "PL · Oficjalne rejestry",
      note: "NIL / NFZ / Rejestr Podmiotów Leczniczych",
      urls: [
        "https://nil.org.pl/rejestry/centralny-rejestr-lekarzy",
        "https://gsl.nfz.gov.pl/GSL/",
        "https://rpwdl.ezdrowie.gov.pl/",
      ],
    },
    {
      label: "PL · Portale pacjenckie",
      note: "ZnanyLekarz / Doctolib PL",
      urls: [
        "https://www.znanylekarz.pl/",
        "https://www.znanylekarz.pl/szukaj",
      ],
    },
    {
      label: "PL · Biegli sądowi",
      note: "Sądy okręgowe – listy biegłych",
      urls: [
        "https://bip.warszawa.so.gov.pl/artykuly/41/biegli-sadowi",
        "https://bip.krakow.so.gov.pl/artykuly/42/lista-bieglych-sadowych",
      ],
    },
  ],
  INT: [
    {
      label: "UK · GMC / PHIN / Top Doctors",
      note: "Specialist Register & private consultants",
      urls: [
        "https://www.gmc-uk.org/registration-and-licensing/the-medical-register",
        "https://www.phin.org.uk/",
        "https://www.topdoctors.co.uk/",
      ],
    },
    {
      label: "FR · Annuaire Santé",
      note: "RPPS / Doctolib FR",
      urls: [
        "https://annuaire.sante.fr/",
        "https://www.doctolib.fr/",
      ],
    },
    {
      label: "CH · doctorfmh / MedReg",
      note: "Offizielle Schweizer Ärztesuche",
      urls: [
        "https://www.doctorfmh.ch/",
        "https://www.medregom.admin.ch/",
      ],
    },
    {
      label: "USA · NPI / ABMS / Healthgrades",
      note: "Board certification & profiles",
      urls: [
        "https://npiregistry.cms.hhs.gov/",
        "https://www.certificationmatters.org/",
        "https://www.healthgrades.com/",
      ],
    },
  ],
};

export function SearchPanel({ onAddLeads }: Props) {
  const runSearch = useServerFn(searchDoctors);
  const runDirectoryScan = useServerFn(scanDirectoriesForEmails);
  const [fachgebiet, setFachgebiet] = useState("Orthopädie");
  const [ort, setOrt] = useState("");
  const [land, setLand] = useState<Country>("DE");
  const [gerichtsgutachter, setGG] = useState(false);
  const [zielgruppen, setZielgruppen] = useState<Set<Zielgruppe>>(
    new Set<Zielgruppe>(["gutachter", "fachaerzte", "kliniken"])
  );
  const [loading, setLoading] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [directoryUrls, setDirectoryUrls] = useState("");
  const [directoryHits, setDirectoryHits] = useState<DirectoryEmailHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanAllProgress, setScanAllProgress] = useState<{ done: number; total: number } | null>(null);

  const toggleZg = (zg: Zielgruppe) => {
    setZielgruppen((prev) => {
      const next = new Set(prev);
      if (next.has(zg)) next.delete(zg);
      else next.add(zg);
      return next;
    });
  };

  const handleSearch = async () => {
    if (zielgruppen.size === 0) {
      toast.error("Bitte mindestens eine Zielgruppe wählen");
      return;
    }
    const selected = Array.from(zielgruppen);
    setLoading(true);
    setError(null);
    setHits([]);
    try {
      const merged = new Map<string, SearchHit>();
      const activeLand = land === "Andere" ? "DE" : land;
      const totalQueries = selected.reduce((sum, zg) => sum + QUERY_COUNT[activeLand][zg], 0);

      for (let queryOffset = 0; queryOffset < totalQueries; queryOffset += 1) {
        const res = await runSearch({
          data: {
            fachgebiet,
            ort,
            land: activeLand,
            gerichtsgutachter,
            zielgruppen: selected,
            limitPerGroup: 4,
            deepScrape: false,
            queryOffset,
            maxQueries: 1,
          },
        });
        if (!res.ok) throw new Error(res.error ?? "Suche fehlgeschlagen");
        for (const hit of res.hits) {
          const existing = merged.get(hit.url);
          if (existing) {
            existing.emails = Array.from(new Set([...existing.emails, ...hit.emails]));
            existing.phones = Array.from(new Set([...existing.phones, ...hit.phones]));
          } else {
            merged.set(hit.url, hit);
          }
        }
        setHits(Array.from(merged.values()));
      }
      const count = merged.size;
      if (count === 0) toast.info("Keine Treffer – Suche verfeinern");
      else toast.success(`${count} Treffer aus ${zielgruppen.size} Zielgruppen`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  };

  const parseDirectoryUrls = () => {
    const urls = directoryUrls
      .split(/[\s,;]+/)
      .map((u) => u.trim())
      .filter(Boolean)
      .map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`));
    const valid: string[] = [];
    for (const url of urls) {
      try {
        valid.push(new URL(url).toString());
      } catch {
        toast.error(`Ungültige URL: ${url}`);
        return null;
      }
    }
    return Array.from(new Set(valid)).slice(0, 8);
  };

  const handleDirectoryScan = async () => {
    const urls = parseDirectoryUrls();
    if (!urls || urls.length === 0) {
      toast.error("Bitte mindestens eine Verzeichnis-URL eintragen");
      return;
    }
    setDirectoryLoading(true);
    setError(null);
    setDirectoryHits([]);
    try {
      const activeLand = land === "Andere" ? "DE" : land;
      const res = await runDirectoryScan({
        data: {
          urls,
          land: activeLand,
          suchbegriff: [fachgebiet, ort].filter(Boolean).join(" "),
          maxPagesPerDirectory: 25,
        },
      });
      if (!res.ok) throw new Error(res.error ?? "Verzeichnis-Scan fehlgeschlagen");
      setDirectoryHits(res.emails);
      if (res.emails.length === 0) toast.info("Keine E-Mails in den Verzeichnissen gefunden");
      else toast.success(`${res.emails.length} E-Mail(s) gefunden`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setDirectoryLoading(false);
    }
  };

  const handleScanAllDirectories = async () => {
    const presetGroup = land === "PL" ? "PL" : land === "DE" ? "DE" : "INT";
    const allUrls = Array.from(
      new Set(DIRECTORY_PRESETS[presetGroup].flatMap((preset) => preset.urls)),
    );
    if (allUrls.length === 0) return;

    const chunks: string[][] = [];
    for (let i = 0; i < allUrls.length; i += 8) chunks.push(allUrls.slice(i, i + 8));

    setDirectoryLoading(true);
    setError(null);
    setDirectoryHits([]);
    setScanAllProgress({ done: 0, total: chunks.length });
    try {
      const activeLand = land === "Andere" ? "DE" : land;
      const byEmail = new Map<string, DirectoryEmailHit>();
      for (const [i, chunk] of chunks.entries()) {
        try {
          const res = await runDirectoryScan({
            data: {
              urls: chunk,
              land: activeLand,
              suchbegriff: [fachgebiet, ort].filter(Boolean).join(" "),
              maxPagesPerDirectory: 25,
            },
          });
          if (res.ok) {
            for (const hit of res.emails) if (!byEmail.has(hit.email)) byEmail.set(hit.email, hit);
            setDirectoryHits(Array.from(byEmail.values()));
          }
        } catch {
          /* einzelnes Verzeichnis überspringen, restliche weiterlaufen lassen */
        }
        setScanAllProgress({ done: i + 1, total: chunks.length });
      }
      const total = byEmail.size;
      if (total === 0) toast.info("Keine E-Mails in den Verzeichnissen gefunden");
      else toast.success(`${total} E-Mail(s) aus ${allUrls.length} Verzeichnissen gefunden`);
    } finally {
      setDirectoryLoading(false);
      setScanAllProgress(null);
    }
  };

  const toLeads = (hit: SearchHit): Lead[] => {
    const now = new Date().toISOString();
    return hit.emails.map((email) => ({
      id: newId(),
      name: hit.title.slice(0, 120),
      email,
      telefon: hit.phones[0],
      website: hit.url,
      land: land === "Andere" ? "DE" : (land as Country),
      fachgebiet,
      stadt: ort || undefined,
      gerichtsgutachter,
      status: "neu",
      quelle: `Suche [${ZIELGRUPPEN_LABEL[hit.zielgruppe]}]: ${hit.url}`,
      erstelltAm: now,
    }));
  };

  const importHit = (hit: SearchHit) => {
    if (hit.emails.length === 0) {
      toast.error("Kein E-Mail-Treffer auf dieser Seite");
      return;
    }
    const leads = toLeads(hit);
    onAddLeads(leads);
    toast.success(`${leads.length} Lead(s) hinzugefügt`);
  };

  const importAll = () => {
    const leads = hits.flatMap(toLeads);
    if (leads.length === 0) {
      toast.error("Keine E-Mails in den Treffern gefunden");
      return;
    }
    onAddLeads(leads);
    toast.success(`${leads.length} Lead(s) importiert`);
  };

  const importDirectoryEmails = () => {
    if (directoryHits.length === 0) {
      toast.error("Keine E-Mails zum Importieren vorhanden");
      return;
    }
    const now = new Date().toISOString();
    onAddLeads(
      directoryHits.map((hit) => ({
        id: newId(),
        name: hit.email,
        email: hit.email,
        land: land === "Andere" ? "DE" : (land as Country),
        fachgebiet,
        stadt: ort || undefined,
        gerichtsgutachter,
        status: "neu",
        quelle: `Verzeichnis-Scan: ${hit.sourceUrl}`,
        erstelltAm: now,
      })),
    );
    toast.success(`${directoryHits.length} E-Mail(s) importiert`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Online-Suche – alle Stakeholder</CardTitle>
          <p className="text-sm text-muted-foreground">
            Durchsucht Praxen, Kliniken, Gutachter, Versicherungen, Anwälte & Reha in kleinen stabilen Suchläufen.
            Treffer mit sichtbaren Kontaktdaten können direkt übernommen werden.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="fachgebiet">Fachgebiet (optional)</Label>
              <Input
                id="fachgebiet"
                value={fachgebiet}
                onChange={(e) => setFachgebiet(e.target.value)}
                placeholder="z. B. Orthopädie, Unfallchirurgie"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ort">Stadt / Region (optional)</Label>
              <Input
                id="ort"
                value={ort}
                onChange={(e) => setOrt(e.target.value)}
                placeholder="München / Warszawa"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="land">Land</Label>
              <Select value={land} onValueChange={(v) => setLand(v as Country)}>
                <SelectTrigger id="land">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DE">🇩🇪 Deutschland</SelectItem>
                  <SelectItem value="PL">🇵🇱 Polen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Zielgruppen (Mehrfachauswahl)</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ZG_ORDER.map((zg) => (
                <label
                  key={zg}
                  className="flex items-center gap-2 text-sm cursor-pointer rounded-md border px-3 py-2 hover:bg-accent"
                >
                  <Checkbox checked={zielgruppen.has(zg)} onCheckedChange={() => toggleZg(zg)} />
                  <span>{ZIELGRUPPEN_LABEL[zg]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={gerichtsgutachter} onCheckedChange={(c) => setGG(c === true)} />
              Schwerpunkt Gerichtsgutachter / biegli sądowi
            </label>
            <Button type="button" onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Suche starten
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Verzeichnis-Scan – nur E-Mails</CardTitle>
          <p className="text-sm text-muted-foreground">
            Trage große Arztverzeichnisse ein. Der Scan folgt passenden Unterseiten und übernimmt ausschließlich gefundene
            E-Mail-Adressen.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Empfohlene Verzeichnisse (mit einem Klick einfügen)</Label>
            {(["DE", "PL", "INT"] as const).map((group) => (
              <div key={group} className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">
                  {group === "DE" ? "Deutschland" : group === "PL" ? "Polen" : "International"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {DIRECTORY_PRESETS[group].map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDirectoryUrls((prev) => {
                          const existing = new Set(
                            prev.split(/[\s,;]+/).map((u) => u.trim()).filter(Boolean),
                          );
                          for (const u of preset.urls) existing.add(u);
                          return Array.from(existing).join("\n");
                        });
                        toast.success(`${preset.urls.length} URL(s) eingefügt: ${preset.label}`);
                      }}
                      title={preset.note}
                    >
                      + {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="directoryUrls">Verzeichnis-URLs</Label>
              {directoryUrls && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setDirectoryUrls("")}>
                  Leeren
                </Button>
              )}
            </div>
            <Textarea
              id="directoryUrls"
              value={directoryUrls}
              onChange={(e) => setDirectoryUrls(e.target.value)}
              placeholder="https://www.beispiel-verzeichnis.de/aerzte&#10;https://www.beispiel-verzeichnis.de/gutachter"
              className="min-h-28"
            />
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-muted-foreground">Maximal 8 Verzeichnisse pro Lauf · bis zu 25 Unterseiten je Verzeichnis.</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleScanAllDirectories}
                disabled={directoryLoading || loading || (land !== "DE" && land !== "PL")}
                title={land !== "DE" && land !== "PL" ? "Nur für DE/PL hinterlegt" : undefined}
              >
                {directoryLoading && scanAllProgress ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Alle {land === "PL" ? "PL" : "DE"}-Verzeichnisse automatisch durchsuchen
              </Button>
              <Button type="button" variant="secondary" onClick={handleDirectoryScan} disabled={directoryLoading || loading}>
                {directoryLoading && !scanAllProgress ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                E-Mails aus Verzeichnissen holen
              </Button>
            </div>
          </div>
          {scanAllProgress && (
            <div className="rounded border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Durchsuche Verzeichnisse … {scanAllProgress.done} / {scanAllProgress.total}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 flex gap-3">
            <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Suche nicht möglich</p>
              <p className="text-muted-foreground mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {hits.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {hits.length} Treffer · {hits.filter((h) => h.emails.length > 0).length} mit E-Mail
            </h3>
            <Button size="sm" variant="secondary" onClick={importAll}>
              Alle E-Mails importieren
            </Button>
          </div>
          {hits.map((hit, i) => (
            <Card key={i}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {ZIELGRUPPEN_LABEL[hit.zielgruppe]}
                      </Badge>
                    </div>
                    <h4 className="font-medium truncate">{hit.title}</h4>
                    <a
                      href={hit.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 truncate max-w-full"
                    >
                      {hit.url} <ExternalLink className="size-3 shrink-0" />
                    </a>
                  </div>
                  <Button size="sm" onClick={() => importHit(hit)} disabled={hit.emails.length === 0}>
                    <Plus className="size-4" /> Übernehmen
                  </Button>
                </div>
                {hit.snippet && <p className="text-sm text-muted-foreground line-clamp-2">{hit.snippet}</p>}
                <div className="flex flex-wrap gap-2">
                  {hit.emails.length === 0 && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Keine E-Mail gefunden
                    </Badge>
                  )}
                  {hit.emails.map((e) => (
                    <Badge key={e} variant="secondary" className="font-mono text-xs">
                      {e}
                    </Badge>
                  ))}
                  {hit.phones.slice(0, 2).map((p) => (
                    <Badge key={p} variant="outline" className="font-mono text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {directoryHits.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{directoryHits.length} E-Mail(s) aus Verzeichnissen</h3>
            <Button size="sm" variant="secondary" onClick={importDirectoryEmails}>
              Alle E-Mails importieren
            </Button>
          </div>
          <Card>
            <CardContent className="pt-5 space-y-2">
              {directoryHits.map((hit) => (
                <div key={`${hit.email}-${hit.sourceUrl}`} className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
                  <Badge variant="secondary" className="font-mono text-xs break-all whitespace-normal">
                    {hit.email}
                  </Badge>
                  <a
                    href={hit.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 shrink-0"
                  >
                    Quelle <ExternalLink className="size-3" />
                  </a>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
