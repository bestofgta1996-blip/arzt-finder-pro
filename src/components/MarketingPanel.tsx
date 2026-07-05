import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listLeads,
  updateLead,
  deleteLead,
  LAND_LABEL,
  type DbLead,
  type LeadStatusDb,
  type LandCode,
} from "@/lib/marketing.functions";
import {
  scrapeGoogleMapsHealthcare,
  scrapeOsmHealthcare,
  DSB_ZIELGRUPPEN,
  type DsbZielgruppe,
} from "@/lib/sources.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMode } from "@/hooks/useMode";
import {
  Loader2,
  Trash2,
  Mail,
  Phone,
  ExternalLink,
  RefreshCw,
  Search,
  MapPin,
  Download,
} from "lucide-react";

const OHNE_KATEGORIE = "Ohne Kategorie";
const LAND_FLAG: Partial<Record<LandCode, string>> = {
  DE: "🇩🇪",
  PL: "🇵🇱",
  UK: "🇬🇧",
  FR: "🇫🇷",
  IT: "🇮🇹",
  ES: "🇪🇸",
};

// Microsoft Power Apps CRM Farbwelt (Fluent UI Purple)
const CRM_PURPLE = "#742774";

type PreviewRow = {
  email: string | null;
  name: string | null;
  website: string | null;
  adresse: string | null;
  telefon: string | null;
  stadt: string | null;
};

const STATUS_LABEL: Record<LeadStatusDb, string> = {
  neu: "Neu",
  angeschrieben: "Angeschrieben",
  geantwortet: "Geantwortet",
  bounce: "Bounce",
  kunde: "Kunde",
  nicht_relevant: "Nicht relevant",
};

