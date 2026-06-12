import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ExternalLink,
  RefreshCcw,
  Globe2,
  ShieldCheck,
  Eye,
  Send,
  X,
  Search,
  PlugZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listTenders,
  listPortals,
  togglePortal,
  updateTenderStatus,
  deleteTender,
  runTendersNow,
  runManualTenderSearch,
  type DbTender,
  type DbPortal,
  type TenderStatus,
} from "@/lib/tenders.functions";
import { supabase } from "@/integrations/supabase/client";

const STATUS_LABEL: Record<TenderStatus, string> = {
  neu: "Neu",
  beobachtet: "Beobachtet",
  beworben: "Beworben",
  verworfen: "Verworfen",
};
const STATUS_COLOR: Record<TenderStatus, string> = {
  neu: "bg-blue-100 text-blue-800 border-blue-200",
  beobachtet: "bg-amber-100 text-amber-800 border-amber-200",
  beworben: "bg-emerald-100 text-emerald-800 border-emerald-200",
  verworfen: "bg-slate-100 text-slate-600 border-slate-200",
};

function buildPortalUrl(portal: DbPortal, q: string): string {
  if (portal.such_url_vorlage) {
    return portal.such_url_vorlage.replace("{q}", encodeURIComponent(q || ""));
  }
  return portal.homepage ?? "#";
}

