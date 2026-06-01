import { useMemo, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { parseBulkText, newId, type Lead, type Country } from "@/lib/leads";
import { Upload, FileText } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onAddLeads: (leads: Lead[]) => void;
}

export function PastePanel({ onAddLeads }: Props) {
  const [text, setText] = useState("");
  const [land, setLand] = useState<Country>("DE");
  const [fachgebiet, setFachgebiet] = useState("");
  const [gerichtsgutachter, setGG] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const parsed = useMemo(() => parseBulkText(text), [text]);

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const contents = await Promise.all(
      files.map((f) =>
        f.text().catch(() => "")
      ),
    );
    setText((prev) => (prev ? prev + "\n\n" : "") + contents.join("\n\n"));
    toast.success(`${files.length} Datei(en) eingelesen`);
  };

  const handleImport = () => {
    if (parsed.length === 0) {
      toast.error("Keine E-Mails erkannt");
      return;
    }
    const now = new Date().toISOString();
    const leads: Lead[] = parsed.map((p) => ({
      id: newId(),
      name: p.name ?? p.email,
      praxis: p.praxis,
      fachgebiet: fachgebiet || undefined,
      email: p.email,
      telefon: p.telefon,
      website: p.website,
      adresse: p.adresse,
      plz: p.plz,
      stadt: p.stadt,
      land: p.land ?? land,
      gerichtsgutachter,
      status: "neu",
      quelle: "Manuell eingefügt",
      erstelltAm: now,
    }));
    onAddLeads(leads);
    setText("");
    toast.success(`${leads.length} Lead(s) hinzugefügt`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bulk-Import: Text einfügen oder Dateien ziehen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Füge ganze Kontaktblöcke, Listen oder vCards ein – wir erkennen E-Mails, Telefone, PLZ und Praxisnamen automatisch.
            Eine leere Zeile trennt einzelne Kontakte. Du kannst auch .txt / .csv Dateien hier hineinziehen.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Standard-Land</Label>
              <Select value={land} onValueChange={(v) => setLand(v as Country)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DE">🇩🇪 Deutschland</SelectItem>
                  <SelectItem value="PL">🇵🇱 Polen</SelectItem>
                  <SelectItem value="Andere">Andere</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fb">Fachgebiet (optional)</Label>
              <Input
                id="fb"
                value={fachgebiet}
                onChange={(e) => setFachgebiet(e.target.value)}
                placeholder="z. B. Orthopädie"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={gerichtsgutachter} onCheckedChange={(c) => setGG(c === true)} />
                Als Gerichtsgutachter markieren
              </label>
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`relative rounded-md border-2 border-dashed transition-colors ${
              dragOver ? "border-primary bg-accent/30" : "border-input"
            }`}
          >
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Beispiel:

Dr. med. Anna Müller
Praxis für Orthopädie
Königstr. 14
70173 Stuttgart
Tel. +49 711 1234567
info@praxis-mueller.de

Dr. Jan Kowalski
Gabinet Ortopedyczny
ul. Marszałkowska 1
00-624 Warszawa
+48 22 555 11 22
kontakt@ortopeda-kowalski.pl`}
              className="min-h-[280px] font-mono text-sm bg-transparent resize-y"
            />
            {dragOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-accent/40 rounded-md pointer-events-none">
                <div className="flex items-center gap-2 text-primary font-medium">
                  <Upload className="size-5" /> Dateien hier ablegen
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="size-4" />
              {parsed.length > 0 ? (
                <>Erkannt: <Badge variant="secondary">{parsed.length} Kontakt(e)</Badge></>
              ) : (
                <>Noch keine E-Mails erkannt</>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setText("")} disabled={!text}>
                Leeren
              </Button>
              <Button onClick={handleImport} disabled={parsed.length === 0}>
                {parsed.length > 0 ? `${parsed.length} Lead(s) übernehmen` : "Übernehmen"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {parsed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vorschau</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-auto rounded-md border divide-y">
              {parsed.slice(0, 50).map((p, i) => (
                <div key={i} className="p-3 text-sm grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div className="font-medium truncate">{p.name ?? "—"}</div>
                  <div className="font-mono text-xs truncate">{p.email}</div>
                  <div className="text-muted-foreground text-xs truncate">{p.telefon ?? ""}</div>
                  <div className="text-muted-foreground text-xs truncate">
                    {[p.plz, p.stadt].filter(Boolean).join(" ")} <Badge variant="outline" className="ml-1">{p.land}</Badge>
                  </div>
                </div>
              ))}
              {parsed.length > 50 && (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  … {parsed.length - 50} weitere
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