function ResultCard({ r }: { r: PreviewRow }) {
  return (
    <div className="rounded-lg border bg-background p-3 space-y-1.5">
      <p className="font-medium truncate">{r.name ?? "—"}</p>
      {(r.stadt || r.adresse) && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0 mt-0.5" />
          <span className="truncate">{r.adresse ?? r.stadt}</span>
        </p>
      )}
      {r.telefon && (
        <a href={`tel:${r.telefon}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
          <Phone className="size-3.5 shrink-0" /> {r.telefon}
        </a>
      )}
      {r.email ? (
        <a href={`mailto:${r.email}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline break-all">
          <Mail className="size-3.5 shrink-0" /> {r.email}
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">keine E-Mail</p>
      )}
      {r.website && (
        <a
          href={r.website}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate"
        >
          <ExternalLink className="size-3.5 shrink-0" />
          <span className="truncate">{r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
        </a>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  showCategory,
  onStatusChange,
  onDelete,
}: {
  lead: DbLead;
  showCategory: boolean;
  onStatusChange: (status: LeadStatusDb) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border bg-background p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium truncate min-w-0">{lead.name ?? "—"}</p>
        <Button size="sm" variant="ghost" className="size-7 shrink-0 -mt-1 -mr-1" onClick={onDelete} aria-label="Lead entfernen">
          <Trash2 className="size-4" />
        </Button>
      </div>
      {showCategory && lead.fachgebiet && (
        <Badge variant="secondary" className="text-[10px] font-normal">
          {lead.fachgebiet}
        </Badge>
      )}
      <div className="space-y-1.5">
        {lead.stadt && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" /> {lead.stadt}
          </p>
        )}
        {lead.telefon && (
          <a href={`tel:${lead.telefon}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
            <Phone className="size-3.5 shrink-0" /> {lead.telefon}
          </a>
        )}
        <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline break-all">
          <Mail className="size-3.5 shrink-0" /> {lead.email}
        </a>
        {lead.website && (
          <a
            href={lead.website}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            <span className="truncate">{lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
          </a>
        )}
      </div>
      <Select value={lead.status} onValueChange={(v) => onStatusChange(v as LeadStatusDb)}>
        <SelectTrigger className="h-7 text-xs w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABEL) as LeadStatusDb[]).map((s) => (
            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function MarketingPanel() {
  const { mode } = useMode();
  const fetchLeads = useServerFn(listLeads);
  const patchLead = useServerFn(updateLead);
  const dropLead = useServerFn(deleteLead);
  const runGmaps = useServerFn(scrapeGoogleMapsHealthcare);
  const runOsm = useServerFn(scrapeOsmHealthcare);

  // Suchformular
  const [zielgruppe, setZielgruppe] = useState<DsbZielgruppe>("Arztpraxen & MVZ");
  const [plz, setPlz] = useState("");
  const [radius, setRadius] = useState(15);
  const [limit, setLimit] = useState(150);
  const [loading, setLoading] = useState(false);
  const [onlyWithEmail, setOnlyWithEmail] = useState(true);

  // Testlauf-Status
  const [testRunning, setTestRunning] = useState(false);
  const [testCancel, setTestCancel] = useState(false);
  const cancelRef = useRef(false);
  const [testProgress, setTestProgress] = useState<{
    current: number;
    target: number;
    zielgruppe: string;
    radius: number;
    iteration: number;
    source: string;
  } | null>(null);

  // Suchergebnisse (aktueller Lauf)
  const [results, setResults] = useState<PreviewRow[]>([]);
  const [lastRun, setLastRun] = useState<{
    places: number;
    found: number;
    inserted: number;
    skipped: number;
    cellsTotal?: number;
    cellsUsed?: number;
  } | null>(null);

  // Gespeicherte Marketing-Leads (alle Quellen: Kartenrecherche, Websuche, Import …)
  const [leads, setLeads] = useState<DbLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [land, setLand] = useState<string>("alle");
  const [kategorie, setKategorie] = useState<string>("alle");

  const reloadLeads = async () => {
    setLeadsLoading(true);
    try {
      const r = await fetchLeads({ data: { mode } });
      if (r.ok) {
        // Alle gesammelten Kontakte mit gültiger E-Mail – unabhängig von der Quelle,
        // damit nichts aus früheren Läufen "verschwindet".
        setLeads(r.leads.filter((l) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email)));
      }
    } finally {
      setLeadsLoading(false);
    }
  };

  useEffect(() => {
    void reloadLeads();
    const channel = supabase
      .channel("leads-marketing")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        void reloadLeads();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleSearch = async (source: "gmaps" | "osm") => {
    if (!/^\d{4,5}$/.test(plz.trim())) {
      toast.error("Bitte eine gültige PLZ eingeben (4–5 Ziffern)");
      return;
    }
    setLoading(true);
    setResults([]);
    setLastRun(null);
    try {
      const runner = source === "gmaps" ? runGmaps : runOsm;
      const r = await runner({
        data: { zielgruppe, plz: plz.trim(), radiusKm: radius, limit, mode },
      });
      if (!r.ok) {
        toast.error(r.error ?? "Suche fehlgeschlagen");
        return;
      }
      setResults(r.preview);
      setLastRun({
        places: r.places,
        found: r.found,
        inserted: r.inserted,
        skipped: r.skipped,
        cellsTotal: "cellsTotal" in r ? r.cellsTotal : undefined,
        cellsUsed: "cellsUsed" in r ? r.cellsUsed : undefined,
      });
      const label = source === "gmaps" ? "Google Maps" : "OpenStreetMap";
      toast.success(
        `${label}: ${r.places} Orte · ${r.found} mit E-Mail · ${r.inserted} neu`,
      );
      await reloadLeads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler bei der Suche");
    } finally {
      setLoading(false);
    }
  };

  const runTestlauf = async () => {
    if (!/^\d{4,5}$/.test(plz.trim())) {
      toast.error("Bitte eine gültige PLZ eingeben (4–5 Ziffern)");
      return;
    }
    setTestRunning(true);
    setTestCancel(false);
    cancelRef.current = false;
    const target = 100;
    const startTs = Date.now();
    const order: DsbZielgruppe[] = [
      zielgruppe,
      ...DSB_ZIELGRUPPEN.filter((z) => z !== zielgruppe),
    ];
    let currentRadius = radius;
    let iteration = 1;
    let totalGroupsRun = 0;
    let sourcesUsed = new Set<string>();

    const countLeads = async () => {
      const r = await fetchLeads({ data: { mode } });
      if (!r.ok) return 0;
      return r.leads.filter(
        (l) =>
          (l.quelle_typ === "google_maps" || l.quelle_typ === "openstreetmap") &&
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email),
      ).length;
    };

    let current = await countLeads();
    setTestProgress({ current, target, zielgruppe: order[0], radius: currentRadius, iteration, source: "-" });

    try {
      outer: while (current < target) {
        let progressedThisRound = false;
        for (const zg of order) {
          if (cancelRef.current) break outer;
          for (const src of ["osm", "gmaps"] as const) {
            if (cancelRef.current) break outer;
            setTestProgress({
              current,
              target,
              zielgruppe: zg,
              radius: currentRadius,
              iteration,
              source: src === "gmaps" ? "Google Maps" : "OpenStreetMap",
            });
            try {
              const runner = src === "gmaps" ? runGmaps : runOsm;
              const r = await runner({
                data: { zielgruppe: zg, plz: plz.trim(), radiusKm: currentRadius, limit, mode },
              });
              if (r.ok) {
                sourcesUsed.add(src);
                if (r.inserted > 0) progressedThisRound = true;
                setResults(r.preview);
                setLastRun({
                  places: r.places,
                  found: r.found,
                  inserted: r.inserted,
                  skipped: r.skipped,
                  cellsTotal: "cellsTotal" in r ? r.cellsTotal : undefined,
                  cellsUsed: "cellsUsed" in r ? r.cellsUsed : undefined,
                });
              }
            } catch (e) {
              console.warn("Testlauf-Fehler", zg, src, e);
            }
            await new Promise((res) => setTimeout(res, 500));
            current = await countLeads();
            totalGroupsRun++;
            setTestProgress({
              current,
              target,
              zielgruppe: zg,
              radius: currentRadius,
              iteration,
              source: src === "gmaps" ? "Google Maps" : "OpenStreetMap",
            });
            if (current >= target) break outer;
          }
        }
        if (!progressedThisRound) {
          if (currentRadius >= 50) {
            toast.warning(
              `Testlauf gestoppt: max. Radius erreicht, ${current}/${target} Leads.`,
            );
            break;
          }
          currentRadius = Math.min(50, currentRadius + 10);
          iteration++;
        } else {
          iteration++;
        }
      }
      const min = Math.round((Date.now() - startTs) / 60000);
      toast.success(
        `Testlauf beendet: ${current} Leads · ${totalGroupsRun} Läufe · ${sourcesUsed.size} Quellen · ${min} min`,
      );
      await reloadLeads();
    } finally {
      setTestRunning(false);
      setTestProgress(null);
      setTestCancel(false);
    }
  };

  const displayedResults = useMemo(
    () => (onlyWithEmail ? results.filter((r) => !!r.email) : results),
    [results, onlyWithEmail],
  );

  // Länder = oberste Gliederungsebene (z. B. Deutschland, Polen …)
  const laender = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) counts.set(l.land, (counts.get(l.land) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const leadsForLand = useMemo(() => {
    if (land === "alle") return leads;
    return leads.filter((l) => l.land === land);
  }, [leads, land]);

  // Kategorien = Fachgebiet/Zielgruppe je Lead (z. B. "Zahnärzte", "Medizinrecht", "Orthopädie" …),
  // innerhalb des aktuell gewählten Landes.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leadsForLand) {
      const key = (l.fachgebiet ?? "").trim() || OHNE_KATEGORIE;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [leadsForLand]);

  const displayedLeads = useMemo(() => {
    if (kategorie === "alle") return leadsForLand;
    return leadsForLand.filter((l) => ((l.fachgebiet ?? "").trim() || OHNE_KATEGORIE) === kategorie);
  }, [leadsForLand, kategorie]);

  // Bei "Alle" strukturiert nach Kategorie gruppieren, statt einer langen flachen Liste.
  const groupedLeads = useMemo(() => {
    if (kategorie !== "alle") return null;
    return categories.map(([name]) => [
      name,
      leadsForLand.filter((l) => ((l.fachgebiet ?? "").trim() || OHNE_KATEGORIE) === name),
    ] as [string, DbLead[]]);
  }, [categories, leadsForLand, kategorie]);

  useEffect(() => {
    if (land !== "alle" && !laender.some(([code]) => code === land)) {
      setLand("alle");
    }
  }, [laender, land]);

  useEffect(() => {
    if (kategorie !== "alle" && !categories.some(([name]) => name === kategorie)) {
      setKategorie("alle");
    }
  }, [categories, kategorie]);

  const exportKategorieCSV = () => {
    const headers = ["Name", "Land", "Kategorie", "Stadt", "Telefon", "E-Mail", "Website", "Status"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = displayedLeads.map((l) =>
      [l.name ?? "", LAND_LABEL[l.land] ?? l.land, l.fachgebiet ?? OHNE_KATEGORIE, l.stadt ?? "", l.telefon ?? "", l.email, l.website ?? "", STATUS_LABEL[l.status]]
        .map(escape)
        .join(";"),
    );
    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const landLabel = land === "alle" ? "alle-laender" : (LAND_LABEL[land as LandCode] ?? land);
    const katLabel = kategorie === "alle" ? "alle" : kategorie;
    a.download = `marketingliste_${landLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}_${katLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setStatus = async (id: string, status: LeadStatusDb) => {
    const r = await patchLead({ data: { id, status } });
    if (r.ok) void reloadLeads();
    else toast.error(r.error ?? "Fehler");
  };

  const removeLead = async (id: string) => {
    if (!confirm("Diesen Lead aus der Marketingliste entfernen?")) return;
    const r = await dropLead({ data: { id } });
    if (r.ok) void reloadLeads();
  };

  return (
    <div className="space-y-4">
      {/* Command Bar (Power Apps Stil) */}
      <div
        className="rounded-md border shadow-sm text-white"
        style={{ backgroundColor: CRM_PURPLE }}
      >
        <div className="px-4 py-2 flex items-center gap-2 text-sm font-medium">
          <Search className="size-4" />
          Karten-Recherche · Gesundheitswesen
        </div>
        <div className="bg-white text-foreground border-t p-4 rounded-b-md">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_100px_120px_auto] gap-3 items-end">
            <div>
              <Label className="text-xs">Zielgruppe</Label>
              <Select value={zielgruppe} onValueChange={(v) => setZielgruppe(v as DsbZielgruppe)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DSB_ZIELGRUPPEN.map((z) => (
                    <SelectItem key={z} value={z}>{z}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">PLZ</Label>
              <Input
                value={plz}
                onChange={(e) => setPlz(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="10115"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label className="text-xs">Radius (km)</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={radius}
                onChange={(e) => setRadius(Math.max(1, Math.min(50, Number(e.target.value) || 15)))}
              />
            </div>
            <div>
              <Label className="text-xs">Max. Treffer</Label>
              <Input
                type="number"
                min={20}
                max={300}
                step={10}
                value={limit}
                onChange={(e) => setLimit(Math.max(20, Math.min(300, Number(e.target.value) || 150)))}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => handleSearch("gmaps")}
                disabled={loading}
                className="h-9 flex-1"
                style={{ backgroundColor: CRM_PURPLE }}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Search className="size-4 mr-2" />
                )}
                Google Maps
              </Button>
              <Button
                onClick={() => handleSearch("osm")}
                disabled={loading}
                variant="outline"
                className="h-9 flex-1"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <MapPin className="size-4 mr-2" />
                )}
                OpenStreetMap
              </Button>
              {mode === "dsb" && (
                testRunning ? (
                  <Button
                    onClick={() => { cancelRef.current = true; setTestCancel(true); }}
                    variant="destructive"
                    className="h-9 flex-1"
                  >
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    onClick={() => void runTestlauf()}
                    disabled={loading}
                    variant="secondary"
                    className="h-9 flex-1"
                  >
                    Testlauf bis 100
                  </Button>
                )
              )}
            </div>
          </div>

          {testProgress && (
            <div className="mt-3 rounded border bg-purple-50 px-3 py-2 text-xs text-purple-900">
              <div className="flex items-center gap-2 font-medium">
                <Loader2 className="size-3 animate-spin" />
                Testlauf: {testProgress.current} / {testProgress.target} Leads
                <span className="text-purple-700">
                  · {testProgress.source} · {testProgress.zielgruppe} · Radius {testProgress.radius} km · Runde {testProgress.iteration}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded bg-purple-200 overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all"
                  style={{ width: `${Math.min(100, (testProgress.current / testProgress.target) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Statuszeile */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {loading && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                Grid-Suche läuft – bitte kurz warten …
              </span>
            )}
            {lastRun && !loading && (
              <>
                <span>
                  <b className="text-foreground">{lastRun.places}</b> Orte gefunden
                  {typeof lastRun.cellsTotal === "number" && (
                    <> · {lastRun.cellsUsed}/{lastRun.cellsTotal} Zellen</>
                  )}
                </span>
                <span>
                  <b className="text-foreground">{lastRun.found}</b> mit E-Mail
                </span>
                <span>
                  <b className="text-emerald-700">{lastRun.inserted}</b> neu in Marketingliste
                </span>
                <span>{lastRun.skipped} Duplikate</span>
              </>
            )}
            <div className="flex-1" />
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={onlyWithEmail}
                onCheckedChange={(c) => setOnlyWithEmail(c === true)}
              />
              Nur mit E-Mail anzeigen
            </label>
          </div>
        </div>
      </div>

      {/* Aktuelle Suchergebnisse */}
      <div className="rounded-md border bg-card">
        <div className="px-4 py-2 border-b flex items-center gap-2 text-sm font-medium">
          <MapPin className="size-4" style={{ color: CRM_PURPLE }} />
          Aktuelle Treffer
          <Badge variant="outline" className="text-[10px]">{displayedResults.length}</Badge>
        </div>
        <div className="max-h-[420px] overflow-auto">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Noch keine Suche gestartet. Wähle Zielgruppe, PLZ und Radius und klicke „Suchen &amp; importieren".
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
              {displayedResults.map((r, i) => (
                <ResultCard key={i} r={r} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Gespeicherte Marketingliste (nur Recherche-Treffer) */}
      <div className="rounded-md border bg-card">
        <div className="px-4 py-2 border-b flex items-center gap-2 text-sm font-medium flex-wrap">
          <Mail className="size-4 shrink-0" style={{ color: CRM_PURPLE }} />
          Marketingliste
          <Badge variant="outline" className="text-[10px]">{displayedLeads.length}</Badge>
          <span className="hidden sm:inline text-xs text-muted-foreground font-normal">
            · alle gesammelten Kontakte mit E-Mail, egal aus welcher Quelle
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={exportKategorieCSV} disabled={displayedLeads.length === 0}>
            <Download className="size-4 sm:mr-1" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void reloadLeads()} disabled={leadsLoading}>
            <RefreshCw className={`size-4 ${leadsLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {laender.length > 1 && (
          <div className="px-4 py-2 border-b flex flex-wrap gap-1.5">
            <button
              onClick={() => setLand("alle")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                land === "alle" ? "text-white" : "bg-muted hover:bg-muted/80"
              }`}
              style={land === "alle" ? { backgroundColor: "#1c3a52" } : undefined}
            >
              Alle Länder · {leads.length}
            </button>
            {laender.map(([code, count]) => (
              <button
                key={code}
                onClick={() => setLand(code)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  land === code ? "text-white" : "bg-muted hover:bg-muted/80"
                }`}
                style={land === code ? { backgroundColor: "#1c3a52" } : undefined}
              >
                {LAND_FLAG[code as LandCode] ?? ""} {LAND_LABEL[code as LandCode] ?? code} · {count}
              </button>
            ))}
          </div>
        )}

        {categories.length > 0 && (
          <div className="px-4 py-2 border-b flex flex-wrap gap-1.5">
            <button
              onClick={() => setKategorie("alle")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                kategorie === "alle" ? "text-white" : "bg-muted hover:bg-muted/80"
              }`}
              style={kategorie === "alle" ? { backgroundColor: CRM_PURPLE } : undefined}
            >
              Alle Fachrichtungen · {leadsForLand.length}
            </button>
            {categories.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setKategorie(name)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  kategorie === name ? "text-white" : "bg-muted hover:bg-muted/80"
                }`}
                style={kategorie === name ? { backgroundColor: CRM_PURPLE } : undefined}
              >
                {name} · {count}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[600px] overflow-auto">
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Noch keine Kontakte in der Marketingliste. Führe oben eine Suche aus – Treffer mit E-Mail landen automatisch hier.
            </p>
          ) : displayedLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Keine Kontakte in dieser Kategorie.
            </p>
          ) : groupedLeads ? (
            <div className="divide-y">
              {groupedLeads.map(([name, groupLeads]) => (
                <div key={name} className="p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{name}</h3>
                    <Badge variant="outline" className="text-[10px]">{groupLeads.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {groupLeads.map((l) => (
                      <LeadCard
                        key={l.id}
                        lead={l}
                        showCategory={false}
                        onStatusChange={(status) => setStatus(l.id, status)}
                        onDelete={() => removeLead(l.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
              {displayedLeads.map((l) => (
                <LeadCard
                  key={l.id}
                  lead={l}
                  showCategory
                  onStatusChange={(status) => setStatus(l.id, status)}
                  onDelete={() => removeLead(l.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
