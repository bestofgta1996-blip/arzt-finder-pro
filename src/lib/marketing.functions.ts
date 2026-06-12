import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const LAENDER = ["DE", "PL", "UK", "FR", "IT", "ES"] as const;
export type LandCode = (typeof LAENDER)[number];

export const LAND_LABEL: Record<LandCode, string> = {
  DE: "Deutschland",
  PL: "Polen",
  UK: "Großbritannien",
  FR: "Frankreich",
  IT: "Italien",
  ES: "Spanien",
};

export const LEAD_STATUS = [
  "neu",
  "angeschrieben",
  "geantwortet",
  "bounce",
  "kunde",
  "nicht_relevant",
] as const;
export type LeadStatusDb = (typeof LEAD_STATUS)[number];

// Hierarchie für Auto-Updates: höherer Status wird beim Outlook-Sync nicht zurückgestuft
const STATUS_RANK: Record<LeadStatusDb, number> = {
  neu: 0,
  angeschrieben: 1,
  bounce: 2,
  geantwortet: 3,
  kunde: 4,
  nicht_relevant: 5,
};

export interface DbLead {
  id: string;
  land: LandCode;
  fachgebiet: string | null;
  zielgruppe: string | null;
  name: string | null;
  email: string;
  telefon: string | null;
  website: string | null;
  stadt: string | null;
  quelle_url: string | null;
  quelle_typ: string | null;
  gerichtsgutachter: boolean;
  status: LeadStatusDb;
  last_contacted_at: string | null;
  last_replied_at: string | null;
  bounced_at: string | null;
  outlook_message_id: string | null;
  outlook_folder_id: string | null;
  notiz: string | null;
  erstellt_am: string;
  updated_at: string;
  qualitaet_score: number;
  qualitaets_merkmale: string[];
}

export interface DbSearchJob {
  id: string;
  land: LandCode;
  fachgebiet: string;
  ort: string | null;
  zielgruppen: string[];
  gerichtsgutachter: boolean;
  aktiv: boolean;
  last_run_at: string | null;
  last_hit_count: number | null;
  erstellt_am: string;
  updated_at: string;
}

const LeadInsert = z.object({
  land: z.enum(LAENDER),
  email: z.string().email().max(200),
  fachgebiet: z.string().max(160).optional().nullable(),
  zielgruppe: z.string().max(60).optional().nullable(),
  name: z.string().max(240).optional().nullable(),
  telefon: z.string().max(80).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  stadt: z.string().max(120).optional().nullable(),
  quelle_url: z.string().max(800).optional().nullable(),
  quelle_typ: z.string().max(60).optional().nullable(),
  gerichtsgutachter: z.boolean().optional().default(false),
});

const ListLeadsInput = z.object({
  land: z.enum(LAENDER).optional(),
});

export const listLeads = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ListLeadsInput.parse(d ?? {}))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; leads: DbLead[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("leads")
      .select("*")
      .order("qualitaet_score", { ascending: false })
      .order("erstellt_am", { ascending: false })
      .limit(5000);
    if (data.land) q = q.eq("land", data.land);
    const { data: rows, error } = await q;
    if (error) return { ok: false, error: error.message, leads: [] };
    return { ok: true, leads: (rows ?? []) as DbLead[] };
  });

export const upsertLeads = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ leads: z.array(LeadInsert).min(1).max(500) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; inserted: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { scoreLead } = await import("@/lib/scoring");
    const rows = data.leads.map((l) => {
      const s = scoreLead(l);
      return {
        ...l,
        email: l.email.toLowerCase(),
        status: "neu" as const,
        qualitaet_score: s.score,
        qualitaets_merkmale: s.merkmale,
      };
    });
    const { data: inserted, error } = await supabaseAdmin
      .from("leads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(rows as any, { onConflict: "land,email", ignoreDuplicates: true })
      .select("id");
    if (error) return { ok: false, error: error.message, inserted: 0 };
    return { ok: true, inserted: inserted?.length ?? 0 };
  });

