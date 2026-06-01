import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_TEMPLATES, applyTemplate, type MailTemplate } from "@/lib/templates";
import { Copy, Mail } from "lucide-react";
import { toast } from "sonner";

export function TemplatesPanel() {
  const [sprache, setSprache] = useState<"DE" | "PL">("DE");
  const templates = useMemo(() => DEFAULT_TEMPLATES.filter((t) => t.sprache === sprache), [sprache]);
  const [activeId, setActiveId] = useState(templates[0]?.id ?? "");
  const active = templates.find((t) => t.id === activeId) ?? templates[0];

  const [name, setName] = useState("Frau Dr. Müller");
  const [fach, setFach] = useState("Orthopädie");

  const [draftBetreff, setDraftBetreff] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState<string | null>(null);

  const rendered = active
    ? applyTemplate(active, { name, fachgebiet: fach })
    : { betreff: "", body: "" };

  const currentBetreff = draftBetreff ?? rendered.betreff;
  const currentBody = draftBody ?? rendered.body;

  const switchTpl = (t: MailTemplate) => {
    setActiveId(t.id);
    setDraftBetreff(null);
    setDraftBody(null);
  };

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${what} kopiert`);
  };

  const openMailto = () => {
    const url = `mailto:?subject=${encodeURIComponent(currentBetreff)}&body=${encodeURIComponent(currentBody)}`;
    window.location.href = url;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">E-Mail-Vorlagen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Personalisiere die Anrede und das Fachgebiet, kopiere den Text oder öffne dein E-Mail-Programm.
            Platzhalter: <code>{`{{name}}`}</code>, <code>{`{{fachgebiet}}`}</code>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={sprache} onValueChange={(v) => { setSprache(v as "DE" | "PL"); setDraftBetreff(null); setDraftBody(null); }}>
            <TabsList>
              <TabsTrigger value="DE">🇩🇪 Deutsch</TabsTrigger>
              <TabsTrigger value="PL">🇵🇱 Polski</TabsTrigger>
            </TabsList>
            <TabsContent value={sprache} className="mt-4">
              <div className="flex flex-wrap gap-2 mb-4">
                {templates.map((t) => (
                  <Button
                    key={t.id}
                    size="sm"
                    variant={t.id === activeId ? "default" : "outline"}
                    onClick={() => switchTpl(t)}
                  >
                    {t.titel}
                  </Button>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Anrede / Name</Label>
              <Input value={name} onChange={(e) => { setName(e.target.value); setDraftBetreff(null); setDraftBody(null); }} />
            </div>
            <div className="space-y-2">
              <Label>Fachgebiet</Label>
              <Input value={fach} onChange={(e) => { setFach(e.target.value); setDraftBetreff(null); setDraftBody(null); }} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Betreff</Label>
              <Button size="sm" variant="ghost" onClick={() => copy(currentBetreff, "Betreff")}>
                <Copy className="size-3" /> Kopieren
              </Button>
            </div>
            <Input value={currentBetreff} onChange={(e) => setDraftBetreff(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Nachricht</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => copy(currentBody, "Nachricht")}>
                  <Copy className="size-3" /> Kopieren
                </Button>
                <Button size="sm" onClick={openMailto}>
                  <Mail className="size-3" /> Im Mail-Programm öffnen
                </Button>
              </div>
            </div>
            <Textarea
              value={currentBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={16}
              className="font-sans text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{currentBody.length} Zeichen</Badge>
            <Badge variant="outline">{currentBody.split(/\s+/).filter(Boolean).length} Wörter</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
