export type LeadStatus = "neu" | "angeschrieben" | "geantwortet" | "termin" | "abgelehnt";
export type Country = "DE" | "PL" | "Andere";

export interface Lead {
  id: string;
  name: string;
  praxis?: string;
  fachgebiet?: string;
  email: string;
  telefon?: string;
  website?: string;
  adresse?: string;
  stadt?: string;
  plz?: string;
  land: Country;
  gerichtsgutachter: boolean;
  notiz?: string;
  status: LeadStatus;
  quelle?: string;
  erstelltAm: string;
}

const STORAGE_KEY = "gutachten-leads-v1";

export const STATUS_LABELS: Record<LeadStatus, string> = {
  neu: "Neu",
  angeschrieben: "Angeschrieben",
  geantwortet: "Geantwortet",
  termin: "Termin",
  abgelehnt: "Abgelehnt",
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  neu: "bg-secondary text-secondary-foreground",
  angeschrieben: "bg-accent text-accent-foreground",
  geantwortet: "bg-success text-success-foreground",
  termin: "bg-primary text-primary-foreground",
  abgelehnt: "bg-destructive/15 text-destructive",
};

export function loadLeads(): Lead[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLeads(leads: Lead[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s().\-/]{6,}\d)/g;
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const PLZ_DE_RE = /\b\d{5}\b/;
const PLZ_PL_RE = /\b\d{2}-\d{3}\b/;

export interface ParsedLead {
  name?: string;
  email: string;
  telefon?: string;
  website?: string;
  praxis?: string;
  adresse?: string;
  plz?: string;
  stadt?: string;
  land: Country;
}

/**
 * Parse a blob of pasted text (emails, vCards, contact lists) into individual leads.
 * Strategy: split into "blocks" (separated by blank lines or strong separators),
 * extract one email per block; fall back to one-email-per-line if no blocks.
 */
export function parseBulkText(input: string): ParsedLead[] {
  if (!input.trim()) return [];
  const text = input.replace(/\r\n/g, "\n");

  // Try block-based parsing first
  const blocks = text.split(/\n\s*\n|\n-{2,}\n|\n={2,}\n/).map((b) => b.trim()).filter(Boolean);
  const results: ParsedLead[] = [];
  const seenEmails = new Set<string>();

  const handleBlock = (block: string) => {
    const emails = block.match(EMAIL_RE);
    if (!emails) return;
    // One lead per unique email in the block
    for (const rawEmail of emails) {
      const email = rawEmail.toLowerCase();
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);

      const phones = block.match(PHONE_RE);
      const urls = block.match(URL_RE);
      const plzDe = block.match(PLZ_DE_RE)?.[0];
      const plzPl = block.match(PLZ_PL_RE)?.[0];
      const plz = plzPl || plzDe;
      const land: Country = plzPl ? "PL" : plzDe ? "DE" : "DE";

      // Heuristic: first non-empty line that doesn't contain email/url is name/praxis
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const cleanLines = lines.filter(
        (l) => !EMAIL_RE.test(l) && !URL_RE.test(l) && !/^tel|^fax|^phone/i.test(l),
      );
      EMAIL_RE.lastIndex = 0;
      URL_RE.lastIndex = 0;

      let name: string | undefined;
      let praxis: string | undefined;
      let adresse: string | undefined;
      let stadt: string | undefined;

      const drTitle = cleanLines.find((l) => /\b(Dr\.?|Prof\.?|med\.|Med\.)/i.test(l));
      name = drTitle || cleanLines[0];
      praxis = cleanLines.find((l) => /Praxis|Klinik|Zentrum|MVZ|Gabinet|Klinika|Centrum/i.test(l));
      const adrLine = cleanLines.find((l) => plz && l.includes(plz));
      if (adrLine) {
        adresse = adrLine;
        const m = adrLine.match(new RegExp(`${plz}\\s+([^,;]+)`));
        if (m) stadt = m[1].trim();
      }

      results.push({
        email,
        name: name?.slice(0, 120),
        praxis: praxis?.slice(0, 120),
        telefon: phones?.[0]?.trim(),
        website: urls?.[0],
        adresse,
        plz,
        stadt,
        land,
      });
    }
  };

  if (blocks.length > 1) {
    blocks.forEach(handleBlock);
  } else {
    // Single block: treat each line with an email as its own lead
    const lines = text.split("\n");
    for (const line of lines) {
      const emails = line.match(EMAIL_RE);
      if (!emails) continue;
      for (const rawEmail of emails) {
        const email = rawEmail.toLowerCase();
        if (seenEmails.has(email)) continue;
        seenEmails.add(email);
        results.push({ email, land: "DE" });
      }
    }
  }
  return results;
}

export function leadsToCSV(leads: Lead[]): string {
  const headers = [
    "Name", "Praxis", "Fachgebiet", "E-Mail", "Telefon", "Website",
    "Adresse", "PLZ", "Stadt", "Land", "Gerichtsgutachter", "Status", "Notiz", "Quelle", "Erstellt",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = leads.map((l) =>
    [
      l.name, l.praxis ?? "", l.fachgebiet ?? "", l.email, l.telefon ?? "",
      l.website ?? "", l.adresse ?? "", l.plz ?? "", l.stadt ?? "", l.land,
      l.gerichtsgutachter ? "ja" : "nein", STATUS_LABELS[l.status],
      l.notiz ?? "", l.quelle ?? "", l.erstelltAm,
    ].map(escape).join(";"),
  );
  return [headers.join(";"), ...rows].join("\n");
}

export function downloadCSV(filename: string, csv: string) {
  const bom = "\uFEFF"; // Excel UTF-8
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
