import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listLeads,
  upsertSearchJob,
  listSearchJobs,
  deleteSearchJob,
  updateLead,
  deleteLead,
  syncOutlookAll,
  ensureOutlookFolders,
  getOutlookSyncState,
  LAENDER,
  LAND_LABEL,
  type DbLead,
  type DbSearchJob,
  type LandCode,
  type LeadStatusDb,
} from "@/lib/marketing.functions";
import {
  scrapeBrak,
  scrapeDsbHealthcare,
  BRAK_FACHGEBIETE,
  DSB_ZIELGRUPPEN,
  listSourceSearches,
  deleteSourceSearch,
  type BrakFachgebiet,
  type DsbZielgruppe,
  type DbSourceSearch,
} from "@/lib/sources.functions";
import {
  getGmailSyncState,
  syncGmailAll,
  ensureGmailLabels,
  createGmailDraft,
  listEmailTemplates,
  upsertEmailTemplate,
  deleteEmailTemplate,
  type DbEmailTemplate,
} from "@/lib/gmail.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useMode } from "@/hooks/useMode";
import { Loader2, Trash2, Mail, CheckCircle2, RefreshCw, ExternalLink, Plus, Pause, Play, FolderTree, Folder, FolderOpen, AlertTriangle, Inbox, Send, Scale, Download, History, Save, FileEdit, Tag, MailPlus, ShieldCheck } from "lucide-react";

const STATUS_LABEL: Record<LeadStatusDb, string> = {
  neu: "Neu",
  angeschrieben: "Angeschrieben",
  geantwortet: "Geantwortet",
  bounce: "Bounce",
  kunde: "Kunde",
  nicht_relevant: "Nicht relevant",
};

const STATUS_VARIANT: Record<LeadStatusDb, "default" | "secondary" | "outline" | "destructive"> = {
  neu: "secondary",
  angeschrieben: "default",
  geantwortet: "default",
  bounce: "destructive",
  kunde: "default",
  nicht_relevant: "outline",
};

const ZIELGRUPPEN_LABEL: Record<string, string> = {
  gutachter: "Gutachter",
  fachaerzte: "Fachärzte",
  kliniken: "Kliniken",
  versicherungen: "Versicherungen",
  anwaelte: "Anwälte",
  reha: "Reha",
  berufsgenossenschaft: "BG",
};

const ALL_FACH = "__all__";

interface OutlookState {
  connected: boolean;
  lastRunAt: string | null;
  lastSummary: { contacted: number; replied: number; bounced: number; moved: number } | null;
  folderCount: number;
}

interface GmailState {
  connected: boolean;
  lastRunAt: string | null;
  lastSummary: { contacted: number; replied: number; bounced: number; labeled: number } | null;
  labelCount: number;
}

