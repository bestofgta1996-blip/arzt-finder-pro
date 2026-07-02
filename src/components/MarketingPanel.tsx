import { useEffect, useMemo, useState } from "react";
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
  type DbLead,
  type LeadStatusDb,
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
} from "lucide-react";

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

export function MarketingPanel() {
  const { mode } = useMode();
  const fetchLeads = useServerFn(listLeads);
  const patchLead = useServerFn(updateLead);
  const dropLead = useServerFn(deleteLead);
  const runGmaps = useServerFn(scrapeGoogleMapsHealthcare);

  // Suchformular
  const [zielgruppe, setZielgruppe] = useState<DsbZielgruppe>("Arztpraxen & MVZ");
  const [plz, setPlz] = useState("");
  const [radius, setRadius] = useState(15);
  const [limit, setLimit] = useState(150);
  const [loading, setLoading] = useState(false);
  const [onlyWithEmail, setOnlyWithEmail] = useState(true);

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

  // Gespeicherte Marketing-Leads (nur Google-Maps-Treffer)
  const [leads, setLeads] = useState<DbLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);

  const reloadLeads = async () => {
    setLeadsLoading(true);
    try {
      const r = await fetchLeads({ data: { mode } });
      if (r.ok) {
        // Nur Treffer aus der Recherche (Google Maps) mit gültiger E-Mail
        setLeads(
          r.leads.filter(
            (l) =>
              l.quelle_typ === "google_maps" &&
              /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email),
          ),
        );
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

  const handleSearch = async () => {
    if (!/^\d{4,5}$/.test(plz.trim())) {
      toast.error("Bitte eine gültige PLZ eingeben (4–5 Ziffern)");
      return;
    }
    setLoading(true);
    setResults([]);
    setLastRun(null);
    try {
      const r = await runGmaps({
        data: { zielgruppe, plz: plz.trim(), radiusKm: radius, limit },
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
        cellsTotal: r.cellsTotal,
        cellsUsed: r.cellsUsed,
      });
      toast.success(
        `${r.places} Orte gefunden · ${r.found} mit E-Mail · ${r.inserted} neu in Marketingliste`,
      );
      await reloadLeads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler bei der Suche");
    } finally {
      setLoading(false);
    }
  };

  const displayedResults = useMemo(
    () => (onlyWithEmail ? results.filter((r) => !!r.email) : results),
    [results, onlyWithEmail],
  );

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
            <Button
              onClick={handleSearch}
              disabled={loading}
              className="h-9"
              style={{ backgroundColor: CRM_PURPLE }}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Search className="size-4 mr-2" />
              )}
              Suchen &amp; importieren
            </Button>
          </div>

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
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="border-b">
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Stadt</th>
                  <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Adresse</th>
                  <th className="text-left px-3 py-2 font-medium">Telefon</th>
                  <th className="text-left px-3 py-2 font-medium">E-Mail</th>
                  <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Website</th>
                </tr>
              </thead>
              <tbody>
                {displayedResults.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-accent/40">
                    <td className="px-3 py-2 font-medium truncate max-w-[200px]">{r.name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.stadt ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground hidden md:table-cell truncate max-w-[280px]">
                      {r.adresse ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.telefon ? (
                        <a href={`tel:${r.telefon}`} className="text-primary hover:underline inline-flex items-center gap-1">
                          <Phone className="size-3" /> {r.telefon}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.email ? (
                        <a href={`mailto:${r.email}`} className="text-primary hover:underline inline-flex items-center gap-1 break-all">
                          <Mail className="size-3" /> {r.email}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">keine E-Mail</span>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      {r.website ? (
                        <a href={r.website} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline inline-flex items-center gap-1 truncate max-w-[200px]">
                          {r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Gespeicherte Marketingliste (nur Recherche-Treffer) */}
      <div className="rounded-md border bg-card">
        <div className="px-4 py-2 border-b flex items-center gap-2 text-sm font-medium">
          <Mail className="size-4" style={{ color: CRM_PURPLE }} />
          Marketingliste
          <Badge variant="outline" className="text-[10px]">{leads.length}</Badge>
          <span className="text-xs text-muted-foreground font-normal">
            · nur importierte Kartenrecherche-Treffer mit E-Mail
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => void reloadLeads()} disabled={leadsLoading}>
            <RefreshCw className={`size-4 ${leadsLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="max-h-[480px] overflow-auto">
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Noch keine Kontakte in der Marketingliste. Führe oben eine Suche aus – Treffer mit E-Mail landen automatisch hier.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="border-b">
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Stadt</th>
                  <th className="text-left px-3 py-2 font-medium">Telefon</th>
                  <th className="text-left px-3 py-2 font-medium">E-Mail</th>
                  <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Website</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-right px-3 py-2 font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b hover:bg-accent/40">
                    <td className="px-3 py-2 font-medium truncate max-w-[200px]">{l.name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.stadt ?? "—"}</td>
                    <td className="px-3 py-2">
                      {l.telefon ? (
                        <a href={`tel:${l.telefon}`} className="text-primary hover:underline inline-flex items-center gap-1">
                          <Phone className="size-3" /> {l.telefon}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <a href={`mailto:${l.email}`} className="text-primary hover:underline inline-flex items-center gap-1 break-all">
                        <Mail className="size-3" /> {l.email}
                      </a>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      {l.website ? (
                        <a href={l.website} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline inline-flex items-center gap-1 truncate max-w-[200px]">
                          {l.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={l.status}
                        onValueChange={(v) => setStatus(l.id, v as LeadStatusDb)}
                      >
                        <SelectTrigger className="h-7 text-xs w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as LeadStatusDb[]).map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLead(l.id)}
                        aria-label="Lead entfernen"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
