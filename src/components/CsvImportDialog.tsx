import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { parseCSV } from "@/lib/csv";
import {
  buildLeadsFromMapping, guessField, LEAD_FIELD_LABELS,
  type Country, type Lead, type LeadField,
} from "@/lib/leads";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImport: (leads: Lead[]) => void;
}

interface ParsedFile {
  filename: string;
  delimiter: string;
  headers: string[];
  rows: string[][];
}

export function CsvImportDialog({ open, onOpenChange, onImport }: Props) {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<LeadField[]>([]);
  const [defaultLand, setDefaultLand] = useState<Country>("DE");
  const [defaultFach, setDefaultFach] = useState("");
  const [defaultGG, setDefaultGG] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setParsed(null); setMapping([]); setHasHeader(true);
      setDefaultFach(""); setDefaultGG(false); setDragOver(false); setBusy(false);
    }
  }, [open]);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const allRows = parseCSV(text);
      if (allRows.length === 0) { toast.error("Datei ist leer"); return; }

      const looksLikeHeader = allRows[0].some((c) => /[a-zA-ZäöüÄÖÜ]/.test(c) && !/@/.test(c));
      setHasHeader(looksLikeHeader);

      const colCount = Math.max(...allRows.map((r) => r.length));
      const headers = looksLikeHeader
        ? Array.from({ length: colCount }, (_, i) => allRows[0][i] ?? `Spalte ${i + 1}`)
        : Array.from({ length: colCount }, (_, i) => `Spalte ${i + 1}`);

      const dataRows = (looksLikeHeader ? allRows.slice(1) : allRows).map((r) => {
        const padded = [...r];
        while (padded.length < colCount) padded.push("");
        return padded;
      });

      const initialMapping: LeadField[] = looksLikeHeader
        ? headers.map((h) => guessField(h))
        : autoMapByContent(dataRows, colCount);

      setParsed({ filename: file.name, delimiter: ";", headers, rows: dataRows });
      setMapping(initialMapping);
    } catch (e) {
      toast.error("Datei konnte nicht gelesen werden: " + (e instanceof Error ? e.message : "Unbekannt"));
    } finally {
      setBusy(false);
    }
  };

  // Re-guess mapping when toggling hasHeader
  useEffect(() => {
    if (!parsed) return;
    if (hasHeader) {
      setMapping(parsed.headers.map((h) => guessField(h)));
    } else {
      const allRows = parsed.rows;
      setMapping(autoMapByContent(allRows, parsed.headers.length));
    }
  }, [hasHeader, parsed]);

  const dataRows = useMemo(() => {
    if (!parsed) return [] as string[][];
    if (hasHeader) return parsed.rows;
    // headers were treated as first data row; we need to re-include them
    // We stored rows already excluding the first row when hasHeader was true initially.
    // To handle the toggle cleanly we re-read from parsed.headers + parsed.rows
    return [parsed.headers, ...parsed.rows];
  }, [parsed, hasHeader]);

  const emailColIdx = mapping.indexOf("email");
  const previewLeads = useMemo(() => {
    if (!parsed) return [];
    const sample = dataRows.slice(0, 5);
    return sample.map((r) => ({
      email: emailColIdx >= 0 ? r[emailColIdx] : "",
      raw: r,
    }));
  }, [parsed, dataRows, emailColIdx]);

  const mappedCount = mapping.filter((m) => m && m !== "ignore").length;
  const canImport = !!parsed && emailColIdx >= 0;

  const handleImport = () => {
    if (!parsed || !canImport) {
      toast.error("Bitte mindestens eine Spalte der E-Mail zuordnen");
      return;
    }
    const result = buildLeadsFromMapping(dataRows, mapping, {
      land: defaultLand,
      fachgebiet: defaultFach || undefined,
      gerichtsgutachter: defaultGG,
      quelle: `CSV: ${parsed.filename}`,
    });
    if (result.leads.length === 0) {
      toast.error(`Keine gültigen Leads gefunden (${result.skipped} übersprungen)`);
      return;
    }
    onImport(result.leads);
    if (result.skipped > 0) {
      toast.success(`${result.leads.length} importiert, ${result.skipped} übersprungen`);
    } else {
      toast.success(`${result.leads.length} Lead(s) importiert`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>CSV importieren</DialogTitle>
          <DialogDescription>
            Lade eine CSV/TSV-Datei hoch – die Spalten werden automatisch erkannt und du kannst sie den Lead-Feldern zuordnen.
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={`rounded-lg border-2 border-dashed py-12 text-center transition-colors ${
              dragOver ? "border-primary bg-accent/30" : "border-input"
            }`}
          >
            <FileSpreadsheet className="size-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Datei hierher ziehen</p>
            <p className="text-xs text-muted-foreground mb-4">unterstützt: .csv, .tsv (Trennzeichen wird erkannt)</p>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button asChild variant="outline" disabled={busy}>
                <span><Upload className="size-4" /> Datei auswählen</span>
              </Button>
            </label>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 text-muted-foreground" />
              <span className="font-medium">{parsed.filename}</span>
              <Badge variant="outline">{dataRows.length} Zeilen</Badge>
              <Badge variant="outline">{parsed.headers.length} Spalten</Badge>
              <Badge variant="outline">Trennzeichen: <code className="ml-1">{parsed.delimiter === "\t" ? "Tab" : parsed.delimiter}</code></Badge>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setParsed(null)}>
                Andere Datei
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={hasHeader} onCheckedChange={(c) => setHasHeader(c === true)} />
                Erste Zeile ist Kopfzeile
              </label>
              <div className="space-y-1">
                <Label className="text-xs">Standard-Land</Label>
                <Select value={defaultLand} onValueChange={(v) => setDefaultLand(v as Country)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DE">🇩🇪 DE</SelectItem>
                    <SelectItem value="PL">🇵🇱 PL</SelectItem>
                    <SelectItem value="Andere">Andere</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Standard-Fachgebiet</Label>
                <Input className="h-8" value={defaultFach} onChange={(e) => setDefaultFach(e.target.value)} placeholder="optional" />
              </div>
              <label className="flex items-end gap-2 text-sm cursor-pointer pb-1">
                <Checkbox checked={defaultGG} onCheckedChange={(c) => setDefaultGG(c === true)} />
                Alle als Gerichtsgutachter
              </label>
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 border-b">
                    <tr>
                      {parsed.headers.map((h, i) => (
                        <th key={i} className="p-2 text-left min-w-[160px] border-r last:border-r-0">
                          <div className="font-medium mb-1 truncate" title={h}>{h}</div>
                          <Select
                            value={mapping[i] ?? "ignore"}
                            onValueChange={(v) => {
                              setMapping((prev) => {
                                const next = [...prev];
                                next[i] = v as LeadField;
                                return next;
                              });
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(LEAD_FIELD_LABELS) as LeadField[]).map((f) => (
                                <SelectItem key={f} value={f}>{LEAD_FIELD_LABELS[f]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.slice(0, 5).map((row, ri) => (
                      <tr key={ri} className="border-b last:border-0">
                        {parsed.headers.map((_, ci) => (
                          <td key={ci} className="p-2 align-top truncate max-w-[220px] border-r last:border-r-0 text-muted-foreground">
                            {row[ci] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dataRows.length > 5 && (
                <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30 border-t">
                  Vorschau zeigt 5 von {dataRows.length} Zeilen
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              {canImport ? (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="size-4" />
                  <span>{mappedCount} Spalte(n) zugeordnet, E-Mail erkannt – bereit zum Import.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-warning">
                  <AlertTriangle className="size-4" />
                  <span>Bitte mindestens eine Spalte der „E-Mail" zuordnen.</span>
                </div>
              )}
              {previewLeads[0]?.email && (
                <span className="text-xs text-muted-foreground">Beispiel: <code>{previewLeads[0].email}</code></span>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {parsed ? `${dataRows.length} Zeilen importieren` : "Importieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** When no header row: detect email column by content sniffing. */
function autoMapByContent(rows: string[][], colCount: number): LeadField[] {
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const phoneRe = /^\+?\d[\d\s().\-/]{5,}\d$/;
  const urlRe = /^https?:\/\//i;
  const plzRe = /^(\d{5}|\d{2}-\d{3})$/;
  const sample = rows.slice(0, 20);
  const mapping: LeadField[] = Array(colCount).fill("ignore");
  for (let c = 0; c < colCount; c++) {
    const vals = sample.map((r) => (r[c] ?? "").trim()).filter(Boolean);
    if (vals.length === 0) continue;
    const hit = (re: RegExp) => vals.filter((v) => re.test(v)).length / vals.length;
    if (hit(emailRe) > 0.6) mapping[c] = "email";
    else if (hit(phoneRe) > 0.6) mapping[c] = "telefon";
    else if (hit(urlRe) > 0.6) mapping[c] = "website";
    else if (hit(plzRe) > 0.6) mapping[c] = "plz";
  }
  return mapping;
}
