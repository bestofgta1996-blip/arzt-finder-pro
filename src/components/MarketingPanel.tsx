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
  syncOutlookContacted,
  LAENDER,
  LAND_LABEL,
  type DbLead,
  type DbSearchJob,
  type LandCode,
  type LeadStatusDb,
} from "@/lib/marketing.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Trash2, Mail, CheckCircle2, RefreshCw, ExternalLink, Plus, Pause, Play } from "lucide-react";

const STATUS_LABEL: Record<LeadStatusDb, string> = {
  neu: "Neu",
  angeschrieben: "Angeschrieben",
  geantwortet: "Geantwortet",
  kunde: "Kunde",
  nicht_relevant: "Nicht relevant",
};

const STATUS_VARIANT: Record<LeadStatusDb, "default" | "secondary" | "outline" | "destructive"> = {
  neu: "secondary",
  angeschrieben: "default",
  geantwortet: "default",
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

export function MarketingPanel() {
  const fetchLeads = useServerFn(listLeads);
  const fetchJobs = useServerFn(listSearchJobs);
  const saveJob = useServerFn(upsertSearchJob);
  const removeJob = useServerFn(deleteSearchJob);
  const patchLead = useServerFn(updateLead);
  const dropLead = useServerFn(deleteLead);
  const syncOutlook = useServerFn(syncOutlookContacted);

  const [land, setLand] = useState<LandCode>("DE");
  const [leads, setLeads] = useState<DbLead[]>([]);
  const [jobs, setJobs] = useState<DbSearchJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
      const [l, j] = await Promise.all([fetchLeads({ data: {} }), fetchJobs()]);
      if (l.ok) setLeads(l.leads);
      if (j.ok) setJobs(j.jobs);
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
  }, []);

  const leadsByLand = useMemo(() => {
    const map = new Map<LandCode, DbLead[]>();
    for (const code of LAENDER) map.set(code, []);
    for (const l of leads) {
      const code = (LAENDER as readonly string[]).includes(l.land) ? (l.land as LandCode) : "DE";
      map.get(code)!.push(l);
    }
    return map;
  }, [leads]);

  const grouped = useMemo(() => {
    const list = leadsByLand.get(land) ?? [];
    const byFach = new Map<string, DbLead[]>();
    for (const l of list) {
      const key = l.fachgebiet?.trim() || "Ohne Fachgebiet";
      if (!byFach.has(key)) byFach.set(key, []);
      byFach.get(key)!.push(l);
    }
    // innerhalb jeder Fachgruppe: nach Qualitäts-Score absteigend
    for (const arr of byFach.values()) {
      arr.sort(
        (a, b) =>
          (b.qualitaet_score ?? 0) - (a.qualitaet_score ?? 0) ||
          (a.erstellt_am < b.erstellt_am ? 1 : -1),
      );
    }
    // Fachgebiete nach durchschnittlichem Score sortieren (wichtigste oben)
    return Array.from(byFach.entries()).sort((a, b) => {
      const avg = (xs: DbLead[]) =>
        xs.reduce((s, l) => s + (l.qualitaet_score ?? 0), 0) / Math.max(1, xs.length);
      return avg(b[1]) - avg(a[1]);
    });
  }, [leadsByLand, land]);

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
      },
    });
    if (res.ok) {
      toast.success("Dauersuche gespeichert – läuft stündlich");
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
      },
    });
    if (res.ok) void reload();
    else toast.error(res.error ?? "Fehler");
  };

  const removeOneJob = async (id: string) => {
    if (!confirm("Diese Dauersuche löschen?")) return;
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
      const r = await syncOutlook();
      if (r.ok) toast.success(`Outlook abgeglichen: ${r.matched} Lead(s) markiert`);
      else toast.info(r.reason ?? "Outlook nicht verbunden");
    } finally {
      setSyncing(false);
    }
  };

  const landJobs = jobs.filter((j) => j.land === land);

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <h3 className="font-semibold flex items-center gap-2">
              <Mail className="size-4" /> Outlook-Abgleich
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Markiert automatisch alle Leads als „Angeschrieben", deren E-Mail in den letzten 30 Tagen
              aus deinem Outlook-Postausgang versendet wurde. Outlook-Connector muss verbunden sein.
            </p>
          </div>
          <Button onClick={handleOutlookSync} disabled={syncing} variant="secondary">
            {syncing ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-4 mr-2" />}
            Outlook jetzt abgleichen
          </Button>
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
                <CardTitle className="text-base">Dauersuche für {LAND_LABEL[code]}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Läuft stündlich im Hintergrund und ergänzt neue Treffer automatisch.
                  {!(["DE", "PL"] as LandCode[]).includes(code) && (
                    <span className="block text-amber-600 mt-1">
                      Hinweis: Hintergrundsuche aktuell nur für DE und PL aktiv. Treffer für {LAND_LABEL[code]} können
                      über die manuelle Suche / den Verzeichnis-Scan ergänzt werden.
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
                      <Plus className="size-4 mr-1" /> Als Dauersuche speichern
                    </Button>
                  </div>

                  {landJobs.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground">Aktive Dauersuchen ({landJobs.length})</p>
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
                          <Button size="sm" variant="ghost" onClick={() => toggleJob(j)} title={j.aktiv ? "Pausieren" : "Aktivieren"}>
                            {j.aktiv ? <Pause className="size-4" /> : <Play className="size-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeOneJob(j.id)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base">
                    Marketingliste {LAND_LABEL[code]} · {counts[code]?.total ?? 0} Lead(s)
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {counts[code]?.contacted ?? 0} bereits angeschrieben · gruppiert nach Fachgebiet
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
                  <RefreshCw className={`size-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
                </Button>
              </CardHeader>
              <CardContent>
                {grouped.length === 0 && code === land && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Noch keine Leads für {LAND_LABEL[code]}. Lege eine Dauersuche an oder nutze den Tab „Suche".
                  </p>
                )}
                {code === land && grouped.map(([fach, list]) => (
                  <div key={fach} className="mb-6 last:mb-0">
                    <h4 className="font-semibold text-sm mb-2 sticky top-0 bg-background py-1">
                      {fach} <span className="text-muted-foreground font-normal">· {list.length}</span>
                    </h4>
                    <div className="space-y-1">
                      {list.map((lead) => (
                        <div key={lead.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 hover:bg-accent/40">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs break-all">{lead.email}</span>
                              <Badge variant={STATUS_VARIANT[lead.status]} className="text-[10px]">
                                {STATUS_LABEL[lead.status]}
                              </Badge>
                              {lead.last_contacted_at && (
                                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                                  <CheckCircle2 className="size-3" />
                                  {new Date(lead.last_contacted_at).toLocaleDateString("de-DE")}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {lead.name && <span>{lead.name}</span>}
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
                          <a
                            href={`mailto:${lead.email}`}
                            className="inline-flex items-center justify-center size-7 rounded hover:bg-accent"
                            title="Mail schreiben"
                          >
                            <Mail className="size-4" />
                          </a>
                          <Button size="sm" variant="ghost" onClick={() => removeOneLead(lead.id)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
