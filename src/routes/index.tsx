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
import { upsertLeads, LAENDER, type LandCode } from "@/lib/marketing.functions";
import { ModeProvider, useMode, MODE_LABEL, type AppMode } from "@/hooks/useMode";
import { Stethoscope, Globe2, Menu, ListChecks, FileSearch, Search, ClipboardPaste, Database, FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

function toCloudRows(incoming: Lead[], mode: AppMode) {
  return incoming
    .filter((l) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email))
    .map((l) => {
      const land: LandCode = (LAENDER as readonly string[]).includes(l.land) ? (l.land as LandCode) : "DE";
      return {
        land,
        email: l.email.toLowerCase(),
        fachgebiet: l.fachgebiet ?? null,
        name: l.name ?? null,
        telefon: l.telefon ?? null,
        website: l.website ?? null,
        stadt: l.stadt ?? null,
        quelle_url: l.website ?? null,
        quelle_typ: l.quelle ?? null,
        gerichtsgutachter: l.gerichtsgutachter,
        mode,
      };
    });
}

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
      { title: "IMB Akquise – Lead-Generierung für Ärzte & Gutachter (DE/PL/EU)" },
      { name: "description", content: "Persistente Marketinglisten pro Land mit Fachrichtungs-Ordnern und Outlook-Abgleich – Ärzte, Gerichtsgutachter, Kanzleien und Kliniken in DE, PL und Europa finden und verfolgen." },
      { property: "og:title", content: "IMB Akquise – Marketinglisten pro Land" },
      { property: "og:description", content: "Ärzte und Sachverständige finden, in Marketinglisten verwalten, Outlook-Status automatisch synchronisieren." },
      { property: "og:url", content: "https://arzt-finder-pro.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://arzt-finder-pro.lovable.app/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "IMB Akquise",
          url: "https://arzt-finder-pro.lovable.app/",
          inLanguage: "de-DE",
          description: "Marketinglisten und Lead-Generierung für medizinische Gutachten in DE, PL und EU.",
        }),
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <ModeProvider>
      <HomeInner />
    </ModeProvider>
  );
}

function HomeInner() {
  const { mode, setMode } = useMode();
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
    const cloudRows = toCloudRows(incoming, mode);
    if (cloudRows.length > 0) {
      cloudUpsert({ data: { leads: cloudRows } }).catch(() => {
        /* offline: ignore, lokal bleibt erhalten */
      });
    }
  };

  const [syncing, setSyncing] = useState(false);

  // Übernimmt alle bereits gefundenen lokalen Leads (auch aus früheren Sitzungen)
  // nachträglich in die dauerhafte Marketingliste (Cloud).
  const syncLocalToCloud = async () => {
    const rows = toCloudRows(leads, mode);
    if (rows.length === 0) {
      toast.error("Keine lokalen Kontakte mit gültiger E-Mail zum Übernehmen.");
      return;
    }
    setSyncing(true);
    try {
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const r = await cloudUpsert({ data: { leads: chunk } });
        if (r.ok) inserted += r.inserted;
      }
      toast.success(`${inserted} von ${rows.length} Kontakten in die Marketingliste übernommen.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Übernahme fehlgeschlagen");
    } finally {
      setSyncing(false);
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

  const current = NAV_ITEMS.find((i) => i.value === tab) ?? NAV_ITEMS[0];
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" />

      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 md:py-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div className={`size-10 shrink-0 rounded-md text-primary-foreground grid place-items-center ${mode === "dsb" ? "bg-slate-700" : "bg-primary"}`}>
            {mode === "dsb" ? <ShieldCheck className="size-5" /> : <Stethoscope className="size-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base md:text-lg font-semibold leading-tight">
              <span className="sm:hidden">{mode === "dsb" ? "IMB Akquise · Datenschutz" : "IMB Akquise"}</span>
              <span className="hidden sm:inline">
                {mode === "dsb"
                  ? "IMB Akquise · Datenschutz – DSB-Neukunden im Gesundheitswesen"
                  : "IMB Akquise – Lead-Generierung für Ärzte & Gutachter"}
              </span>
            </h1>
            <p className="truncate text-xs text-muted-foreground hidden sm:flex items-center gap-1">
              <Globe2 className="size-3 shrink-0" />
              <span className="truncate">
                {mode === "dsb"
                  ? "Arztpraxen · Kliniken · Apotheken · Pflege · Labore"
                  : "Marketinglisten · Dauersuche · Outlook"}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            <ModeSwitcher mode={mode} setMode={setMode} />

            {/* Mobile burger */}
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden shrink-0" aria-label="Menü öffnen">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <nav className="mt-4 flex flex-col gap-1">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = item.value === tab;
                    return (
                      <button
                        key={item.value}
                        onClick={() => { setTab(item.value); setNavOpen(false); }}
                        className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                          active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        }`}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.value === "leads" && leads.length > 0 && (
                          <span className="text-xs opacity-70">{leads.length}</span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>

            <div className="hidden md:block text-xs text-muted-foreground ml-2">
              <span className="font-medium text-foreground">{leads.length}</span> lokale Lead(s)
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Mobile: aktueller Bereich als Label */}
        {(() => {
          const CurrentIcon = current.icon;
          return (
            <div className="md:hidden mb-4 flex items-center gap-2 text-sm">
              <CurrentIcon className="size-4 text-primary" />
              <span className="font-medium">{current.label}</span>
            </div>
          );
        })()}

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="hidden md:inline-grid md:grid-cols-6">
            {NAV_ITEMS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
                {item.value === "leads" && leads.length > 0 && (
                  <span className="ml-1 text-xs opacity-70">({leads.length})</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="marketing"><MarketingPanel /></TabsContent>
          <TabsContent value="ausschreibungen"><TendersPanel /></TabsContent>
          <TabsContent value="suche"><SearchPanel onAddLeads={addLeads} /></TabsContent>
          <TabsContent value="einfuegen"><PastePanel onAddLeads={addLeads} /></TabsContent>
          <TabsContent value="leads">
            <LeadsList
              leads={leads}
              onAddLeads={addLeads}
              onUpdate={updateLead}
              onDelete={deleteLead}
              onDeleteMany={deleteMany}
              onSyncToCloud={syncLocalToCloud}
              syncing={syncing}
            />
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

function ModeSwitcher({ mode, setMode }: { mode: AppMode; setMode: (m: AppMode) => void }) {
  const items: Array<{ v: AppMode; label: string }> = [
    { v: "gutachten", label: MODE_LABEL.gutachten },
    { v: "dsb", label: MODE_LABEL.dsb },
  ];
  return (
    <div
      role="tablist"
      aria-label="Modus wechseln"
      className="inline-flex rounded-md border bg-background p-0.5 text-xs"
    >
      {items.map((it) => {
        const active = mode === it.v;
        return (
          <button
            key={it.v}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(it.v)}
            className={`px-2.5 py-1 rounded-sm transition-colors ${
              active
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
