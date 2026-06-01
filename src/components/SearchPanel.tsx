import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { searchDoctors, type SearchHit } from "@/lib/search.functions";
import { newId, type Lead, type Country } from "@/lib/leads";
import { Loader2, Plus, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onAddLeads: (leads: Lead[]) => void;
}

export function SearchPanel({ onAddLeads }: Props) {
  const runSearch = useServerFn(searchDoctors);
  const [fachgebiet, setFachgebiet] = useState("Orthopädie");
  const [ort, setOrt] = useState("");
  const [land, setLand] = useState<Country>("DE");
  const [gerichtsgutachter, setGG] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>("");

  const handleSearch = async () => {
    if (!fachgebiet.trim()) {
      toast.error("Bitte Fachgebiet angeben");
      return;
    }
    setLoading(true);
    setError(null);
    setHits([]);
    try {
      const res = await runSearch({
        data: { fachgebiet, ort, land: land === "Andere" ? "DE" : land, gerichtsgutachter, limit: 15 },
      });
      setQuery(res.query);
      if (!res.ok) {
        setError(res.error ?? "Suche fehlgeschlagen");
      } else {
        setHits(res.hits);
        if (res.hits.length === 0) toast.info("Keine Treffer – Suche verfeinern");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  };

  const importHit = (hit: SearchHit) => {
    if (hit.emails.length === 0) {
      toast.error("Kein E-Mail-Treffer auf dieser Seite");
      return;
    }
    const now = new Date().toISOString();
    const leads: Lead[] = hit.emails.map((email) => ({
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
      quelle: `Suche: ${hit.url}`,
      erstelltAm: now,
    }));
    onAddLeads(leads);
    toast.success(`${leads.length} Lead(s) hinzugefügt`);
  };

  const importAll = () => {
    const all = hits.flatMap((h) => h.emails.map((email) => ({ hit: h, email })));
    if (all.length === 0) {
      toast.error("Keine E-Mails in den Treffern gefunden");
      return;
    }
    const now = new Date().toISOString();
    const leads: Lead[] = all.map(({ hit, email }) => ({
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
      quelle: `Suche: ${hit.url}`,
      erstelltAm: now,
    }));
    onAddLeads(leads);
    toast.success(`${leads.length} Lead(s) importiert`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Online-Suche nach Ärzten & Gutachtern</CardTitle>
          <p className="text-sm text-muted-foreground">
            Durchsucht öffentliche Webseiten (Praxis-Homepages, Verzeichnisse) und extrahiert Kontakt-E-Mails.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="fachgebiet">Fachgebiet</Label>
              <Input
                id="fachgebiet"
                value={fachgebiet}
                onChange={(e) => setFachgebiet(e.target.value)}
                placeholder="z. B. Orthopädie, Psychiatrie, Unfallchirurgie"
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
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={gerichtsgutachter}
                onCheckedChange={(c) => setGG(c === true)}
              />
              Nur Gerichtsgutachter / biegli sądowi
            </label>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              Suche starten
            </Button>
          </div>
          {query && !loading && (
            <p className="text-xs text-muted-foreground">Suchanfrage: <code>{query}</code></p>
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
            <h3 className="font-semibold">{hits.length} Treffer</h3>
            <Button size="sm" variant="secondary" onClick={importAll}>
              Alle E-Mails importieren
            </Button>
          </div>
          {hits.map((hit, i) => (
            <Card key={i}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
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
                  <Button
                    size="sm"
                    onClick={() => importHit(hit)}
                    disabled={hit.emails.length === 0}
                  >
                    <Plus className="size-4" /> Übernehmen
                  </Button>
                </div>
                {hit.snippet && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{hit.snippet}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {hit.emails.length === 0 && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Keine E-Mail auf Seite gefunden
                    </Badge>
                  )}
                  {hit.emails.map((e) => (
                    <Badge key={e} variant="secondary" className="font-mono text-xs">{e}</Badge>
                  ))}
                  {hit.phones.slice(0, 2).map((p) => (
                    <Badge key={p} variant="outline" className="font-mono text-xs">{p}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