export function TendersPanel() {
  const fetchTenders = useServerFn(listTenders);
  const fetchPortals = useServerFn(listPortals);
  const togglePortalFn = useServerFn(togglePortal);
  const updateStatusFn = useServerFn(updateTenderStatus);
  const deleteFn = useServerFn(deleteTender);
  const runNow = useServerFn(runTendersNow);
  const runManual = useServerFn(runManualTenderSearch);

  const [tenders, setTenders] = useState<DbTender[]>([]);
  const [portals, setPortals] = useState<DbPortal[]>([]);
  const [statusFilter, setStatusFilter] = useState<TenderStatus | "alle">("alle");
  const [landFilter, setLandFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [manualKeywords, setManualKeywords] = useState("");
  const [manualLaender, setManualLaender] = useState("DE,AT,CH");
  const [manualRunning, setManualRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([
        fetchTenders({ data: { status: statusFilter, land: landFilter || undefined } }),
        fetchPortals(),
      ]);
      setTenders(t);
      setPortals(p);
    } catch (e) {
      toast.error("Konnte Ausschreibungen nicht laden", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, landFilter]);

  // Realtime auf tenders
  useEffect(() => {
    const channel = supabase
      .channel("tenders-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenders" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = tenders.filter((t) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      t.titel.toLowerCase().includes(s) ||
      (t.auftraggeber ?? "").toLowerCase().includes(s) ||
      (t.cpv ?? "").includes(s)
    );
  });

  const setStatus = async (id: string, status: TenderStatus) => {
    await updateStatusFn({ data: { id, status } });
    setTenders((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  };

  const onDelete = async (id: string) => {
    await deleteFn({ data: { id } });
    setTenders((prev) => prev.filter((t) => t.id !== id));
  };

  const onRunNow = async () => {
    setRefreshing(true);
    try {
      const res = (await runNow()) as { ok: boolean; new_tenders?: number; errors?: string[] };
      toast.success(`Suche abgeschlossen – ${res.new_tenders ?? 0} neue Treffer`, {
        description: res.errors?.length ? res.errors.join(" • ") : undefined,
      });
      await load();
    } catch (e) {
      toast.error("Suche fehlgeschlagen", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const onTogglePortal = async (p: DbPortal) => {
    await togglePortalFn({ data: { id: p.id, aktiv: !p.aktiv } });
    setPortals((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, aktiv: !p.aktiv } : x)),
    );
  };

  const grouped: Record<1 | 2 | 3, DbPortal[]> = { 1: [], 2: [], 3: [] };
  for (const p of portals) {
    const w = (p.wichtigkeit as 1 | 2 | 3) ?? 3;
    (grouped[w] ?? grouped[3]).push(p);
  }

  return (
    <Tabs defaultValue="treffer" className="space-y-6">
      <TabsList>
        <TabsTrigger value="treffer">Aktuelle Treffer</TabsTrigger>
        <TabsTrigger value="portale">Portale &amp; Verbindungen</TabsTrigger>
      </TabsList>

      <TabsContent value="treffer" className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe2 className="size-4" /> Öffentliche Ausschreibungen
                </CardTitle>
                <CardDescription>
                  Stündlich aktualisiert über TED (EU-Amtsblatt). Weitere Portale schrittweise im Tab „Portale &amp; Verbindungen".
                </CardDescription>
              </div>
              <Button onClick={onRunNow} disabled={refreshing} variant="outline" size="sm">
                <RefreshCcw className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Suche läuft …" : "Jetzt suchen"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Titel, Auftraggeber, CPV …"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TenderStatus | "alle")}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Status</SelectItem>
                  <SelectItem value="neu">Neu</SelectItem>
                  <SelectItem value="beobachtet">Beobachtet</SelectItem>
                  <SelectItem value="beworben">Beworben</SelectItem>
                  <SelectItem value="verworfen">Verworfen</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Land (z. B. DE, AT, FR)"
                value={landFilter}
                onChange={(e) => setLandFilter(e.target.value.toUpperCase().slice(0, 3))}
              />
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Lade …</p>
            ) : filtered.length === 0 ? (
              <div className="border border-dashed rounded-md p-6 text-center text-sm text-muted-foreground">
                Noch keine Treffer. Klicke oben auf „Jetzt suchen", um die TED-API abzufragen.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((t) => (
                  <div key={t.id} className="border rounded-md p-4 space-y-2 bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <h3 className="font-medium leading-tight line-clamp-2">{t.titel}</h3>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          {t.auftraggeber && <span>{t.auftraggeber}</span>}
                          {t.land && <Badge variant="outline" className="text-[10px]">{t.land}</Badge>}
                          {t.cpv && <Badge variant="outline" className="text-[10px]">CPV {t.cpv}</Badge>}
                          {t.frist && (
                            <span>Frist: {new Date(t.frist).toLocaleDateString("de-DE")}</span>
                          )}
                          {t.wert && (
                            <span>{Number(t.wert).toLocaleString("de-DE")} {t.waehrung ?? "EUR"}</span>
                          )}
                        </div>
                      </div>
                      <Badge className={STATUS_COLOR[t.status] + " border"}>
                        {STATUS_LABEL[t.status]}
                      </Badge>
                    </div>
                    {t.beschreibung && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{t.beschreibung}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {t.url && (
                        <Button asChild variant="default" size="sm">
                          <a href={t.url} target="_blank" rel="noreferrer noopener">
                            <ExternalLink /> Auf Portal öffnen
                          </a>
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setStatus(t.id, "beobachtet")}>
                        <Eye /> Beobachten
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setStatus(t.id, "beworben")}>
                        <Send /> Beworben
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setStatus(t.id, "verworfen")}>
                        <X /> Verwerfen
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive ml-auto"
                        onClick={() => onDelete(t.id)}
                      >
                        Löschen
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="portale" className="space-y-6">
        {[1, 2, 3].map((stufe) => (
          <Card key={stufe}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Stufe {stufe} –{" "}
                {stufe === 1 ? "Pflicht (EU & DE, offen)" : stufe === 2 ? "Wichtige DE/AT/CH Portale" : "International / Spezial"}
              </CardTitle>
              <CardDescription>
                {stufe === 1
                  ? "Diese Portale sind ohne Login nutzbar und werden zuerst eingebunden."
                  : stufe === 2
                  ? "Konto-Anlage empfohlen für vollen Zugang. Aktivierung Schritt für Schritt."
                  : "Spezialisierte Portale weltweit. Anbindung nach Bedarf."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {grouped[stufe as 1 | 2 | 3].map((p) => (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-3 border rounded-md p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.name}</span>
                      <Badge variant="outline" className="text-[10px]">{p.land}</Badge>
                      <Badge
                        className={
                          "border text-[10px] " +
                          (p.status === "live"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : p.status === "manuell"
                            ? "bg-amber-100 text-amber-800 border-amber-200"
                            : "bg-slate-100 text-slate-700 border-slate-200")
                        }
                      >
                        {p.status === "live" ? "Live" : p.status === "manuell" ? "Suchlink" : "Geplant"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">{p.verbindungstyp}</Badge>
                    </div>
                    {p.anmelde_hinweis && (
                      <p className="text-xs text-muted-foreground">{p.anmelde_hinweis}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.such_url_vorlage && (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={buildPortalUrl(p, "medizinisches Gutachten")}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <ExternalLink /> Öffnen
                        </a>
                      </Button>
                    )}
                    <Button
                      variant={p.aktiv ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => onTogglePortal(p)}
                    >
                      <PlugZap />
                      {p.aktiv ? "Aktiv" : "Inaktiv"}
                    </Button>
                  </div>
                </div>
              ))}
              {grouped[stufe as 1 | 2 | 3].length === 0 && (
                <p className="text-sm text-muted-foreground">Keine Portale in dieser Stufe.</p>
              )}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Weiteres Portal anbinden</CardTitle>
            <CardDescription>
              Sag mir einfach, welches Portal als nächstes dazu soll – ich richte die Anbindung
              (API-Key, Login, RSS) für dich ein und schalte das Portal dann auf „Live".
            </CardDescription>
          </CardHeader>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
