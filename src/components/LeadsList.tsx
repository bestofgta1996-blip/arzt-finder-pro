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
  STATUS_LABELS, STATUS_COLORS, newId,
} from "@/lib/leads";
import { exportCSV, exportXLSX, exportJSON, exportVCF } from "@/lib/exporters";
import { CsvImportDialog } from "@/components/CsvImportDialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Search as SearchIcon, Trash2, Pencil, ExternalLink, Mail, Phone, Upload, Plus, ChevronDown, FileSpreadsheet, FileJson, FileText, Contact } from "lucide-react";
import { toast } from "sonner";

type ExportFormat = "csv-semi" | "csv-comma" | "tsv" | "xlsx" | "json" | "vcf";

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

  const doExport = (which: Lead[], fmt: ExportFormat) => {
    if (which.length === 0) {
      toast.error("Keine Leads zum Export");
      return;
    }
    try {
      switch (fmt) {
        case "csv-semi": exportCSV(which, ";"); break;
        case "csv-comma": exportCSV(which, ","); break;
        case "tsv": exportCSV(which, "\t"); break;
        case "xlsx": exportXLSX(which); break;
        case "json": exportJSON(which); break;
        case "vcf": exportVCF(which); break;
      }
      toast.success(`${which.length} Lead(s) exportiert`);
    } catch (e) {
      toast.error("Export fehlgeschlagen: " + (e instanceof Error ? e.message : "Unbekannt"));
    }
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
            <div className="flex gap-2 flex-wrap">
              {selected.size > 0 && (
                <>
                  <ExportMenu
                    label={`Auswahl (${selected.size})`}
                    onExport={(fmt) => doExport(filtered.filter((l) => selected.has(l.id)), fmt)}
                    variant="outline"
                  />
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
                <Upload className="size-4" /> Import
              </Button>
              <ExportMenu
                label="Export"
                onExport={(fmt) => doExport(filtered, fmt)}
                variant="default"
              />
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

      <CsvImportDialog open={csvOpen} onOpenChange={setCsvOpen} onImport={onAddLeads} />

      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} onCreate={(l) => onAddLeads([l])} />
    </div>
  );
}

function ExportMenu({
  label, onExport, variant,
}: {
  label: string;
  onExport: (fmt: ExportFormat) => void;
  variant: "default" | "outline";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant={variant}>
          <Download className="size-4" /> {label} <ChevronDown className="size-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Format wählen</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onExport("xlsx")}>
          <FileSpreadsheet className="size-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("csv-semi")}>
          <FileText className="size-4" /> CSV (Semikolon, DE)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("csv-comma")}>
          <FileText className="size-4" /> CSV (Komma, intl.)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("tsv")}>
          <FileText className="size-4" /> TSV (Tab)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onExport("json")}>
          <FileJson className="size-4" /> JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("vcf")}>
          <Contact className="size-4" /> vCard (.vcf)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NewLeadDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (l: Lead) => void }) {
  const [draft, setDraft] = useState<Partial<Lead>>({ land: "DE", status: "neu", gerichtsgutachter: false });
  useEffect(() => {
    if (open) setDraft({ land: "DE", status: "neu", gerichtsgutachter: false });
  }, [open]);

  const save = () => {
    const email = (draft.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Bitte eine gültige E-Mail eingeben");
      return;
    }
    const lead: Lead = {
      id: newId(),
      name: (draft.name ?? "").trim() || email,
      praxis: draft.praxis,
      fachgebiet: draft.fachgebiet,
      email,
      telefon: draft.telefon,
      website: draft.website,
      adresse: draft.adresse,
      plz: draft.plz,
      stadt: draft.stadt,
      land: (draft.land as Country) ?? "DE",
      gerichtsgutachter: !!draft.gerichtsgutachter,
      notiz: draft.notiz,
      status: (draft.status as LeadStatus) ?? "neu",
      quelle: "Manuell angelegt",
      erstelltAm: new Date().toISOString(),
    };
    onCreate(lead);
    toast.success("Lead angelegt");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neuen Lead anlegen</DialogTitle>
          <DialogDescription>Pflichtfeld: gültige E-Mail. Alles andere optional.</DialogDescription>
        </DialogHeader>
        <LeadFormFields draft={draft} setDraft={setDraft} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={save}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ lead, onClose, onSave }: { lead: Lead | null; onClose: () => void; onSave: (p: Partial<Lead>) => void }) {
  const [draft, setDraft] = useState<Partial<Lead>>({});
  useEffect(() => { setDraft(lead ?? {}); }, [lead]);
  if (!lead) return null;
  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Lead bearbeiten</DialogTitle></DialogHeader>
        <LeadFormFields draft={draft} setDraft={setDraft} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => onSave(draft)}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadFormFields({ draft, setDraft }: { draft: Partial<Lead>; setDraft: (p: Partial<Lead>) => void }) {
  const set = (p: Partial<Lead>) => setDraft({ ...draft, ...p });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2"><Label>Name</Label><Input value={draft.name ?? ""} onChange={(e) => set({ name: e.target.value })} /></div>
      <div className="space-y-2"><Label>Praxis / Klinik</Label><Input value={draft.praxis ?? ""} onChange={(e) => set({ praxis: e.target.value })} /></div>
      <div className="space-y-2"><Label>E-Mail *</Label><Input type="email" value={draft.email ?? ""} onChange={(e) => set({ email: e.target.value })} /></div>
      <div className="space-y-2"><Label>Telefon</Label><Input value={draft.telefon ?? ""} onChange={(e) => set({ telefon: e.target.value })} /></div>
      <div className="space-y-2"><Label>Fachgebiet</Label><Input value={draft.fachgebiet ?? ""} onChange={(e) => set({ fachgebiet: e.target.value })} /></div>
      <div className="space-y-2"><Label>Website</Label><Input value={draft.website ?? ""} onChange={(e) => set({ website: e.target.value })} /></div>
      <div className="space-y-2"><Label>PLZ</Label><Input value={draft.plz ?? ""} onChange={(e) => set({ plz: e.target.value })} /></div>
      <div className="space-y-2"><Label>Stadt</Label><Input value={draft.stadt ?? ""} onChange={(e) => set({ stadt: e.target.value })} /></div>
      <div className="space-y-2 md:col-span-2"><Label>Adresse</Label><Input value={draft.adresse ?? ""} onChange={(e) => set({ adresse: e.target.value })} /></div>
      <div className="space-y-2"><Label>Land</Label>
        <Select value={draft.land ?? "DE"} onValueChange={(v) => set({ land: v as Country })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="DE">🇩🇪 Deutschland</SelectItem>
            <SelectItem value="PL">🇵🇱 Polen</SelectItem>
            <SelectItem value="Andere">Andere</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2"><Label>Status</Label>
        <Select value={draft.status ?? "neu"} onValueChange={(v) => set({ status: v as LeadStatus })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={!!draft.gerichtsgutachter} onCheckedChange={(c) => set({ gerichtsgutachter: c === true })} />
          Gerichtsgutachter / Sachverständiger
        </label>
      </div>
      <div className="space-y-2 md:col-span-2"><Label>Notiz</Label>
        <Textarea value={draft.notiz ?? ""} onChange={(e) => set({ notiz: e.target.value })} rows={3} />
      </div>
    </div>
  );
}
