import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, FileEdit } from "lucide-react";
import { toast } from "sonner";
import {
  listEmailTemplates,
  createGmailDraft,
  sendGmailEmail,
  type DbEmailTemplate,
} from "@/lib/gmail.functions";
import type { DbLead } from "@/lib/marketing.functions";
import { useMode } from "@/hooks/useMode";

function applyVars(
  text: string,
  vars: { name?: string | null; stadt?: string | null; fachgebiet?: string | null },
): string {
  return text
    .replace(/\{name\}/g, vars.name?.trim() || "Damen und Herren")
    .replace(/\{stadt\}/g, vars.stadt?.trim() || "Ihrer Stadt")
    .replace(/\{fachgebiet\}/g, vars.fachgebiet?.trim() || "Ihrem Fachgebiet");
}

export function MailComposeDialog({
  lead,
  open,
  onOpenChange,
  onSent,
}: {
  lead: DbLead | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSent?: () => void;
}) {
  const { mode } = useMode();
  const fetchTemplates = useServerFn(listEmailTemplates);
  const sendEmail = useServerFn(sendGmailEmail);
  const draftEmail = useServerFn(createGmailDraft);

  const [templates, setTemplates] = useState<DbEmailTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [loadingTpl, setLoadingTpl] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingTpl(true);
    fetchTemplates({ data: { mode } })
      .then((r) => {
        if (r.ok) {
          setTemplates(r.items);
          // Bevorzugte Vorlage: default für Zielgruppe des Leads
          const preferred =
            r.items.find(
              (t) => t.zielgruppe === (lead?.zielgruppe ?? "") && t.is_default,
            ) ??
            r.items.find((t) => t.zielgruppe === (lead?.zielgruppe ?? "")) ??
            r.items[0];
          if (preferred) {
            setTemplateId(preferred.id);
            const vars = {
              name: lead?.name,
              stadt: lead?.stadt,
              fachgebiet: lead?.fachgebiet,
            };
            setSubject(applyVars(preferred.betreff, vars));
            setBody(applyVars(preferred.body_text, vars));
          } else {
            setTemplateId("");
            setSubject("");
            setBody("");
          }
        }
      })
      .finally(() => setLoadingTpl(false));
  }, [open, mode, lead, fetchTemplates]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl || !lead) return;
    const vars = { name: lead.name, stadt: lead.stadt, fachgebiet: lead.fachgebiet };
    setSubject(applyVars(tpl.betreff, vars));
    setBody(applyVars(tpl.body_text, vars));
  };

  const doSend = async () => {
    if (!lead) return;
    if (!subject.trim() || !body.trim()) {
      toast.error("Betreff und Text dürfen nicht leer sein.");
      return;
    }
    setBusy("send");
    try {
      const r = await sendEmail({
        data: {
          leadId: lead.id,
          subject: subject.trim(),
          bodyText: body,
          applyLabel: true,
        },
      });
      if (r.ok) {
        toast.success(`E-Mail gesendet an ${lead.email}`);
        onOpenChange(false);
        onSent?.();
      } else {
        toast.error(r.reason ?? "Versand fehlgeschlagen");
      }
    } finally {
      setBusy(null);
    }
  };

  const doDraft = async () => {
    if (!lead) return;
    setBusy("draft");
    try {
      const r = await draftEmail({
        data: {
          leadId: lead.id,
          subject: subject.trim() || undefined,
          bodyText: body || undefined,
        },
      });
      if (r.ok) {
        toast.success("Entwurf in Gmail gespeichert");
        onOpenChange(false);
        onSent?.();
      } else {
        toast.error(r.reason ?? "Entwurf fehlgeschlagen");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>E-Mail schreiben</DialogTitle>
          <DialogDescription>
            An <b>{lead?.email}</b>
            {lead?.name ? <> · {lead.name}</> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Vorlage</Label>
            <Select value={templateId} onValueChange={applyTemplate} disabled={loadingTpl}>
              <SelectTrigger>
                <SelectValue placeholder={loadingTpl ? "Lade Vorlagen…" : "Vorlage wählen"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.zielgruppe} {t.is_default ? "· Standard" : ""} — {t.betreff.slice(0, 40)}
                  </SelectItem>
                ))}
                {templates.length === 0 && !loadingTpl && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Keine Vorlagen. Erst unter „Vorlagen" anlegen.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Betreff</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Nachricht</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Platzhalter <code>{`{name}`}</code>, <code>{`{stadt}`}</code>,{" "}
              <code>{`{fachgebiet}`}</code> werden schon beim Auswählen der Vorlage ersetzt.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={doDraft} disabled={!!busy}>
            {busy === "draft" ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <FileEdit className="size-4 mr-2" />
            )}
            Als Entwurf speichern
          </Button>
          <Button onClick={doSend} disabled={!!busy}>
            {busy === "send" ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Send className="size-4 mr-2" />
            )}
            Senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