export const updateLead = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(LEAD_STATUS).optional(),
        notiz: z.string().max(2000).optional().nullable(),
        last_contacted_at: z.string().datetime().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.notiz !== undefined) patch.notiz = data.notiz;
    if (data.last_contacted_at !== undefined) patch.last_contacted_at = data.last_contacted_at;
    if (data.status === "angeschrieben" && data.last_contacted_at === undefined) {
      patch.last_contacted_at = new Date().toISOString();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabaseAdmin.from("leads").update(patch as any).eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("leads").delete().eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

// ---- Search jobs --------------------------------------------------

const SearchJobInput = z.object({
  id: z.string().uuid().optional(),
  land: z.enum(LAENDER),
  fachgebiet: z.string().min(1).max(160),
  ort: z.string().max(160).optional().nullable(),
  zielgruppen: z.array(z.string()).min(1).max(10),
  gerichtsgutachter: z.boolean().optional().default(false),
  aktiv: z.boolean().optional().default(true),
});

export const listSearchJobs = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ ok: boolean; error?: string; jobs: DbSearchJob[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("search_jobs")
      .select("*")
      .order("erstellt_am", { ascending: false });
    if (error) return { ok: false, error: error.message, jobs: [] };
    return { ok: true, jobs: (data ?? []) as DbSearchJob[] };
  });

export const upsertSearchJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SearchJobInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; id?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      ...data,
      ort: data.ort ?? null,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("search_jobs").update(row).eq("id", data.id);
      return error ? { ok: false, error: error.message } : { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("search_jobs")
      .insert(row)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: ins?.id as string | undefined };
  });

export const deleteSearchJob = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("search_jobs").delete().eq("id", data.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  });

// ---- Outlook sync (no-op solange Connector nicht verbunden) -------

// ---- Outlook sync ------------------------------------------------------

const GATEWAY = "https://connector-gateway.lovable.dev/microsoft_outlook";

function outlookHeaders() {
  const outlookKey = process.env.MICROSOFT_OUTLOOK_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!outlookKey || !lovableKey) return null;
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": outlookKey,
  } as Record<string, string>;
}

function sanitizeFolderName(name: string): string {
  // Outlook erlaubt die meisten Zeichen, aber wir entschärfen Slashes/Backslashes
  return name.replace(/[\\/]/g, "-").trim().slice(0, 120) || "Allgemein";
}

async function findOrCreateChildFolder(
  parentId: string,
  name: string,
  headers: Record<string, string>,
): Promise<string | null> {
  // 1) try filter
  const filterUrl = `${GATEWAY}/me/mailFolders/${parentId}/childFolders?$top=100&$filter=displayName eq '${encodeURIComponent(name.replace(/'/g, "''"))}'`;
  const res = await fetch(filterUrl, { headers });
  if (res.ok) {
    const j = (await res.json()) as { value?: Array<{ id?: string }> };
    const existing = j.value?.[0]?.id;
    if (existing) return existing;
  }
  // 2) create
  const created = await fetch(`${GATEWAY}/me/mailFolders/${parentId}/childFolders`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: name }),
  });
  if (!created.ok) return null;
  const j = (await created.json()) as { id?: string };
  return j.id ?? null;
}

/**
 * Legt fehlende Outlook-Ordner an: Leads / <Land> / <Fachgebiet>
 */
