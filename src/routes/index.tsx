import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { SearchPanel } from "@/components/SearchPanel";
import { PastePanel } from "@/components/PastePanel";
import { LeadsList } from "@/components/LeadsList";
import { TemplatesPanel } from "@/components/TemplatesPanel";
import { loadLeads, saveLeads, type Lead } from "@/lib/leads";
import { Stethoscope, Globe2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gutachter-Akquise – Ärzte & Sachverständige finden (DE/PL)" },
      { name: "description", content: "Akquise-Werkzeug für medizinische Gutachten: Ärzte und Gerichtsgutachter in Deutschland und Polen finden, Kontakte sammeln, Kampagnen verfolgen und Anschreiben in DE/PL versenden." },
      { property: "og:title", content: "Gutachter-Akquise – DE/PL" },
      { property: "og:description", content: "Ärzte und Sachverständige finden, Leads verwalten, Anschreiben in zwei Sprachen." },
    ],
  }),
  component: Home,
});

function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState("suche");
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
      // After import, switch to leads tab if anything was added
      if (added > 0) setTimeout(() => setTab("leads"), 600);
      return Array.from(byEmail.values()).sort(
        (a, b) => (a.erstelltAm < b.erstelltAm ? 1 : -1),
      );
    });
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
              <h1 className="text-base md:text-lg font-semibold leading-tight">Gutachter-Akquise</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Globe2 className="size-3" /> Deutschland &amp; Polen · Ärzte, Praxen, Gerichtsgutachter
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{leads.length}</span> Lead(s) gespeichert
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid md:grid-cols-4">
            <TabsTrigger value="suche">Suche</TabsTrigger>
            <TabsTrigger value="einfuegen">Einfügen</TabsTrigger>
            <TabsTrigger value="leads">
              Leads {leads.length > 0 && <span className="ml-1 text-xs opacity-70">({leads.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="vorlagen">Vorlagen</TabsTrigger>
          </TabsList>

          <TabsContent value="suche"><SearchPanel onAddLeads={addLeads} /></TabsContent>
          <TabsContent value="einfuegen"><PastePanel onAddLeads={addLeads} /></TabsContent>
          <TabsContent value="leads">
            <LeadsList leads={leads} onAddLeads={addLeads} onUpdate={updateLead} onDelete={deleteLead} onDeleteMany={deleteMany} />
          </TabsContent>
          <TabsContent value="vorlagen"><TemplatesPanel /></TabsContent>
        </Tabs>

        <footer className="mt-12 pt-6 border-t text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Hinweis zum Datenschutz:</strong> Alle Leads werden ausschließlich lokal in deinem
            Browser gespeichert (kein Server, kein Login). Beim Anschreiben von Ärzten in DE/PL sind
            DSGVO/RODO und das jeweilige Wettbewerbsrecht zu beachten – Kaltakquise per E-Mail ist nur
            zulässig, wenn ein berechtigtes Interesse oder eine Einwilligung vorliegt.
          </p>
        </footer>
      </main>
    </div>
  );
}
