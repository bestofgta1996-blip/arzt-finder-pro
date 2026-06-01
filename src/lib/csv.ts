/**
 * Minimal but correct RFC-4180-ish CSV parser.
 * Handles quoted fields, embedded delimiters, escaped quotes ("") and \r\n.
 */
export function parseCSV(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const delim = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === delim) { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && src[i + 1] === "\n") i++;
        row.push(field); rows.push(row);
        field = ""; row = [];
      } else { field += ch; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] && r[0].trim() !== ""));
}

export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t", "|"];
  let best = ";", bestCount = -1;
  for (const c of candidates) {
    const count = (firstLine.match(new RegExp(`\\${c}`, "g")) ?? []).length;
    if (count > bestCount) { bestCount = count; best = c; }
  }
  return bestCount === 0 ? ";" : best;
}