export const ensureOutlookFolders = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; created: number; total: number; reason?: string }> => {
    const headers = outlookHeaders();
    if (!headers) {
      return {
        ok: false,
        created: 0,
        total: 0,
        reason: "Outlook ist noch nicht verbunden. Bitte den Microsoft-Outlook-Connector aktivieren.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Distinct Land/Fachgebiet aus leads
    const { data: rows } = await supabaseAdmin
      .from("leads")
      .select("land,fachgebiet")
      .not("fachgebiet", "is", null)
      .limit(10000);
    const pairs = new Map<string, { land: string; fachgebiet: string }>();
    for (const r of (rows ?? []) as Array<{ land: string; fachgebiet: string | null }>) {
      const f = (r.fachgebiet ?? "").trim();
      if (!f) continue;
      const key = `${r.land}|${f}`;
      if (!pairs.has(key)) pairs.set(key, { land: r.land, fachgebiet: f });
    }

    // Root: "Leads"
    const inboxRes = await fetch(`${GATEWAY}/me/mailFolders/inbox`, { headers });
    if (!inboxRes.ok) return { ok: false, created: 0, total: 0, reason: `Outlook-Aufruf fehlgeschlagen (${inboxRes.status})` };
    const inbox = (await inboxRes.json()) as { id?: string };
    if (!inbox.id) return { ok: false, created: 0, total: 0, reason: "Posteingang nicht gefunden" };

    const rootId = await findOrCreateChildFolder(inbox.id, "Leads", headers);
    if (!rootId) return { ok: false, created: 0, total: 0, reason: "Konnte 'Leads'-Ordner nicht anlegen" };

    let created = 0;
    for (const { land, fachgebiet } of pairs.values()) {
      // Prüfen ob schon in DB
      const { data: existing } = await supabaseAdmin
        .from("outlook_folders")
        .select("id,folder_id")
        .eq("land", land)
        .eq("fachgebiet", fachgebiet)
        .maybeSingle();
      if (existing && (existing as { folder_id: string }).folder_id) continue;

      const landFolderId = await findOrCreateChildFolder(rootId, sanitizeFolderName(land), headers);
      if (!landFolderId) continue;
      const fachId = await findOrCreateChildFolder(landFolderId, sanitizeFolderName(fachgebiet), headers);
      if (!fachId) continue;

      await supabaseAdmin.from("outlook_folders").upsert(
        {
          land,
          fachgebiet,
          folder_id: fachId,
          folder_path: `Leads/${land}/${fachgebiet}`,
        },
        { onConflict: "land,fachgebiet" },
      );
      created++;
    }
    return { ok: true, created, total: pairs.size };
  });

interface SyncSummary {
  contacted: number;
  replied: number;
  bounced: number;
  moved: number;
  reason?: string;
}

async function moveMessageToFolder(
  messageId: string,
  folderId: string,
  headers: Record<string, string>,
): Promise<boolean> {
  const res = await fetch(`${GATEWAY}/me/messages/${messageId}/move`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ destinationId: folderId }),
  });
  return res.ok;
}

async function updateLeadStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  leadId: string,
  currentStatus: LeadStatusDb,
  newStatus: LeadStatusDb,
  patch: Record<string, unknown>,
): Promise<boolean> {
  // Höherer Rank wird nicht überschrieben (außer wir setzen denselben)
  if (STATUS_RANK[currentStatus] > STATUS_RANK[newStatus]) {
    // trotzdem Timestamps aktualisieren
    if (Object.keys(patch).length === 0) return false;
    await supabaseAdmin.from("leads").update(patch).eq("id", leadId);
    return false;
  }
  await supabaseAdmin
    .from("leads")
    .update({ ...patch, status: newStatus })
    .eq("id", leadId);
  return true;
}

/**
 * Voll-Sync: Gesendet + Antworten + Bounces, optional Mails in Fachgebiet-Ordner verschieben.
 */
