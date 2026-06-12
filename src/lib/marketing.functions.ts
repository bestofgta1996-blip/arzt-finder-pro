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
  "kunde",
  "nicht_relevant",
] as const;
export type LeadStatusDb = (typeof LEAD_STATUS)[number];

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
  outlook_message_id: string | null;
  notiz: string | null;
  erstellt_am: string;
  updated_at: string;
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
    let q = supabaseAdmin.from("leads").select("*").order("erstellt_am", { ascending: false }).limit(5000);
    if (data.land) q = q.eq("land", data.land);
    const { data: rows, error } = await q;
    if (error) return { ok: false, error: error.message, leads: [] };
    return { ok: true, leads: (rows ?? []) as DbLead[] };
  });

export const upsertLeads = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ leads: z.array(LeadInsert).min(1).max(500) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; inserted: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.leads.map((l) => ({
      ...l,
      email: l.email.toLowerCase(),
      status: "neu" as const,
    }));
    const { data: inserted, error } = await supabaseAdmin
      .from("leads")
      .upsert(rows, { onConflict: "land,email", ignoreDuplicates: true })
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
    const { error } = await supabaseAdmin.from("leads").update(patch).eq("id", data.id);
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

export const syncOutlookContacted = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; matched: number; reason?: string }> => {
    const outlookKey = process.env.MICROSOFT_OUTLOOK_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!outlookKey || !lovableKey) {
      return {
        ok: false,
        matched: 0,
        reason: "Outlook ist noch nicht verbunden. Bitte den Microsoft-Outlook-Connector aktivieren.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
    const url = `https://connector-gateway.lovable.dev/microsoft_outlook/me/mailFolders/sentitems/messages?$top=200&$select=id,toRecipients,sentDateTime&$filter=sentDateTime ge ${since}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": outlookKey,
      },
    });
    if (!res.ok) {
      return { ok: false, matched: 0, reason: `Outlook-Aufruf fehlgeschlagen (${res.status})` };
    }
    const json = (await res.json()) as {
      value?: Array<{
        id?: string;
        sentDateTime?: string;
        toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      }>;
    };
    const recipients = new Map<string, { id: string; sentAt: string }>();
    for (const msg of json.value ?? []) {
      const sentAt = msg.sentDateTime ?? new Date().toISOString();
      for (const r of msg.toRecipients ?? []) {
        const addr = r.emailAddress?.address?.toLowerCase();
        if (!addr) continue;
        const existing = recipients.get(addr);
        if (!existing || existing.sentAt < sentAt) {
          recipients.set(addr, { id: msg.id ?? "", sentAt });
        }
      }
    }
    if (recipients.size === 0) return { ok: true, matched: 0 };

    const emails = Array.from(recipients.keys());
    const { data: leads, error } = await supabaseAdmin
      .from("leads")
      .select("id,email,land")
      .in("email", emails);
    if (error) return { ok: false, matched: 0, reason: error.message };

    let matched = 0;
    for (const lead of leads ?? []) {
      const meta = recipients.get((lead as { email: string }).email.toLowerCase());
      if (!meta) continue;
      await supabaseAdmin
        .from("leads")
        .update({
          status: "angeschrieben",
          last_contacted_at: meta.sentAt,
          outlook_message_id: meta.id || null,
        })
        .eq("id", (lead as { id: string }).id);
      matched++;
    }
    return { ok: true, matched };
  });