export function MarketingPanel() {
  const { mode } = useMode();
  const fetchLeads = useServerFn(listLeads);
  const fetchJobs = useServerFn(listSearchJobs);
  const saveJob = useServerFn(upsertSearchJob);
  const removeJob = useServerFn(deleteSearchJob);
  const patchLead = useServerFn(updateLead);
  const dropLead = useServerFn(deleteLead);
  const syncOutlook = useServerFn(syncOutlookAll);
  const ensureFolders = useServerFn(ensureOutlookFolders);
  const fetchOutlookState = useServerFn(getOutlookSyncState);
  const runBrak = useServerFn(scrapeBrak);
  const fetchSourceSearches = useServerFn(listSourceSearches);
  const dropSourceSearch = useServerFn(deleteSourceSearch);
  const fetchGmailStateFn = useServerFn(getGmailSyncState);
  const runGmailSync = useServerFn(syncGmailAll);
  const runEnsureGmailLabels = useServerFn(ensureGmailLabels);
  const runCreateDraft = useServerFn(createGmailDraft);
  const fetchTemplates = useServerFn(listEmailTemplates);
  const saveTemplate = useServerFn(upsertEmailTemplate);
  const dropTemplate = useServerFn(deleteEmailTemplate);

  const [brakFach, setBrakFach] = useState<BrakFachgebiet>("Sozialrecht");
  const [brakOrt, setBrakOrt] = useState("");
  const [brakLimit, setBrakLimit] = useState(10);
  const [brakLoading, setBrakLoading] = useState(false);
  const [brakLast, setBrakLast] = useState<{ found: number; inserted: number; skipped: number } | null>(null);

  // DSB-Recherche im Gesundheitswesen
  const runDsb = useServerFn(scrapeDsbHealthcare);
  const [dsbZielgruppe, setDsbZielgruppe] = useState<DsbZielgruppe>("Arztpraxen & MVZ");
  const [dsbOrt, setDsbOrt] = useState("");
  const [dsbLimit, setDsbLimit] = useState(10);
  const [dsbLoading, setDsbLoading] = useState(false);
  const [dsbLast, setDsbLast] = useState<{ found: number; inserted: number; skipped: number } | null>(null);
  const [sourceSearches, setSourceSearches] = useState<DbSourceSearch[]>([]);

  const [land, setLand] = useState<LandCode>("DE");
  const [activeFach, setActiveFach] = useState<string>(ALL_FACH);
  const [leads, setLeads] = useState<DbLead[]>([]);
  const [jobs, setJobs] = useState<DbSearchJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creatingFolders, setCreatingFolders] = useState(false);
  const [moveToFolders, setMoveToFolders] = useState(false);
  const [outlookState, setOutlookState] = useState<OutlookState>({
    connected: false,
    lastRunAt: null,
    lastSummary: null,
    folderCount: 0,
  });
  const [gmailState, setGmailState] = useState<GmailState>({
    connected: false,
    lastRunAt: null,
    lastSummary: null,
    labelCount: 0,
  });
  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [creatingLabels, setCreatingLabels] = useState(false);
  const [applyLabels, setApplyLabels] = useState(false);

  const [templates, setTemplates] = useState<DbEmailTemplate[]>([]);
  const [tplEditor, setTplEditor] = useState<DbEmailTemplate | null>(null);
  const [tplSaving, setTplSaving] = useState(false);

  // Draft dialog state
  const [draftLead, setDraftLead] = useState<DbLead | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftTemplateId, setDraftTemplateId] = useState<string>("");
  const [draftSaving, setDraftSaving] = useState(false);

  // New job form
  const [newJob, setNewJob] = useState({
    fachgebiet: "Orthopädie",
    ort: "",
    zielgruppen: new Set<string>(["gutachter", "fachaerzte", "kliniken"]),
    gerichtsgutachter: false,
  });

  const reload = async () => {
    setLoading(true);
    try {
      const [l, j, o, s, g, t] = await Promise.all([
        fetchLeads({ data: { mode } }),
        fetchJobs({ data: { mode } }),
        fetchOutlookState(),
        fetchSourceSearches({ data: { mode } }),
        fetchGmailStateFn(),
        fetchTemplates({ data: { mode } }),
      ]);
      if (l.ok) setLeads(l.leads);
      if (j.ok) setJobs(j.jobs);
      if (o.ok) {
        setOutlookState({
          connected: o.connected,
          lastRunAt: o.lastRunAt,
          lastSummary: o.lastSummary,
          folderCount: o.folderCount,
        });
      }
      if (s.ok) setSourceSearches(s.items);
      if (g.ok) {
        setGmailState({
          connected: g.connected,
          lastRunAt: g.lastRunAt,
          lastSummary: g.lastSummary,
          labelCount: g.labelCount,
        });
      }
      if (t.ok) setTemplates(t.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    const channel = supabase
      .channel("leads-marketing")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        void reload();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const leadsByLand = useMemo(() => {
    const map = new Map<LandCode, DbLead[]>();
    for (const code of LAENDER) map.set(code, []);
    for (const l of leads) {
      const code = (LAENDER as readonly string[]).includes(l.land) ? (l.land as LandCode) : "DE";
      map.get(code)!.push(l);
    }
    return map;
  }, [leads]);

  // Fachgebiete für aktuell selektiertes Land mit Counts
  const fachFolders = useMemo(() => {
    const list = leadsByLand.get(land) ?? [];
    const map = new Map<string, { total: number; neu: number; kontaktiert: number; geantwortet: number; bounce: number }>();
    for (const l of list) {
      const key = l.fachgebiet?.trim() || "Ohne Fachgebiet";
      const entry = map.get(key) ?? { total: 0, neu: 0, kontaktiert: 0, geantwortet: 0, bounce: 0 };
      entry.total++;
      if (l.status === "neu") entry.neu++;
      else if (l.status === "angeschrieben") entry.kontaktiert++;
      else if (l.status === "geantwortet") entry.geantwortet++;
      else if (l.status === "bounce") entry.bounce++;
      map.set(key, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [leadsByLand, land]);

  // Reset Fach-Filter beim Landwechsel
  useEffect(() => {
    setActiveFach(ALL_FACH);
  }, [land]);

  const visibleLeads = useMemo(() => {
    const list = leadsByLand.get(land) ?? [];
    const filtered = activeFach === ALL_FACH
      ? list
      : list.filter((l) => (l.fachgebiet?.trim() || "Ohne Fachgebiet") === activeFach);
    return [...filtered].sort(
      (a, b) =>
        (b.qualitaet_score ?? 0) - (a.qualitaet_score ?? 0) ||
        (a.erstellt_am < b.erstellt_am ? 1 : -1),
    );
  }, [leadsByLand, land, activeFach]);

  const counts = useMemo(() => {
    const c: Record<LandCode, { total: number; contacted: number }> = {} as never;
    for (const code of LAENDER) {
      const arr = leadsByLand.get(code) ?? [];
      c[code] = {
        total: arr.length,
        contacted: arr.filter((l) => l.status === "angeschrieben" || l.status === "geantwortet" || l.status === "kunde").length,
      };
    }
    return c;
  }, [leadsByLand]);

  const handleSaveJob = async () => {
    if (!newJob.fachgebiet.trim()) {
      toast.error("Fachgebiet ist Pflicht");
      return;
    }
    const land2 = (["DE", "PL"].includes(land) ? land : "DE") as "DE" | "PL";
    const res = await saveJob({
      data: {
        land: land2,
        fachgebiet: newJob.fachgebiet.trim(),
        ort: newJob.ort.trim() || null,
        zielgruppen: Array.from(newJob.zielgruppen),
        gerichtsgutachter: newJob.gerichtsgutachter,
        aktiv: true,
        mode,
      },
    });
    if (res.ok) {
      toast.success("Suchprofil gespeichert");
      void reload();
    } else toast.error(res.error ?? "Fehler");
  };

  const toggleJob = async (j: DbSearchJob) => {
    const res = await saveJob({
      data: {
        id: j.id,
        land: j.land as "DE" | "PL",
        fachgebiet: j.fachgebiet,
        ort: j.ort,
        zielgruppen: j.zielgruppen,
        gerichtsgutachter: j.gerichtsgutachter,
        aktiv: !j.aktiv,
        mode,
      },
    });
    if (res.ok) void reload();
    else toast.error(res.error ?? "Fehler");
  };

  const removeOneJob = async (id: string) => {
    if (!confirm("Dieses Suchprofil löschen?")) return;
    const r = await removeJob({ data: { id } });
    if (r.ok) {
      toast.success("Gelöscht");
      void reload();
    }
  };

  const markContacted = async (id: string, status: LeadStatusDb) => {
    const r = await patchLead({ data: { id, status } });
    if (r.ok) void reload();
    else toast.error(r.error ?? "Fehler");
  };

  const removeOneLead = async (id: string) => {
    if (!confirm("Diesen Lead löschen?")) return;
    const r = await dropLead({ data: { id } });
    if (r.ok) void reload();
  };

  const handleOutlookSync = async () => {
    setSyncing(true);
    try {
      const r = await syncOutlook({ data: { moveToFolders } });
      if (r.ok) {
        const s = r.summary;
        toast.success(
          `Abgleich fertig: ${s.contacted} kontaktiert · ${s.replied} geantwortet · ${s.bounced} Bounce${moveToFolders ? ` · ${s.moved} verschoben` : ""}`,
        );
      } else {
        toast.error(r.reason ?? "Outlook-Sync fehlgeschlagen");
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleEnsureFolders = async () => {
    setCreatingFolders(true);
    try {
      const r = await ensureFolders();
      if (r.ok) {
        toast.success(`Outlook-Ordner aktualisiert: ${r.created} neu, ${r.total} insgesamt`);
        void reload();
      } else {
        toast.error(r.reason ?? "Ordner-Anlage fehlgeschlagen");
      }
    } finally {
      setCreatingFolders(false);
    }
  };

  const handleGmailSync = async () => {
    setGmailSyncing(true);
    try {
      const r = await runGmailSync({ data: { applyLabels } });
      if (r.ok) {
        const s = r.summary;
        toast.success(
          `Gmail-Abgleich fertig: ${s.contacted} kontaktiert · ${s.replied} geantwortet · ${s.bounced} Bounce${applyLabels ? ` · ${s.labeled} gelabelt` : ""}`,
        );
        void reload();
      } else {
        toast.error(r.reason ?? "Gmail-Abgleich fehlgeschlagen");
      }
    } finally {
      setGmailSyncing(false);
    }
  };

  const handleEnsureGmailLabels = async () => {
    setCreatingLabels(true);
    try {
      const r = await runEnsureGmailLabels();
      if (r.ok) {
        toast.success(`Gmail-Labels aktualisiert: ${r.created} neu, ${r.total} insgesamt`);
        void reload();
      } else {
        toast.error(r.reason ?? "Label-Anlage fehlgeschlagen");
      }
    } finally {
      setCreatingLabels(false);
    }
  };

  const openDraftDialog = (lead: DbLead) => {
    setDraftLead(lead);
    const tpl =
      templates.find(
        (t) => t.zielgruppe === (lead.zielgruppe ?? "") && t.is_default,
      ) ?? templates.find((t) => t.zielgruppe === (lead.zielgruppe ?? "")) ?? null;
    setDraftTemplateId(tpl?.id ?? "");
    setDraftSubject(tpl?.betreff ?? "");
    setDraftBody(tpl?.body_text ?? "");
  };

  const onPickTemplate = (id: string) => {
    setDraftTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setDraftSubject(tpl.betreff);
      setDraftBody(tpl.body_text);
    }
  };

  const submitDraft = async () => {
    if (!draftLead) return;
    if (!draftSubject.trim() || !draftBody.trim()) {
      toast.error("Betreff und Text dürfen nicht leer sein");
      return;
    }
    setDraftSaving(true);
    try {
      const r = await runCreateDraft({
        data: {
          leadId: draftLead.id,
          subject: draftSubject,
          bodyText: draftBody,
        },
      });
      if (r.ok) {
        toast.success(`Entwurf in Gmail angelegt – jetzt prüfen und senden`);
        setDraftLead(null);
        void reload();
      } else {
        toast.error(r.reason ?? "Entwurf konnte nicht angelegt werden");
      }
    } finally {
      setDraftSaving(false);
    }
  };

  const openTemplateEditor = (tpl: DbEmailTemplate | null) => {
    if (tpl) setTplEditor(tpl);
    else
      setTplEditor({
        id: "",
        zielgruppe: "anwaelte",
        sprache: "de",
        betreff: "",
        body_text: "",
        body_html: null,
        is_default: false,
        erstellt_am: "",
        updated_at: "",
      });
  };

  const submitTemplate = async () => {
    if (!tplEditor) return;
    if (!tplEditor.betreff.trim() || !tplEditor.body_text.trim()) {
      toast.error("Betreff und Text sind Pflicht");
      return;
    }
    setTplSaving(true);
    try {
      const r = await saveTemplate({
        data: {
          id: tplEditor.id || undefined,
          zielgruppe: tplEditor.zielgruppe,
          sprache: tplEditor.sprache || "de",
          betreff: tplEditor.betreff,
          body_text: tplEditor.body_text,
          body_html: tplEditor.body_html,
          is_default: tplEditor.is_default,
          mode,
        },
      });
      if (r.ok) {
        toast.success("Vorlage gespeichert");
        setTplEditor(null);
        void reload();
      } else {
        toast.error(r.error ?? "Vorlage konnte nicht gespeichert werden");
      }
    } finally {
      setTplSaving(false);
    }
  };

  const removeTemplate = async (id: string) => {
    if (!confirm("Diese Vorlage löschen?")) return;
    const r = await dropTemplate({ data: { id } });
    if (r.ok) {
      toast.success("Vorlage gelöscht");
      void reload();
    } else {
      toast.error(r.error ?? "Löschen fehlgeschlagen");
    }
  };

  const landJobs = jobs.filter((j) => j.land === land);

  return (
    <div className="space-y-6">
      {/* Outlook-Sync-Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="size-4" /> Outlook-Abgleich
            {outlookState.connected ? (
              <Badge variant="default" className="text-[10px]">verbunden</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                <AlertTriangle className="size-3 mr-1" /> nicht verbunden
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Aktualisiert Lead-Status automatisch aus deinem Outlook: gesendete Mails → <b>Angeschrieben</b>, Antworten → <b>Geantwortet</b>, Failure Notifications → <b>Bounce</b>. Optional werden zugehörige Mails in Fachgebiet-Ordner (<code>Leads/&lt;Land&gt;/&lt;Fach&gt;</code>) verschoben.
          </p>

          <div className="flex flex-wrap gap-3 items-center">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={moveToFolders} onCheckedChange={(c) => setMoveToFolders(c === true)} />
              Mails in Fachgebiet-Ordner verschieben
            </label>
            <div className="flex-1" />
            <Button onClick={handleEnsureFolders} disabled={creatingFolders} variant="outline" size="sm">
              {creatingFolders ? <Loader2 className="size-4 animate-spin mr-2" /> : <FolderTree className="size-4 mr-2" />}
              Outlook-Ordner anlegen
            </Button>
            <Button onClick={handleOutlookSync} disabled={syncing} variant="secondary">
              {syncing ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-4 mr-2" />}
              Jetzt mit Outlook abgleichen
            </Button>
          </div>

          {(outlookState.lastRunAt || outlookState.folderCount > 0) && (
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t">
              {outlookState.lastRunAt && (
                <span>
                  Letzter Sync: {new Date(outlookState.lastRunAt).toLocaleString("de-DE")}
                </span>
              )}
              {outlookState.lastSummary && (
                <>
                  <span className="inline-flex items-center gap-1"><Send className="size-3" /> {outlookState.lastSummary.contacted} kontaktiert</span>
                  <span className="inline-flex items-center gap-1"><Inbox className="size-3" /> {outlookState.lastSummary.replied} geantwortet</span>
                  <span className="inline-flex items-center gap-1"><AlertTriangle className="size-3" /> {outlookState.lastSummary.bounced} Bounce</span>
                </>
              )}
              <span className="inline-flex items-center gap-1"><Folder className="size-3" /> {outlookState.folderCount} Fachgebiet-Ordner gemappt</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gmail-Sync-Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="size-4" /> Gmail-Abgleich
            {gmailState.connected ? (
              <Badge variant="default" className="text-[10px]">verbunden</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                <AlertTriangle className="size-3 mr-1" /> nicht verbunden
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Läuft parallel zum Outlook-Abgleich. Liest Gesendete &amp; Posteingang aus Gmail und aktualisiert Lead-Status automatisch. Optional werden zugehörige Mails mit dem Gmail-Label <code>Leads/&lt;Land&gt;/&lt;Fach&gt;</code> versehen.
          </p>

          <div className="flex flex-wrap gap-3 items-center">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={applyLabels} onCheckedChange={(c) => setApplyLabels(c === true)} />
              Mails mit Fachgebiet-Label versehen
            </label>
            <div className="flex-1" />
            <Button onClick={handleEnsureGmailLabels} disabled={creatingLabels} variant="outline" size="sm">
              {creatingLabels ? <Loader2 className="size-4 animate-spin mr-2" /> : <Tag className="size-4 mr-2" />}
              Gmail-Labels anlegen
            </Button>
            <Button onClick={handleGmailSync} disabled={gmailSyncing} variant="secondary">
              {gmailSyncing ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-4 mr-2" />}
              Jetzt mit Gmail abgleichen
            </Button>
          </div>

          {(gmailState.lastRunAt || gmailState.labelCount > 0) && (
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t">
              {gmailState.lastRunAt && (
                <span>
                  Letzter Sync: {new Date(gmailState.lastRunAt).toLocaleString("de-DE")}
                </span>
              )}
              {gmailState.lastSummary && (
                <>
                  <span className="inline-flex items-center gap-1"><Send className="size-3" /> {gmailState.lastSummary.contacted} kontaktiert</span>
                  <span className="inline-flex items-center gap-1"><Inbox className="size-3" /> {gmailState.lastSummary.replied} geantwortet</span>
                  <span className="inline-flex items-center gap-1"><AlertTriangle className="size-3" /> {gmailState.lastSummary.bounced} Bounce</span>
                </>
              )}
              <span className="inline-flex items-center gap-1"><Tag className="size-3" /> {gmailState.labelCount} Labels gemappt</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anschreiben-Vorlagen */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileEdit className="size-4" /> Anschreiben-Vorlagen
            <Badge variant="outline" className="text-[10px]">{templates.length}</Badge>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => openTemplateEditor(null)}>
              <Plus className="size-4 mr-1" /> Neue Vorlage
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Platzhalter: <code>{"{name}"}</code>, <code>{"{stadt}"}</code>, <code>{"{fachgebiet}"}</code> – werden beim Erstellen eines Entwurfs automatisch ersetzt.
          </p>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Vorlagen. Lege oben eine neue an.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="uppercase text-[10px]">{ZIELGRUPPEN_LABEL[t.zielgruppe] ?? t.zielgruppe}</Badge>
                      <span className="font-medium text-sm truncate">{t.betreff}</span>
                      {t.is_default ? <Badge variant="secondary" className="text-[10px]">Standard</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body_text}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openTemplateEditor(t)} aria-label="Vorlage bearbeiten">
                      <FileEdit className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeTemplate(t.id)} aria-label="Vorlage löschen">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quellen: BRAK Anwaltsverzeichnis – nur im Gutachten-Modus */}
      {mode === "gutachten" && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="size-4" /> Quelle: BRAK Anwaltsverzeichnis
            <Badge variant="outline" className="text-[10px]">Deutschland</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sucht im amtlichen Anwaltsverzeichnis und auf Kanzleiwebsites nach
            <b> Fachanwält:innen</b> mit der gewählten Fachrichtung im angegebenen Ort.
            Treffer mit E-Mail werden automatisch als Leads (Zielgruppe: Anwälte) angelegt.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-1">
              <Label className="text-xs">Fachrichtung</Label>
              <Select value={brakFach} onValueChange={(v) => setBrakFach(v as BrakFachgebiet)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRAK_FACHGEBIETE.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Ort / Stadt</Label>
              <Input
                value={brakOrt}
                onChange={(e) => setBrakOrt(e.target.value)}
                placeholder="z. B. Berlin, München, Hamburg…"
              />
            </div>
            <div className="sm:col-span-1">
              <Label className="text-xs">Max. Treffer</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={brakLimit}
                onChange={(e) => setBrakLimit(Math.max(1, Math.min(30, Number(e.target.value) || 10)))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {brakLast ? (
                <span>
                  Letzter Lauf: {brakLast.found} Treffer mit E-Mail · <b>{brakLast.inserted}</b> neu importiert · {brakLast.skipped} Duplikate
                </span>
              ) : (
                <span>Quelle: rechtsanwaltsregister.org &amp; öffentliche Kanzleiwebsites</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!brakOrt.trim()) {
                    toast.error("Bitte zuerst einen Ort angeben");
                    return;
                  }
                  const res = await saveJob({
                    data: {
                      land: "DE",
                      fachgebiet: brakFach,
                      ort: brakOrt.trim(),
                      zielgruppen: ["anwaelte"],
                      gerichtsgutachter: false,
                      aktiv: true,
                      mode,
                    },
                  });
                  if (res.ok) {
                    toast.success("Als Suchprofil gespeichert – läuft jetzt fortlaufend");
                    void reload();
                  } else {
                    toast.error(res.error ?? "Konnte Profil nicht speichern");
                  }
                }}
                disabled={brakLoading}
              >
                <Save className="size-4 mr-2" /> Als Profil speichern
              </Button>
              <Button
                onClick={async () => {
                  if (!brakOrt.trim()) {
                    toast.error("Bitte einen Ort angeben");
                    return;
                  }
                  setBrakLoading(true);
                  try {
                    const r = await runBrak({
                      data: { fachgebiet: brakFach, ort: brakOrt.trim(), limit: brakLimit },
                    });
                    if (!r.ok) {
                      toast.error(r.error ?? "Suche fehlgeschlagen");
                    } else {
                      setBrakLast({ found: r.found, inserted: r.inserted, skipped: r.skipped });
                      toast.success(`${r.inserted} neue Anwaltskontakte importiert (${r.found} gefunden)`);
                      await reload();
                    }
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Fehler bei BRAK-Suche");
                  } finally {
                    setBrakLoading(false);
                  }
                }}
                disabled={brakLoading}
              >
                {brakLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Download className="size-4 mr-2" />}
                Suchen &amp; importieren
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Quellen: DSB Gesundheitswesen – nur im Datenschutz-Modus */}
      {mode === "dsb" && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="size-4" /> Quelle: DSB-Recherche im Gesundheitswesen
            <Badge variant="outline" className="text-[10px]">Deutschland</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sucht auf öffentlichen Websites nach Praxen, Kliniken, Apotheken und weiteren
            Gesundheitsdienstleistern mit E-Mail-Kontakt – für die Ansprache als externer
            Datenschutzbeauftragter (Zielgruppe: <b>Gesundheitswesen</b>).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-1">
              <Label className="text-xs">Zielgruppe</Label>
              <Select value={dsbZielgruppe} onValueChange={(v) => setDsbZielgruppe(v as DsbZielgruppe)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DSB_ZIELGRUPPEN.map((z) => (
                    <SelectItem key={z} value={z}>{z}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Ort / Stadt</Label>
              <Input
                value={dsbOrt}
                onChange={(e) => setDsbOrt(e.target.value)}
                placeholder="z. B. München, Hamburg, Region Stuttgart…"
              />
            </div>
            <div className="sm:col-span-1">
              <Label className="text-xs">Max. Treffer</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={dsbLimit}
                onChange={(e) => setDsbLimit(Math.max(1, Math.min(30, Number(e.target.value) || 10)))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {dsbLast ? (
                <span>
                  Letzter Lauf: {dsbLast.found} Treffer mit E-Mail · <b>{dsbLast.inserted}</b> neu importiert · {dsbLast.skipped} Duplikate
                </span>
              ) : (
                <span>Quellen: öffentliche Praxis-, Klinik- und Apotheken-Websites (Impressum)</span>
              )}
            </div>
            <Button
              onClick={async () => {
                if (!dsbOrt.trim()) {
                  toast.error("Bitte einen Ort angeben");
                  return;
                }
                setDsbLoading(true);
                try {
                  const r = await runDsb({
                    data: { zielgruppe: dsbZielgruppe, ort: dsbOrt.trim(), limit: dsbLimit },
                  });
                  if (!r.ok) {
                    toast.error(r.error ?? "Suche fehlgeschlagen");
                  } else {
                    setDsbLast({ found: r.found, inserted: r.inserted, skipped: r.skipped });
                    toast.success(`${r.inserted} neue DSB-Leads importiert (${r.found} gefunden)`);
                    await reload();
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Fehler bei DSB-Suche");
                } finally {
                  setDsbLoading(false);
                }
              }}
              disabled={dsbLoading}
            >
              {dsbLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Download className="size-4 mr-2" />}
              Suchen &amp; importieren
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Suchverlauf */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="size-4" /> Suchverlauf
            <Badge variant="outline" className="text-[10px]">{sourceSearches.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sourceSearches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Suchen protokolliert. Jeder Quellen-Lauf erscheint hier automatisch.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto">
              {sourceSearches.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-card p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="uppercase text-[10px]">{s.quelle}</Badge>
                      <span className="font-medium text-sm">{s.fachgebiet}</span>
                      {s.ort ? <span className="text-sm text-muted-foreground">· {s.ort}</span> : null}
                      {!s.ok ? (
                        <Badge variant="destructive" className="text-[10px]">Fehler</Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(s.erstellt_am).toLocaleString("de-DE")} ·{" "}
                      {s.found} Treffer · <b>{s.inserted}</b> neu · {s.skipped} Duplikate
                      {s.error ? <span className="text-destructive"> · {s.error}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {s.quelle === "brak" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const fg = BRAK_FACHGEBIETE.find((f) => f === s.fachgebiet);
                          if (fg) setBrakFach(fg);
                          if (s.ort) setBrakOrt(s.ort);
                          toast.info('Suchparameter übernommen – auf "Suchen & importieren" klicken');
                          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        aria-label="Suche wiederholen"
                      >
                        <RefreshCw className="size-4" />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const r = await dropSourceSearch({ data: { id: s.id } });
                        if (r.ok) {
                          setSourceSearches((prev) => prev.filter((x) => x.id !== s.id));
                        } else {
                          toast.error(r.error ?? "Löschen fehlgeschlagen");
                        }
                      }}
                      aria-label="Verlaufseintrag löschen"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>


      <Tabs value={land} onValueChange={(v) => setLand(v as LandCode)}>
        <TabsList className="flex-wrap h-auto">
          {LAENDER.map((code) => (
            <TabsTrigger key={code} value={code} className="gap-2">
              {LAND_LABEL[code]}
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {counts[code]?.total ?? 0}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {LAENDER.map((code) => (
          <TabsContent key={code} value={code} className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Suchprofil für {LAND_LABEL[code]}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Profile sind Vorlagen für die manuelle Suche. Im Tab „Suche" kannst du sie starten, Treffer werden hier ergänzt.
                  {!(["DE", "PL"] as LandCode[]).includes(code) && (
                    <span className="block text-amber-600 mt-1">
                      Hinweis: Profile aktuell nur für DE und PL nutzbar. Treffer für {LAND_LABEL[code]} kannst du über manuelle Suche / Import ergänzen.
                    </span>
                  )}
                </p>
              </CardHeader>
              {(["DE", "PL"] as LandCode[]).includes(code) && code === land && (
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Fachgebiet</Label>
                      <Input
                        value={newJob.fachgebiet}
                        onChange={(e) => setNewJob({ ...newJob, fachgebiet: e.target.value })}
                        placeholder="z. B. Orthopädie"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Stadt / Region (optional)</Label>
                      <Input
                        value={newJob.ort}
                        onChange={(e) => setNewJob({ ...newJob, ort: e.target.value })}
                        placeholder="z. B. München"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Gerichtsgutachter-Schwerpunkt</Label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer h-9">
                        <Checkbox
                          checked={newJob.gerichtsgutachter}
                          onCheckedChange={(c) => setNewJob({ ...newJob, gerichtsgutachter: c === true })}
                        />
                        Schwerpunkt Gerichtsgutachter
                      </label>
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block">Zielgruppen</Label>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(ZIELGRUPPEN_LABEL).map((zg) => {
                        const active = newJob.zielgruppen.has(zg);
                        return (
                          <button
                            key={zg}
                            type="button"
                            onClick={() => {
                              const next = new Set(newJob.zielgruppen);
                              if (active) next.delete(zg);
                              else next.add(zg);
                              setNewJob({ ...newJob, zielgruppen: next });
                            }}
                            className={`text-xs px-3 py-1.5 rounded-full border transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
                          >
                            {ZIELGRUPPEN_LABEL[zg]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSaveJob}>
                      <Plus className="size-4 mr-1" /> Suchprofil speichern
                    </Button>
                  </div>

                  {landJobs.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground">Gespeicherte Profile ({landJobs.length})</p>
                      {landJobs.map((j) => (
                        <div key={j.id} className="flex items-center justify-between gap-2 text-sm border rounded-md px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">
                              {j.fachgebiet}
                              {j.ort ? ` · ${j.ort}` : ""}
                              {!j.aktiv && <Badge variant="outline" className="ml-2 text-[10px]">pausiert</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {j.zielgruppen.map((z) => ZIELGRUPPEN_LABEL[z] ?? z).join(", ")}
                              {j.last_run_at ? ` · zuletzt ${new Date(j.last_run_at).toLocaleString("de-DE")}` : " · noch nicht gelaufen"}
                              {j.last_hit_count != null ? ` · ${j.last_hit_count} Treffer` : ""}
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => toggleJob(j)} title={j.aktiv ? "Pausieren" : "Aktivieren"} aria-label={j.aktiv ? "Suchprofil pausieren" : "Suchprofil aktivieren"}>
                            {j.aktiv ? <Pause className="size-4" /> : <Play className="size-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeOneJob(j.id)} aria-label="Suchprofil löschen">
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {code === land && (
              <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                {/* Fachgebiet-Sidebar */}
                <Card className="h-fit lg:sticky lg:top-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FolderTree className="size-4" /> Fachgebiete
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-2">
                    <button
                      onClick={() => setActiveFach(ALL_FACH)}
                      className={`w-full text-left text-sm rounded-md px-2 py-1.5 flex items-center justify-between gap-2 hover:bg-accent ${activeFach === ALL_FACH ? "bg-accent font-medium" : ""}`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        {activeFach === ALL_FACH ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
                        Alle
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{counts[code]?.total ?? 0}</Badge>
                    </button>
                    {fachFolders.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                        Noch keine Fachgebiete
                      </p>
                    )}
                    {fachFolders.map(([name, c]) => {
                      const isActive = activeFach === name;
                      return (
                        <button
                          key={name}
                          onClick={() => setActiveFach(name)}
                          className={`w-full text-left text-sm rounded-md px-2 py-1.5 hover:bg-accent ${isActive ? "bg-accent font-medium" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 truncate">
                              {isActive ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
                              <span className="truncate">{name}</span>
                            </span>
                            <Badge variant="secondary" className="text-[10px] shrink-0">{c.total}</Badge>
                          </div>
                          {(c.kontaktiert > 0 || c.geantwortet > 0 || c.bounce > 0) && (
                            <div className="flex gap-1 mt-1 ml-6 flex-wrap">
                              {c.kontaktiert > 0 && <span className="text-[10px] text-muted-foreground">📤 {c.kontaktiert}</span>}
                              {c.geantwortet > 0 && <span className="text-[10px] text-emerald-600">↩ {c.geantwortet}</span>}
                              {c.bounce > 0 && <span className="text-[10px] text-destructive">⚠ {c.bounce}</span>}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Lead-Liste */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-base">
                        {activeFach === ALL_FACH ? `Alle Fachgebiete · ${LAND_LABEL[code]}` : activeFach} · {visibleLeads.length} Lead(s)
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {counts[code]?.contacted ?? 0} insgesamt angeschrieben in {LAND_LABEL[code]}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
                      <RefreshCw className={`size-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {visibleLeads.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Keine Leads {activeFach === ALL_FACH ? `für ${LAND_LABEL[code]}` : `im Fachgebiet „${activeFach}"`}.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {visibleLeads.map((lead) => (
                          <div key={lead.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 hover:bg-accent/40">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  className={
                                    "text-[10px] border " +
                                    ((lead.qualitaet_score ?? 0) >= 60
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                      : (lead.qualitaet_score ?? 0) >= 30
                                      ? "bg-amber-100 text-amber-800 border-amber-200"
                                      : "bg-slate-100 text-slate-700 border-slate-200")
                                  }
                                  title={lead.qualitaets_merkmale?.join(" · ") || "Keine Pluspunkte erkannt"}
                                >
                                  ★ {lead.qualitaet_score ?? 0}
                                </Badge>
                                <span className="font-mono text-xs break-all">{lead.email}</span>
                                <Badge variant={STATUS_VARIANT[lead.status]} className="text-[10px]">
                                  {STATUS_LABEL[lead.status]}
                                </Badge>
                                {lead.last_contacted_at && (
                                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1" title="Zuletzt kontaktiert">
                                    <Send className="size-3" />
                                    {new Date(lead.last_contacted_at).toLocaleDateString("de-DE")}
                                  </span>
                                )}
                                {lead.last_replied_at && (
                                  <span className="text-[10px] text-emerald-700 inline-flex items-center gap-1" title="Letzte Antwort">
                                    <CheckCircle2 className="size-3" />
                                    {new Date(lead.last_replied_at).toLocaleDateString("de-DE")}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {lead.name && <span>{lead.name}</span>}
                                {lead.fachgebiet && activeFach === ALL_FACH && <span> · {lead.fachgebiet}</span>}
                                {lead.qualitaets_merkmale && lead.qualitaets_merkmale.length > 0 && (
                                  <span className="ml-1 text-[10px] opacity-75">
                                    {lead.qualitaets_merkmale.slice(0, 3).join(" · ")}
                                  </span>
                                )}
                                {lead.zielgruppe && <span> · {ZIELGRUPPEN_LABEL[lead.zielgruppe] ?? lead.zielgruppe}</span>}
                                {lead.stadt && <span> · {lead.stadt}</span>}
                                {lead.quelle_url && (
                                  <a href={lead.quelle_url} target="_blank" rel="noreferrer noopener" className="ml-1 inline-flex items-center gap-0.5 hover:text-primary">
                                    Quelle <ExternalLink className="size-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                            <Select
                              value={lead.status}
                              onValueChange={(v) => markContacted(lead.id, v as LeadStatusDb)}
                            >
                              <SelectTrigger className="h-7 w-[140px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(STATUS_LABEL) as LeadStatusDb[]).map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs">
                                    {STATUS_LABEL[s]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openDraftDialog(lead)}
                              disabled={!gmailState.connected}
                              title={gmailState.connected ? "Entwurf in Gmail anlegen" : "Gmail ist nicht verbunden"}
                              aria-label="Entwurf in Gmail anlegen"
                            >
                              <MailPlus className="size-4" />
                            </Button>
                            <a
                              href={`mailto:${lead.email}`}
                              className="inline-flex items-center justify-center size-7 rounded hover:bg-accent"
                              title="Mail schreiben"
                            >
                              <Mail className="size-4" />
                            </a>
                            <Button size="sm" variant="ghost" onClick={() => removeOneLead(lead.id)} aria-label="Lead löschen">
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Draft-Dialog */}
      <Dialog open={!!draftLead} onOpenChange={(o) => !o && setDraftLead(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Entwurf in Gmail anlegen</DialogTitle>
            <DialogDescription>
              {draftLead ? (
                <>
                  Empfänger: <b>{draftLead.name ?? draftLead.email}</b> &lt;{draftLead.email}&gt;
                  {draftLead.fachgebiet ? <> · {draftLead.fachgebiet}</> : null}
                  {draftLead.stadt ? <> · {draftLead.stadt}</> : null}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Vorlage</Label>
              <Select value={draftTemplateId} onValueChange={onPickTemplate}>
                <SelectTrigger><SelectValue placeholder="Vorlage wählen…" /></SelectTrigger>
                <SelectContent>
                  {templates
                    .filter((t) => !draftLead?.zielgruppe || t.zielgruppe === draftLead.zielgruppe)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {ZIELGRUPPEN_LABEL[t.zielgruppe] ?? t.zielgruppe} – {t.betreff}
                      </SelectItem>
                    ))}
                  {templates.length === 0 && (
                    <SelectItem value="__none" disabled>Keine Vorlagen vorhanden</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Betreff</Label>
              <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Text</Label>
              <Textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Platzhalter <code>{"{name}"}</code>, <code>{"{stadt}"}</code>, <code>{"{fachgebiet}"}</code> werden automatisch ersetzt.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftLead(null)} disabled={draftSaving}>
              Abbrechen
            </Button>
            <Button onClick={submitDraft} disabled={draftSaving}>
              {draftSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : <MailPlus className="size-4 mr-2" />}
              Entwurf anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template-Editor */}
      <Dialog open={!!tplEditor} onOpenChange={(o) => !o && setTplEditor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tplEditor?.id ? "Vorlage bearbeiten" : "Neue Vorlage"}</DialogTitle>
          </DialogHeader>
          {tplEditor && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Zielgruppe</Label>
                  <Select
                    value={tplEditor.zielgruppe}
                    onValueChange={(v) => setTplEditor({ ...tplEditor, zielgruppe: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ZIELGRUPPEN_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={tplEditor.is_default}
                      onCheckedChange={(c) => setTplEditor({ ...tplEditor, is_default: c === true })}
                    />
                    Standard-Vorlage für diese Zielgruppe
                  </label>
                </div>
              </div>
              <div>
                <Label className="text-xs">Betreff</Label>
                <Input
                  value={tplEditor.betreff}
                  onChange={(e) => setTplEditor({ ...tplEditor, betreff: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Text</Label>
                <Textarea
                  value={tplEditor.body_text}
                  onChange={(e) => setTplEditor({ ...tplEditor, body_text: e.target.value })}
                  rows={12}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplEditor(null)} disabled={tplSaving}>
              Abbrechen
            </Button>
            <Button onClick={submitTemplate} disabled={tplSaving}>
              {tplSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