export const syncOutlookAll = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ moveToFolders: z.boolean().optional().default(false) }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ ok: boolean; summary: SyncSummary; lastRunAt?: string; reason?: string }> => {
    const headers = outlookHeaders();
    if (!headers) {
      return {
        ok: false,
        summary: { contacted: 0, replied: 0, bounced: 0, moved: 0 },
        reason: "Outlook ist noch nicht verbunden. Bitte den Microsoft-Outlook-Connector aktivieren.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Sync-State laden
    const { data: state } = await supabaseAdmin.from("outlook_sync_state").select("*").eq("id", 1).maybeSingle();
    const fallbackSince = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
    const sinceSent = (state as { last_sent_check_at?: string } | null)?.last_sent_check_at ?? fallbackSince;
    const sinceInbox = (state as { last_inbox_check_at?: string } | null)?.last_inbox_check_at ?? fallbackSince;
    const runStartedAt = new Date().toISOString();

    // Folder-Mapping laden (für Move)
    const { data: folderRows } = await supabaseAdmin
      .from("outlook_folders")
      .select("land,fachgebiet,folder_id");
    const folderMap = new Map<string, string>();
    for (const f of (folderRows ?? []) as Array<{ land: string; fachgebiet: string; folder_id: string }>) {
      folderMap.set(`${f.land}|${f.fachgebiet}`, f.folder_id);
    }

    const summary: SyncSummary = { contacted: 0, replied: 0, bounced: 0, moved: 0 };

    // --- 1) Gesendete Mails -------------------------------------------------
    const sentUrl =
      `${GATEWAY}/me/mailFolders/sentitems/messages` +
      `?$top=500&$select=id,toRecipients,sentDateTime,subject` +
      `&$filter=sentDateTime gt ${sinceSent}`;
    const sentRes = await fetch(sentUrl, { headers });
    if (sentRes.ok) {
      const sentJson = (await sentRes.json()) as {
        value?: Array<{
          id?: string;
          sentDateTime?: string;
          toRecipients?: Array<{ emailAddress?: { address?: string } }>;
        }>;
      };
      const recipients = new Map<string, { id: string; sentAt: string }>();
      for (const msg of sentJson.value ?? []) {
        const sentAt = msg.sentDateTime ?? runStartedAt;
        for (const r of msg.toRecipients ?? []) {
          const addr = r.emailAddress?.address?.toLowerCase();
          if (!addr) continue;
          const prev = recipients.get(addr);
          if (!prev || prev.sentAt < sentAt) recipients.set(addr, { id: msg.id ?? "", sentAt });
        }
      }
      if (recipients.size > 0) {
        const { data: leads } = await supabaseAdmin
          .from("leads")
          .select("id,email,land,fachgebiet,status")
          .in("email", Array.from(recipients.keys()));
        for (const lead of (leads ?? []) as Array<{
          id: string;
          email: string;
          land: string;
          fachgebiet: string | null;
          status: LeadStatusDb;
        }>) {
          const meta = recipients.get(lead.email.toLowerCase());
          if (!meta) continue;
          const changed = await updateLeadStatus(supabaseAdmin, lead.id, lead.status, "angeschrieben", {
            last_contacted_at: meta.sentAt,
            outlook_message_id: meta.id || null,
          });
          if (changed) summary.contacted++;

          // Optional: Mail in Fachgebiet-Ordner verschieben
          if (data.moveToFolders && meta.id && lead.fachgebiet) {
            const target = folderMap.get(`${lead.land}|${lead.fachgebiet}`);
            if (target) {
              const ok = await moveMessageToFolder(meta.id, target, headers);
              if (ok) summary.moved++;
            }
          }
        }
      }
    }

    // --- 2) Inbox / Antworten ----------------------------------------------
    const inboxUrl =
      `${GATEWAY}/me/mailFolders/inbox/messages` +
      `?$top=500&$select=id,from,receivedDateTime,subject,internetMessageHeaders` +
      `&$filter=receivedDateTime gt ${sinceInbox}`;
    const inboxRes = await fetch(inboxUrl, { headers });
    if (inboxRes.ok) {
      const inboxJson = (await inboxRes.json()) as {
        value?: Array<{
          id?: string;
          receivedDateTime?: string;
          from?: { emailAddress?: { address?: string } };
          subject?: string;
        }>;
      };
      const senders = new Map<string, { id: string; receivedAt: string }>();
      for (const msg of inboxJson.value ?? []) {
        const addr = msg.from?.emailAddress?.address?.toLowerCase();
        if (!addr) continue;
        const receivedAt = msg.receivedDateTime ?? runStartedAt;
        const prev = senders.get(addr);
        if (!prev || prev.receivedAt < receivedAt) senders.set(addr, { id: msg.id ?? "", receivedAt });
      }

      if (senders.size > 0) {
        const { data: leads } = await supabaseAdmin
          .from("leads")
          .select("id,email,land,fachgebiet,status")
          .in("email", Array.from(senders.keys()));
        for (const lead of (leads ?? []) as Array<{
          id: string;
          email: string;
          land: string;
          fachgebiet: string | null;
          status: LeadStatusDb;
        }>) {
          const meta = senders.get(lead.email.toLowerCase());
          if (!meta) continue;
          const changed = await updateLeadStatus(supabaseAdmin, lead.id, lead.status, "geantwortet", {
            last_replied_at: meta.receivedAt,
          });
          if (changed) summary.replied++;

          if (data.moveToFolders && meta.id && lead.fachgebiet) {
            const target = folderMap.get(`${lead.land}|${lead.fachgebiet}`);
            if (target) {
              const ok = await moveMessageToFolder(meta.id, target, headers);
              if (ok) summary.moved++;
            }
          }
        }
      }

      // --- 3) Bounces (vereinfacht: typische Failure-Notification Absender) -
      const bounceMatch = (msg: {
        from?: { emailAddress?: { address?: string } };
        subject?: string;
      }): boolean => {
        const sender = (msg.from?.emailAddress?.address ?? "").toLowerCase();
        const subj = (msg.subject ?? "").toLowerCase();
        if (sender.includes("mailer-daemon") || sender.includes("postmaster")) return true;
        if (subj.includes("undeliverable") || subj.includes("unzustellbar") || subj.includes("delivery failed") || subj.includes("delivery status")) return true;
        return false;
      };

      // Body-basiertes Re-Fetch nur für markierte Bounces (pro Mail einzeln, um Quote zu sparen)
      const bouncesToParse = (inboxJson.value ?? []).filter(bounceMatch).slice(0, 50);
      for (const bounce of bouncesToParse) {
        if (!bounce.id) continue;
        const detailRes = await fetch(
          `${GATEWAY}/me/messages/${bounce.id}?$select=id,body,subject`,
          { headers },
        );
        if (!detailRes.ok) continue;
        const detail = (await detailRes.json()) as { body?: { content?: string }; subject?: string };
        const haystack = `${detail.subject ?? ""} ${detail.body?.content ?? ""}`.toLowerCase();
        // Finde Emails im Body
        const matches = haystack.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
        const unique = Array.from(new Set(matches.map((s) => s.toLowerCase())));
        if (unique.length === 0) continue;
        const { data: leads } = await supabaseAdmin
          .from("leads")
          .select("id,email,status")
          .in("email", unique);
        for (const lead of (leads ?? []) as Array<{ id: string; email: string; status: LeadStatusDb }>) {
          const changed = await updateLeadStatus(supabaseAdmin, lead.id, lead.status, "bounce", {
            bounced_at: runStartedAt,
          });
          if (changed) summary.bounced++;
        }
      }
    }

    // Sync-State aktualisieren
    await supabaseAdmin
      .from("outlook_sync_state")
      .upsert({
        id: 1,
        last_sent_check_at: runStartedAt,
        last_inbox_check_at: runStartedAt,
        last_bounce_check_at: runStartedAt,
        last_full_sync_at: runStartedAt,
        last_summary: summary as unknown as Record<string, unknown>,
      });

    return { ok: true, summary, lastRunAt: runStartedAt };
  });

/**
 * Alias für Abwärtskompatibilität — ruft den vollen Sync ohne Folder-Move auf.
 */
export const syncOutlookContacted = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; matched: number; reason?: string }> => {
    const headers = outlookHeaders();
    if (!headers) {
      return {
        ok: false,
        matched: 0,
        reason: "Outlook ist noch nicht verbunden. Bitte den Microsoft-Outlook-Connector aktivieren.",
      };
    }
    const result = await syncOutlookAll({ data: { moveToFolders: false } });
    if (!result.ok) return { ok: false, matched: 0, reason: result.reason };
    const matched = result.summary.contacted + result.summary.replied + result.summary.bounced;
    return { ok: true, matched };
  });

export const getOutlookSyncState = createServerFn({ method: "GET" })
  .handler(async (): Promise<{
    ok: boolean;
    connected: boolean;
    lastRunAt: string | null;
    lastSummary: SyncSummary | null;
    folderCount: number;
  }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const headers = outlookHeaders();
    const { data: state } = await supabaseAdmin
      .from("outlook_sync_state")
      .select("last_full_sync_at,last_summary")
      .eq("id", 1)
      .maybeSingle();
    const { count } = await supabaseAdmin
      .from("outlook_folders")
      .select("id", { count: "exact", head: true });
    return {
      ok: true,
      connected: !!headers,
      lastRunAt: (state as { last_full_sync_at?: string } | null)?.last_full_sync_at ?? null,
      lastSummary: ((state as { last_summary?: SyncSummary } | null)?.last_summary as SyncSummary) ?? null,
      folderCount: count ?? 0,
    };
  });
