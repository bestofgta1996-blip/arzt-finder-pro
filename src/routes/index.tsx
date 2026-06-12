import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SearchPanel } from "@/components/SearchPanel";
import { PastePanel } from "@/components/PastePanel";
import { LeadsList } from "@/components/LeadsList";
import { TemplatesPanel } from "@/components/TemplatesPanel";
import { MarketingPanel } from "@/components/MarketingPanel";
import { TendersPanel } from "@/components/TendersPanel";
import { loadLeads, saveLeads, type Lead } from "@/lib/leads";
import { upsertLeads, LAENDER } from "@/lib/marketing.functions";
import { Stethoscope, Globe2, Menu, ListChecks, FileSearch, Search, ClipboardPaste, Database, FileText } from "lucide-react";

const NAV_ITEMS = [
  { value: "marketing", label: "Marketinglisten", icon: ListChecks },
  { value: "ausschreibungen", label: "Ausschreibungen", icon: FileSearch },
  { value: "suche", label: "Suche", icon: Search },
  { value: "einfuegen", label: "Einfügen", icon: ClipboardPaste },
  { value: "leads", label: "Lokal", icon: Database },
  { value: "vorlagen", label: "Vorlagen", icon: FileText },
] as const;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IMB Akquise – Ärzte, Gutachter & Marketinglisten (DE/PL/EU)" },
      { name: "description", content: "Persistente Marketinglisten pro Land mit Dauersuche und Outlook-Abgleich – Ärzte, Gerichtsgutachter und Kliniken in DE, PL und Europa finden und verfolgen." },
      { property: "og:title", content: "IMB Akquise – Marketinglisten pro Land" },
      { property: "og:description", content: "Ärzte und Sachverständige finden, in Marketinglisten verwalten, Outlook-Status synchronisieren." },
    ],
  }),
  component: Home,
});

function Home() {
  const cloudUpsert = useServerFn(upsertLeads);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState("marketing");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLeads(loadLeads());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveLeads(leads);
  }, [leads, hydrated]);

  const addLeads = (incoming: Lead[]) => {
    setLeads((prev) => {
      const byEmail = new Map(prev.map((l) => [l.email.toLowerCase(), l]));
      let added = 0;
      for (const l of incoming) {
        const key = l.email.toLowerCase();
        if (!byEmail.has(key)) {
          byEmail.set(key, l);
          added++;
        }
      }
      if (added > 0) setTimeout(() => setTab("marketing"), 600);
      return Array.from(byEmail.values()).sort(
        (a, b) => (a.erstelltAm < b.erstelltAm ? 1 : -1),
      );
    });

    // Push to Cloud marketing list (best-effort, silent)
    const cloudRows = incoming
      .filter((l) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email))
      .map((l) => {
        const land = (LAENDER as readonly string[]).includes(l.land) ? l.land : "DE";
        return {
          land: land as never,
          email: l.email.toLowerCase(),
          fachgebiet: l.fachgebiet ?? null,
          name: l.name ?? null,
          telefon: l.telefon ?? null,
          website: l.website ?? null,
          stadt: l.stadt ?? null,
          quelle_url: l.website ?? null,
          quelle_typ: l.quelle ?? null,
          gerichtsgutachter: l.gerichtsgutachter,
        };
      });
    if (cloudRows.length > 0) {
      cloudUpsert({ data: { leads: cloudRows } }).catch(() => {
        /* offline: ignore, lokal bleibt erhalten */
      });
    }
  };

  const updateLead = (id: string, patch: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const deleteLead = (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
  };

  const deleteMany = (ids: string[]) => {
    const s = new Set(ids);
    setLeads((prev) => prev.filter((l) => !s.has(l.id)));
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" />

      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Stethoscope className="size-5" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-semibold leading-tight">IMB Akquise</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Globe2 className="size-3" /> Marketinglisten pro Land · Dauersuche · Outlook-Abgleich
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground hidden md:block">
            <span className="font-medium text-foreground">{leads.length}</span> lokale Lead(s)
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid md:grid-cols-6">
            <TabsTrigger value="marketing">Marketinglisten</TabsTrigger>
            <TabsTrigger value="ausschreibungen">Ausschreibungen</TabsTrigger>
            <TabsTrigger value="suche">Suche</TabsTrigger>
            <TabsTrigger value="einfuegen">Einfügen</TabsTrigger>
            <TabsTrigger value="leads">
              Lokal {leads.length > 0 && <span className="ml-1 text-xs opacity-70">({leads.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="vorlagen">Vorlagen</TabsTrigger>
          </TabsList>

          <TabsContent value="marketing"><MarketingPanel /></TabsContent>
          <TabsContent value="ausschreibungen"><TendersPanel /></TabsContent>
          <TabsContent value="suche"><SearchPanel onAddLeads={addLeads} /></TabsContent>
          <TabsContent value="einfuegen"><PastePanel onAddLeads={addLeads} /></TabsContent>
          <TabsContent value="leads">
            <LeadsList leads={leads} onAddLeads={addLeads} onUpdate={updateLead} onDelete={deleteLead} onDeleteMany={deleteMany} />
          </TabsContent>
          <TabsContent value="vorlagen"><TemplatesPanel /></TabsContent>
        </Tabs>

        <footer className="mt-12 pt-6 border-t text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Hinweis zum Datenschutz:</strong> Marketinglisten werden in Lovable Cloud gespeichert.
            Beim Anschreiben von Ärzten in DE/PL/EU sind DSGVO/RODO und das jeweilige Wettbewerbsrecht zu beachten –
            Kaltakquise per E-Mail ist nur mit berechtigtem Interesse oder Einwilligung zulässig.
          </p>
        </footer>
      </main>
    </div>
  );
}
