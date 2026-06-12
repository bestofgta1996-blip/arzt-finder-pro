/**
 * Qualitäts-Scoring für Lead-Datensätze.
 * Transparente, regelbasierte Bewertung (0–100). Höher = wichtiger.
 *
 * Pluspunkte:
 *  - Akademischer Titel (Prof., PD, Dr.)
 *  - Senior-Funktion (Chefarzt, Oberarzt, Leiter, Direktor)
 *  - Gerichtsgutachter / Sachverständiger
 *  - Uniklinik / Universitätsklinikum / Lehrkrankenhaus
 *  - Klinik / Krankenhaus / Zentrum
 *  - Fachgebiet im Titel erkennbar
 *  - Direkte Kanzlei-/Praxis-Domain (keine Portalseite)
 *  - Telefonnummer vorhanden
 */
export interface ScoreInput {
  name?: string | null;
  fachgebiet?: string | null;
  website?: string | null;
  telefon?: string | null;
  gerichtsgutachter?: boolean | null;
  zielgruppe?: string | null;
  quelle_typ?: string | null;
  email?: string | null;
}

export interface ScoreResult {
  score: number; // 0..100
  merkmale: string[];
}

const PORTAL_HOSTS = [
  "jameda",
  "doctolib",
  "sanego",
  "arzt-auskunft",
  "weisse-liste",
  "docfinder",
  "znanylekarz",
];

export function scoreLead(input: ScoreInput): ScoreResult {
  const merkmale: string[] = [];
  let score = 0;

  const name = (input.name ?? "").toLowerCase();
  const fach = (input.fachgebiet ?? "").toLowerCase();
  const url = (input.website ?? "").toLowerCase();
  const haystack = `${name} ${url}`;

  if (/\bprof\.?\b|professor/i.test(haystack)) {
    score += 30;
    merkmale.push("Prof.");
  } else if (/\bpd\.?\b|privatdozent/i.test(haystack)) {
    score += 22;
    merkmale.push("PD");
  } else if (/\bdr\.?\b|doktor|med\./i.test(haystack)) {
    score += 12;
    merkmale.push("Dr.");
  }

  if (/chefarzt|chefärztin|direktor|leiter|leitung|head of|chief/i.test(haystack)) {
    score += 18;
    merkmale.push("Leitung");
  } else if (/oberarzt|oberärztin|senior/i.test(haystack)) {
    score += 10;
    merkmale.push("Oberarzt");
  }

  if (input.gerichtsgutachter || /gutachter|sachverständig|vereidigt|gerichtlich/i.test(haystack)) {
    score += 25;
    merkmale.push("Gutachter");
  }

  if (/uniklinik|universitätsklinik|universitatsklinik|university hospital|charite|charité/i.test(haystack)) {
    score += 18;
    merkmale.push("Uniklinik");
  } else if (/klinikum|krankenhaus|hospital|szpital|klinika|spital/i.test(haystack)) {
    score += 10;
    merkmale.push("Klinik");
  } else if (/zentrum|center|centrum/i.test(haystack)) {
    score += 6;
    merkmale.push("Zentrum");
  }

  if (fach && name.includes(fach.split(" ")[0] ?? "")) {
    score += 8;
    merkmale.push("Fachgebiet im Titel");
  }

  if (input.telefon) {
    score += 4;
    merkmale.push("Telefon");
  }

  try {
    if (url) {
      const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
      if (PORTAL_HOSTS.some((h) => host.includes(h))) {
        score -= 10;
        merkmale.push("Portal-Quelle");
      } else if (host.split(".").length <= 3) {
        score += 5;
        merkmale.push("Eigene Domain");
      }
    }
  } catch {
    /* ignore url parsing errors */
  }

  if (input.email) {
    const local = input.email.split("@")[0]?.toLowerCase() ?? "";
    if (/^(info|kontakt|office|praxis|sekretariat|verwaltung)$/.test(local)) {
      // generische Adresse — leichter Abzug
      score -= 3;
    } else if (/\./.test(local)) {
      // vorname.nachname → wahrscheinlich Personenadresse
      score += 6;
      merkmale.push("Personenadresse");
    }
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return { score, merkmale: Array.from(new Set(merkmale)) };
}
