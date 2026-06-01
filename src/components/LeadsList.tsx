import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type Lead, type LeadStatus, type Country,
  STATUS_LABELS, STATUS_COLORS, leadsToCSV, downloadCSV, newId,
} from "@/lib/leads";
import { CsvImportDialog } from "@/components/CsvImportDialog";
import { Download, Search as SearchIcon, Trash2, Pencil, ExternalLink, Mail, Phone, Upload, Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  leads: Lead[];
  onAddLeads: (leads: Lead[]) => void;
  onUpdate: (id: string, patch: Partial<Lead>) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
}

export function LeadsList({ leads, onAddLeads, onUpdate, onDelete, onDeleteMany }: Props) {
  const [q, setQ] = useState("");
  const [landFilter, setLandFilter] = useState<"alle" | Country>("alle");
  const [statusFilter, setStatusFilter] = useState<"alle" | LeadStatus>("alle");
  const [ggOnly, setGgOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Lead | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);


  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (landFilter !== "alle" && l.land !== landFilter) return false;
      if (statusFilter !== "alle" && l.status !== statusFilter) return false;
      if (ggOnly && !l.gerichtsgutachter) return false;
      if (!term) return true;
      return [l.name, l.email, l.praxis, l.fachgebiet, l.stadt, l.plz, l.notiz]
        .filter(Boolean).some((v) => v!.toLowerCase().includes(term));
    });
  }, [leads, q, landFilter, statusFilter, ggOnly]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((l) => l.id)));
    }
  };

  const exportCSV = (which: Lead[]) => {
    if (which.length === 0) {
      toast.error("Keine Leads zum Export");
      return;
    }
    const csv = leadsToCSV(which);
    downloadCSV(`gutachter-leads_${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`${which.length} Lead(s) exportiert`);
  };

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const l of leads) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    return byStatus;
  }, [leads]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-5 relative">
              <SearchIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Suchen (Name, E-Mail, Stadt, Notiz …)"
                className="pl-9"
              />
            </div>
            <div className="md:col-span-2">
              <Select value={landFilter} onValueChange={(v) => setLandFilter(v as typeof landFilter)}>
                <SelectTrigger><SelectValue placeholder="Land" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Länder</SelectItem>
                  <SelectItem value="DE">🇩🇪 Deutschland</SelectItem>
                  <SelectItem value="PL">🇵🇱 Polen</SelectItem>
                  <SelectItem value="Andere">Andere</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Status</SelectItem>
                  {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex items-center">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={ggOnly} onCheckedChange={(c) => setGgOnly(c === true)} />
                Nur Gerichtsgutachter
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Gesamt: {leads.length}</Badge>
              <Badge variant="outline">Gefiltert: {filtered.length}</Badge>
              {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => counts[s] ? (
                <Badge key={s} className={STATUS_COLORS[s]}>{STATUS_LABELS[s]}: {counts[s]}</Badge>
              ) : null)}
            </div>
            <div className="flex gap-2">
              {selected.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportCSV(filtered.filter((l) => selected.has(l.id)))}
                  >
                    <Download className="size-4" /> Auswahl ({selected.size})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onDeleteMany(Array.from(selected));
                      setSelected(new Set());
                    }}
                  >
                    <Trash2 className="size-4" /> Löschen
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
                <Plus className="size-4" /> Neuer Lead
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)}>
                <Upload className="size-4" /> CSV Import
              </Button>
              <Button size="sm" onClick={() => exportCSV(filtered)}>
                <Download className="size-4" /> CSV Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {leads.length === 0
              ? "Noch keine Leads. Wechsle zu „Suche“ oder „Einfügen“, um zu starten."
              : "Keine Treffer mit diesen Filtern."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr className="text-left">
                    <th className="p-3 w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </th>
                    <th className="p-3">Name / Praxis</th>
                    <th className="p-3">Kontakt</th>
                    <th className="p-3">Ort</th>
                    <th className="p-3">Fach</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 align-top">
                        <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggleSelected(l.id)} />
                      </td>
                      <td className="p-3 align-top">
                        <div className="font-medium flex items-center gap-2">
                          {l.name}
                          {l.gerichtsgutachter && <Badge variant="outline" className="text-xs">GG</Badge>}
                        </div>
                        {l.praxis && <div className="text-xs text-muted-foreground">{l.praxis}</div>}
                      </td>
                      <td className="p-3 align-top space-y-1">
                        <a href={`mailto:${l.email}`} className="text-xs font-mono flex items-center gap-1 hover:text-primary">
                          <Mail className="size-3" /> {l.email}
                        </a>
                        {l.telefon && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="size-3" /> {l.telefon}
                          </div>
                        )}
                        {l.website && (
                          <a href={l.website} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary truncate max-w-[200px]">
                            <ExternalLink className="size-3" /> Website
                          </a>
                        )}
                      </td>
                      <td className="p-3 align-top text-xs text-muted-foreground">
                        <div>{[l.plz, l.stadt].filter(Boolean).join(" ") || "—"}</div>
                        <Badge variant="outline" className="text-xs mt-1">{l.land}</Badge>
                      </td>
                      <td className="p-3 align-top text-xs text-muted-foreground">{l.fachgebiet ?? "—"}</td>
                      <td className="p-3 align-top">
                        <Select
                          value={l.status}
                          onValueChange={(v) => onUpdate(l.id, { status: v as LeadStatus })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
                              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3 align-top">
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditing(l)} aria-label="Bearbeiten">
                            <Pencil className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => onDelete(l.id)} aria-label="Löschen">
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <EditDialog lead={editing} onClose={() => setEditing(null)} onSave={(p) => {
        if (editing) onUpdate(editing.id, p);
        setEditing(null);
      }} />
    </div>
  );
}

function EditDialog({ lead, onClose, onSave }: { lead: Lead | null; onClose: () => void; onSave: (p: Partial<Lead>) => void }) {
  const [draft, setDraft] = useState<Partial<Lead>>({});
  useMemo(() => { setDraft(lead ?? {}); }, [lead]);
  if (!lead) return null;
  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Lead bearbeiten</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Name</Label><Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Praxis / Klinik</Label><Input value={draft.praxis ?? ""} onChange={(e) => setDraft({ ...draft, praxis: e.target.value })} /></div>
          <div className="space-y-2"><Label>E-Mail</Label><Input value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
          <div className="space-y-2"><Label>Telefon</Label><Input value={draft.telefon ?? ""} onChange={(e) => setDraft({ ...draft, telefon: e.target.value })} /></div>
          <div className="space-y-2"><Label>Fachgebiet</Label><Input value={draft.fachgebiet ?? ""} onChange={(e) => setDraft({ ...draft, fachgebiet: e.target.value })} /></div>
          <div className="space-y-2"><Label>Website</Label><Input value={draft.website ?? ""} onChange={(e) => setDraft({ ...draft, website: e.target.value })} /></div>
          <div className="space-y-2"><Label>PLZ</Label><Input value={draft.plz ?? ""} onChange={(e) => setDraft({ ...draft, plz: e.target.value })} /></div>
          <div className="space-y-2"><Label>Stadt</Label><Input value={draft.stadt ?? ""} onChange={(e) => setDraft({ ...draft, stadt: e.target.value })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Adresse</Label><Input value={draft.adresse ?? ""} onChange={(e) => setDraft({ ...draft, adresse: e.target.value })} /></div>
          <div className="space-y-2"><Label>Land</Label>
            <Select value={draft.land ?? "DE"} onValueChange={(v) => setDraft({ ...draft, land: v as Country })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DE">🇩🇪 Deutschland</SelectItem>
                <SelectItem value="PL">🇵🇱 Polen</SelectItem>
                <SelectItem value="Andere">Andere</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 flex items-end">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={draft.gerichtsgutachter ?? false} onCheckedChange={(c) => setDraft({ ...draft, gerichtsgutachter: c === true })} />
              Gerichtsgutachter
            </label>
          </div>
          <div className="space-y-2 md:col-span-2"><Label>Notiz</Label>
            <Textarea value={draft.notiz ?? ""} onChange={(e) => setDraft({ ...draft, notiz: e.target.value })} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => onSave(draft)}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
