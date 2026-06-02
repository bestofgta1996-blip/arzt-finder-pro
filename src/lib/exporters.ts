import * as XLSX from "xlsx";
import { STATUS_LABELS, type Lead } from "@/lib/leads";

/** Common rows view for any export format. */
function leadsToRows(leads: Lead[]): (string | number | boolean)[][] {
  const headers = [
    "Name", "Praxis", "Fachgebiet", "E-Mail", "Telefon", "Website",
    "Adresse", "PLZ", "Stadt", "Land", "Gerichtsgutachter", "Status",
    "Notiz", "Quelle", "Erstellt",
  ];
  const body = leads.map((l) => [
    l.name, l.praxis ?? "", l.fachgebiet ?? "", l.email, l.telefon ?? "",
    l.website ?? "", l.adresse ?? "", l.plz ?? "", l.stadt ?? "", l.land,
    l.gerichtsgutachter ? "ja" : "nein", STATUS_LABELS[l.status],
    l.notiz ?? "", l.quelle ?? "", l.erstelltAm,
  ]);
  return [headers, ...body];
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ts() {
  return new Date().toISOString().slice(0, 10);
}

/** CSV with configurable delimiter (Excel-friendly with BOM). */
export function exportCSV(leads: Lead[], delimiter: "," | ";" | "\t" = ";") {
  const rows = leadsToRows(leads);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return new RegExp(`["${delimiter === "\t" ? "\\t" : delimiter}\\n]`).test(s)
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv = rows.map((r) => r.map(escape).join(delimiter)).join("\n");
  const bom = "\uFEFF";
  const ext = delimiter === "\t" ? "tsv" : "csv";
  const mime = delimiter === "\t" ? "text/tab-separated-values" : "text/csv";
  downloadBlob(
    `gutachter-leads_${ts()}.${ext}`,
    new Blob([bom + csv], { type: `${mime};charset=utf-8;` }),
  );
}

/** Excel .xlsx via SheetJS. */
export function exportXLSX(leads: Lead[]) {
  const rows = leadsToRows(leads);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Sensible column widths
  ws["!cols"] = rows[0].map((_, i) => ({
    wch: Math.min(
      40,
      Math.max(10, ...rows.map((r) => String(r[i] ?? "").length + 2)),
    ),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  downloadBlob(
    `gutachter-leads_${ts()}.xlsx`,
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
}

/** JSON export (full Lead objects, machine-readable). */
export function exportJSON(leads: Lead[]) {
  downloadBlob(
    `gutachter-leads_${ts()}.json`,
    new Blob([JSON.stringify(leads, null, 2)], { type: "application/json" }),
  );
}

/** vCard 3.0 export — kompatibel mit Outlook, Apple Contacts, Google. */
export function exportVCF(leads: Lead[]) {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const cards = leads.map((l) => {
    const lines = ["BEGIN:VCARD", "VERSION:3.0"];
    lines.push(`FN:${esc(l.name || l.email)}`);
    if (l.praxis) lines.push(`ORG:${esc(l.praxis)}`);
    if (l.fachgebiet) lines.push(`TITLE:${esc(l.fachgebiet)}`);
    lines.push(`EMAIL;TYPE=INTERNET,WORK:${esc(l.email)}`);
    if (l.telefon) lines.push(`TEL;TYPE=WORK,VOICE:${esc(l.telefon)}`);
    if (l.website) lines.push(`URL:${esc(l.website)}`);
    if (l.adresse || l.plz || l.stadt || l.land) {
      lines.push(`ADR;TYPE=WORK:;;${esc(l.adresse ?? "")};${esc(l.stadt ?? "")};;${esc(l.plz ?? "")};${esc(l.land)}`);
    }
    if (l.notiz) lines.push(`NOTE:${esc(l.notiz)}`);
    lines.push(`REV:${new Date().toISOString()}`);
    lines.push("END:VCARD");
    return lines.join("\r\n");
  });
  downloadBlob(
    `gutachter-leads_${ts()}.vcf`,
    new Blob([cards.join("\r\n")], { type: "text/vcard;charset=utf-8" }),
  );
}

/**
 * Universal file reader → rows[][] + suggested headers.
 * Returns null if the format cannot be handled here (caller should fall back).
 */
export async function readAnyToRows(file: File): Promise<{
  headers: string[];
  rows: string[][];
  delimiter: string;
  filename: string;
} | null> {
  const name = file.name.toLowerCase();

  // Excel
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".ods")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false }) as string[][];
    if (aoa.length === 0) return { headers: [], rows: [], delimiter: "xlsx", filename: file.name };
    const colCount = Math.max(...aoa.map((r) => r.length));
    const headers = (aoa[0] ?? []).map((c, i) => String(c ?? `Spalte ${i + 1}`));
    while (headers.length < colCount) headers.push(`Spalte ${headers.length + 1}`);
    const rows = aoa.slice(1).map((r) => {
      const padded = r.map((v) => (v == null ? "" : String(v)));
      while (padded.length < colCount) padded.push("");
      return padded;
    });
    return { headers, rows, delimiter: "xlsx", filename: file.name };
  }

  // JSON — array of objects
  if (name.endsWith(".json")) {
    const text = await file.text();
    const data = JSON.parse(text);
    const arr: Record<string, unknown>[] = Array.isArray(data) ? data : Array.isArray(data?.leads) ? data.leads : [];
    if (arr.length === 0) return { headers: [], rows: [], delimiter: "json", filename: file.name };
    const headerSet = new Set<string>();
    for (const o of arr) Object.keys(o ?? {}).forEach((k) => headerSet.add(k));
    const headers = Array.from(headerSet);
    const rows = arr.map((o) =>
      headers.map((h) => {
        const v = (o ?? {})[h];
        if (v == null) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return String(v);
      }),
    );
    return { headers, rows, delimiter: "json", filename: file.name };
  }

  return null; // CSV / TSV / TXT / VCF handled by caller
}
