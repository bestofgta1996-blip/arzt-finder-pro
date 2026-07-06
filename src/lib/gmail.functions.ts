import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LEAD_STATUS, type LeadStatusDb } from "./marketing.functions";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

interface SyncSummary {
  contacted: number;
  replied: number;
  bounced: number;
  labeled: number;
}

const STATUS_RANK: Record<LeadStatusDb, number> = {
  neu: 0,
  angeschrieben: 1,
  bounce: 2,
  geantwortet: 3,
  kunde: 4,
  nicht_relevant: 5,
};

function gmailHeaders(): Record<string, string> | null {
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!gmailKey || !lovableKey) return null;
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": gmailKey,
  };
}

function sanitizeLabelSegment(s: string): string {
  return s.replace(/[\\/]/g, "-").trim().slice(0, 80) || "Allgemein";
}

function base64url(input: string): string {
  // btoa handles latin1; encode UTF-8 first
  const utf8 = unescape(encodeURIComponent(input));
  return btoa(utf8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function applyPlaceholders(
  text: string,
  vars: { name?: string | null; stadt?: string | null; fachgebiet?: string | null },
): string {
  return text
    .replace(/\{name\}/g, vars.name?.trim() || "Damen und Herren")
    .replace(/\{stadt\}/g, vars.stadt?.trim() || "Ihrer Stadt")
    .replace(/\{fachgebiet\}/g, vars.fachgebiet?.trim() || "Ihrem Fachgebiet");
}

function buildRfc2822({
  to,
  subject,
  body,
  fromName,
}: {
  to: string;
  subject: string;
  body: string;
  fromName?: string;
}): string {
  // Encode subject as UTF-8 base64 (=?utf-8?B?...?=) to preserve umlauts
  const encodedSubject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const lines = [
    `To: ${to}`,
    fromName ? `From: ${fromName}` : null,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].filter(Boolean);
  return lines.join("\r\n");
}

async function listAllLabels(
  headers: Record<string, string>,
): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${GATEWAY}/users/me/labels`, { headers });
  if (!res.ok) return [];
  const j = (await res.json()) as { labels?: Array<{ id?: string; name?: string }> };
  return (j.labels ?? [])
    .filter((l): l is { id: string; name: string } => !!l.id && !!l.name);
}

async function ensureLabel(
  name: string,
  headers: Record<string, string>,
  cache: Map<string, string>,
): Promise<string | null> {
  const cached = cache.get(name);
  if (cached) return cached;
  // Try to find in current label list (refresh once)
  const labels = await listAllLabels(headers);
  for (const l of labels) cache.set(l.name, l.id);
  const existing = cache.get(name);
  if (existing) return existing;

  const res = await fetch(`${GATEWAY}/users/me/labels`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { id?: string };
  if (!j.id) return null;
  cache.set(name, j.id);
  return j.id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateLeadStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  leadId: string,
  currentStatus: LeadStatusDb,
  newStatus: LeadStatusDb,
  patch: Record<string, unknown>,
): Promise<boolean> {
  if (STATUS_RANK[currentStatus] > STATUS_RANK[newStatus]) {
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

// ---- Sync state ---------------------------------------------------

export const getGmailSyncState = createServerFn({ method: "GET" })
  .handler(async (): Promise<{
    ok: boolean;
    connected: boolean;
    lastRunAt: string | null;
    lastSummary: SyncSummary | null;
    labelCount: number;
  }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const headers = gmailHeaders();
    const { data: state } = await supabaseAdmin
      .from("gmail_sync_state")
      .select("last_full_sync_at,last_summary")
      .eq("id", 1)
      .maybeSingle();
    const { count } = await supabaseAdmin
      .from("gmail_labels")
      .select("id", { count: "exact", head: true });
    return {
      ok: true,
      connected: !!headers,
      lastRunAt:
        (state as { last_full_sync_at?: string } | null)?.last_full_sync_at ?? null,
      lastSummary:
        ((state as { last_summary?: SyncSummary } | null)?.last_summary as SyncSummary) ?? null,
      labelCount: count ?? 0,
    };
  });

// ---- Labels -------------------------------------------------------

export const ensureGmailLabels = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ ok: boolean; created: number; total: number; reason?: string }> => {
    const headers = gmailHeaders();
    if (!headers) {
      return {
        ok: false,
        created: 0,
        total: 0,
        reason: "Gmail ist noch nicht verbunden.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

    const cache = new Map<string, string>();
    let created = 0;
    for (const { land, fachgebiet } of pairs.values()) {
      const labelName = `Leads/${sanitizeLabelSegment(land)}/${sanitizeLabelSegment(fachgebiet)}`;
      const { data: existing } = await supabaseAdmin
        .from("gmail_labels")
        .select("id,label_id")
        .eq("land", land)
        .eq("fachgebiet", fachgebiet)
        .maybeSingle();
      if (existing && (existing as { label_id: string }).label_id) {
        cache.set(labelName, (existing as { label_id: string }).label_id);
        continue;
      }
      const id = await ensureLabel(labelName, headers, cache);
      if (!id) continue;
      await supabaseAdmin.from("gmail_labels").upsert(
        {
          land,
          fachgebiet,
          label_id: id,
          label_name: labelName,
        },
        { onConflict: "land,fachgebiet" },
      );
      created++;
    }

    const { count } = await supabaseAdmin
      .from("gmail_labels")
      .select("id", { count: "exact", head: true });
    return { ok: true, created, total: count ?? 0 };
  });

async function addLabelToMessage(
  messageId: string,
  labelId: string,
  headers: Record<string, string>,
): Promise<boolean> {
  const res = await fetch(`${GATEWAY}/users/me/messages/${messageId}/modify`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
  return res.ok;
}

// ---- Full sync ----------------------------------------------------

export const syncGmailAll = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ applyLabels: z.boolean().optional().default(false) }).parse(d ?? {}),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; summary: SyncSummary; lastRunAt?: string; reason?: string }> => {
      const headers = gmailHeaders();
      if (!headers) {
        return {
          ok: false,
          summary: { contacted: 0, replied: 0, bounced: 0, labeled: 0 },
          reason: "Gmail ist noch nicht verbunden.",
        };
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: state } = await supabaseAdmin
        .from("gmail_sync_state")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      const fallbackSince = Math.floor((Date.now() - 1000 * 60 * 60 * 24 * 30) / 1000);
      const sinceSent = state?.last_sent_check_at
        ? Math.floor(new Date(state.last_sent_check_at as string).getTime() / 1000)
        : fallbackSince;
      const sinceInbox = state?.last_inbox_check_at
        ? Math.floor(new Date(state.last_inbox_check_at as string).getTime() / 1000)
        : fallbackSince;
      const runStartedAt = new Date().toISOString();

      // Label-Mapping
      const { data: labelRows } = await supabaseAdmin
        .from("gmail_labels")
        .select("land,fachgebiet,label_id");
      const labelMap = new Map<string, string>();
      for (const l of (labelRows ?? []) as Array<{
        land: string;
        fachgebiet: string;
        label_id: string;
      }>) {
        labelMap.set(`${l.land}|${l.fachgebiet}`, l.label_id);
      }

      const summary: SyncSummary = { contacted: 0, replied: 0, bounced: 0, labeled: 0 };

      // Helper: fetch message metadata by id
      const fetchMeta = async (id: string) => {
        const r = await fetch(
          `${GATEWAY}/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers },
        );
        if (!r.ok) return null;
        return (await r.json()) as {
          id?: string;
          threadId?: string;
          internalDate?: string;
          payload?: { headers?: Array<{ name?: string; value?: string }> };
        };
      };

      const headerValue = (
        msg: { payload?: { headers?: Array<{ name?: string; value?: string }> } } | null,
        name: string,
      ): string | null => {
        if (!msg?.payload?.headers) return null;
        for (const h of msg.payload.headers) {
          if ((h.name ?? "").toLowerCase() === name.toLowerCase()) return h.value ?? null;
        }
        return null;
      };

      const extractAddress = (raw: string | null): string | null => {
        if (!raw) return null;
        const m = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        return m ? m[0].toLowerCase() : null;
      };

      // --- 1) Gesendet ---------------------------------------------------
      const sentListRes = await fetch(
        `${GATEWAY}/users/me/messages?maxResults=200&q=${encodeURIComponent(
          `in:sent after:${sinceSent}`,
        )}`,
        { headers },
      );
      if (sentListRes.ok) {
        const sentJson = (await sentListRes.json()) as {
          messages?: Array<{ id?: string }>;
        };
        const sentIds = (sentJson.messages ?? []).map((m) => m.id).filter(Boolean) as string[];
        const recipients = new Map<
          string,
          { id: string; threadId: string | null; sentAt: string }
        >();
        for (const id of sentIds.slice(0, 200)) {
          const meta = await fetchMeta(id);
          if (!meta) continue;
          const toRaw = headerValue(meta, "To");
          if (!toRaw) continue;
          const sentAt = meta.internalDate
            ? new Date(Number(meta.internalDate)).toISOString()
            : runStartedAt;
          // Mehrere Empfänger pro Header möglich
          const addresses = (toRaw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])
            .map((s) => s.toLowerCase());
          for (const addr of addresses) {
            const prev = recipients.get(addr);
            if (!prev || prev.sentAt < sentAt) {
              recipients.set(addr, {
                id: meta.id ?? id,
                threadId: meta.threadId ?? null,
                sentAt,
              });
            }
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
            const changed = await updateLeadStatus(
              supabaseAdmin,
              lead.id,
              lead.status,
              "angeschrieben",
              {
                last_contacted_at: meta.sentAt,
                gmail_message_id: meta.id,
                gmail_thread_id: meta.threadId,
              },
            );
            if (changed) summary.contacted++;

            if (data.applyLabels && lead.fachgebiet) {
              const labelId = labelMap.get(`${lead.land}|${lead.fachgebiet}`);
              if (labelId) {
                const ok = await addLabelToMessage(meta.id, labelId, headers);
                if (ok) summary.labeled++;
              }
            }
          }
        }
      }

      // --- 2) Inbox / Antworten ------------------------------------------
      const inboxListRes = await fetch(
        `${GATEWAY}/users/me/messages?maxResults=200&q=${encodeURIComponent(
          `in:inbox after:${sinceInbox}`,
        )}`,
        { headers },
      );
      if (inboxListRes.ok) {
        const inboxJson = (await inboxListRes.json()) as {
          messages?: Array<{ id?: string }>;
        };
        const inboxIds = (inboxJson.messages ?? []).map((m) => m.id).filter(Boolean) as string[];
        const senders = new Map<
          string,
          { id: string; threadId: string | null; receivedAt: string }
        >();
        const bounceCandidates: Array<{ id: string }> = [];

        for (const id of inboxIds.slice(0, 200)) {
          const meta = await fetchMeta(id);
          if (!meta) continue;
          const fromRaw = headerValue(meta, "From");
          const subject = headerValue(meta, "Subject") ?? "";
          const addr = extractAddress(fromRaw);
          if (!addr) continue;
          const receivedAt = meta.internalDate
            ? new Date(Number(meta.internalDate)).toISOString()
            : runStartedAt;

          // Bounce-Heuristik
          const subjLow = subject.toLowerCase();
          if (
            addr.includes("mailer-daemon") ||
            addr.includes("postmaster") ||
            subjLow.includes("undeliverable") ||
            subjLow.includes("unzustellbar") ||
            subjLow.includes("delivery failed") ||
            subjLow.includes("delivery status")
          ) {
            bounceCandidates.push({ id: meta.id ?? id });
            continue;
          }

          const prev = senders.get(addr);
          if (!prev || prev.receivedAt < receivedAt) {
            senders.set(addr, {
              id: meta.id ?? id,
              threadId: meta.threadId ?? null,
              receivedAt,
            });
          }
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
            const changed = await updateLeadStatus(
              supabaseAdmin,
              lead.id,
              lead.status,
              "geantwortet",
              {
                last_replied_at: meta.receivedAt,
                gmail_thread_id: meta.threadId,
              },
            );
            if (changed) summary.replied++;

            if (data.applyLabels && lead.fachgebiet) {
              const labelId = labelMap.get(`${lead.land}|${lead.fachgebiet}`);
              if (labelId) {
                const ok = await addLabelToMessage(meta.id, labelId, headers);
                if (ok) summary.labeled++;
              }
            }
          }
        }

        // --- 3) Bounces: Body lesen, Email extrahieren ------------------
        for (const bounce of bounceCandidates.slice(0, 50)) {
          const res = await fetch(
            `${GATEWAY}/users/me/messages/${bounce.id}?format=full`,
            { headers },
          );
          if (!res.ok) continue;
          const j = (await res.json()) as {
            payload?: {
              parts?: Array<{ body?: { data?: string }; mimeType?: string }>;
              body?: { data?: string };
            };
            snippet?: string;
          };
          // Sammele Text aus snippet + decoded body parts
          let text = j.snippet ?? "";
          const collect = (b: { data?: string } | undefined) => {
            if (!b?.data) return;
            try {
              const norm = b.data.replace(/-/g, "+").replace(/_/g, "/");
              text += "\n" + atob(norm);
            } catch {
              /* ignore */
            }
          };
          collect(j.payload?.body);
          for (const p of j.payload?.parts ?? []) collect(p.body);

          const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
          const unique = Array.from(new Set(matches.map((s) => s.toLowerCase())));
          if (unique.length === 0) continue;
          const { data: leads } = await supabaseAdmin
            .from("leads")
            .select("id,email,status")
            .in("email", unique);
          for (const lead of (leads ?? []) as Array<{
            id: string;
            email: string;
            status: LeadStatusDb;
          }>) {
            const changed = await updateLeadStatus(
              supabaseAdmin,
              lead.id,
              lead.status,
              "bounce",
              { bounced_at: runStartedAt },
            );
            if (changed) summary.bounced++;
          }
        }
      }

      await supabaseAdmin.from("gmail_sync_state").upsert({
        id: 1,
        last_sent_check_at: runStartedAt,
        last_inbox_check_at: runStartedAt,
        last_bounce_check_at: runStartedAt,
        last_full_sync_at: runStartedAt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        last_summary: summary as any,
      });

      return { ok: true, summary, lastRunAt: runStartedAt };
    },
  );

// ---- Drafts -------------------------------------------------------

const CreateDraftInput = z.object({
  leadId: z.string().uuid(),
  templateId: z.string().uuid().optional().nullable(),
  subject: z.string().min(1).max(300).optional(),
  bodyText: z.string().min(1).max(20000).optional(),
});

export const createGmailDraft = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateDraftInput.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; draftId?: string; reason?: string; subject?: string }> => {
      const headers = gmailHeaders();
      if (!headers) return { ok: false, reason: "Gmail ist noch nicht verbunden." };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: lead, error: leadErr } = await supabaseAdmin
        .from("leads")
        .select("id,email,name,stadt,fachgebiet,zielgruppe")
        .eq("id", data.leadId)
        .maybeSingle();
      if (leadErr || !lead) return { ok: false, reason: "Lead nicht gefunden." };

      let subject = data.subject?.trim();
      let bodyText = data.bodyText;
      if (!subject || !bodyText) {
        // Vorlage laden: explizit oder default für Zielgruppe
        let tplQuery = supabaseAdmin
          .from("email_templates")
          .select("betreff,body_text")
          .limit(1);
        if (data.templateId) {
          tplQuery = tplQuery.eq("id", data.templateId);
        } else {
          tplQuery = tplQuery
            .eq("zielgruppe", lead.zielgruppe ?? "")
            .eq("is_default", true);
        }
        const { data: tpl } = await tplQuery.maybeSingle();
        if (!tpl) {
          return {
            ok: false,
            reason: "Keine passende Vorlage gefunden. Bitte erst Anschreiben-Vorlage anlegen.",
          };
        }
        subject = subject || (tpl as { betreff: string }).betreff;
        bodyText = bodyText || (tpl as { body_text: string }).body_text;
      }

      const vars = {
        name: (lead as { name: string | null }).name,
        stadt: (lead as { stadt: string | null }).stadt,
        fachgebiet: (lead as { fachgebiet: string | null }).fachgebiet,
      };
      const finalSubject = applyPlaceholders(subject!, vars);
      const finalBody = applyPlaceholders(bodyText!, vars);

      const raw = buildRfc2822({
        to: (lead as { email: string }).email,
        subject: finalSubject,
        body: finalBody,
      });

      const res = await fetch(`${GATEWAY}/users/me/drafts`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { raw: base64url(raw) } }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          reason: `Gmail-Entwurf fehlgeschlagen (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
        };
      }
      const j = (await res.json()) as {
        id?: string;
        message?: { threadId?: string; id?: string };
      };
      const draftId = j.id ?? null;
      const threadId = j.message?.threadId ?? null;

      await supabaseAdmin
        .from("leads")
        .update({
          gmail_draft_id: draftId,
          gmail_thread_id: threadId,
        })
        .eq("id", data.leadId);

      return { ok: true, draftId: draftId ?? undefined, subject: finalSubject };
    },
  );

// ---- Send (direct) ------------------------------------------------

const SendInput = z.object({
  leadId: z.string().uuid(),
  templateId: z.string().uuid().optional().nullable(),
  subject: z.string().min(1).max(300).optional(),
  bodyText: z.string().min(1).max(20000).optional(),
  applyLabel: z.boolean().optional().default(true),
});

export const sendGmailEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      messageId?: string;
      threadId?: string;
      subject?: string;
      reason?: string;
    }> => {
      const headers = gmailHeaders();
      if (!headers) return { ok: false, reason: "Gmail ist noch nicht verbunden." };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: lead, error: leadErr } = await supabaseAdmin
        .from("leads")
        .select("id,email,name,stadt,fachgebiet,zielgruppe,land,status")
        .eq("id", data.leadId)
        .maybeSingle();
      if (leadErr || !lead) return { ok: false, reason: "Lead nicht gefunden." };

      let subject = data.subject?.trim();
      let bodyText = data.bodyText;
      if (!subject || !bodyText) {
        let tplQuery = supabaseAdmin
          .from("email_templates")
          .select("betreff,body_text")
          .limit(1);
        if (data.templateId) {
          tplQuery = tplQuery.eq("id", data.templateId);
        } else {
          tplQuery = tplQuery
            .eq("zielgruppe", (lead as { zielgruppe: string | null }).zielgruppe ?? "")
            .eq("is_default", true);
        }
        const { data: tpl } = await tplQuery.maybeSingle();
        if (!tpl) {
          return {
            ok: false,
            reason: "Keine passende Vorlage. Bitte zuerst Anschreiben-Vorlage anlegen.",
          };
        }
        subject = subject || (tpl as { betreff: string }).betreff;
        bodyText = bodyText || (tpl as { body_text: string }).body_text;
      }

      const vars = {
        name: (lead as { name: string | null }).name,
        stadt: (lead as { stadt: string | null }).stadt,
        fachgebiet: (lead as { fachgebiet: string | null }).fachgebiet,
      };
      const finalSubject = applyPlaceholders(subject!, vars);
      const finalBody = applyPlaceholders(bodyText!, vars);

      const raw = buildRfc2822({
        to: (lead as { email: string }).email,
        subject: finalSubject,
        body: finalBody,
      });

      const res = await fetch(`${GATEWAY}/users/me/messages/send`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: base64url(raw) }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          reason: `Gmail-Versand fehlgeschlagen (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
        };
      }
      const j = (await res.json()) as { id?: string; threadId?: string };
      const now = new Date().toISOString();

      // Label anfügen (best effort)
      let labelId: string | null = null;
      if (data.applyLabel && j.id && (lead as { fachgebiet: string | null }).fachgebiet) {
        const { data: labelRow } = await supabaseAdmin
          .from("gmail_labels")
          .select("label_id")
          .eq("land", (lead as { land: string }).land)
          .eq("fachgebiet", (lead as { fachgebiet: string }).fachgebiet)
          .maybeSingle();
        if (labelRow?.label_id) {
          labelId = labelRow.label_id as string;
          await addLabelToMessage(j.id, labelId, headers);
        }
      }

      const currentStatus = (lead as { status: LeadStatusDb }).status;
      const patch: Record<string, unknown> = {
        last_contacted_at: now,
        gmail_message_id: j.id ?? null,
        gmail_thread_id: j.threadId ?? null,
      };
      if (labelId) patch.gmail_label_id = labelId;
      await updateLeadStatus(supabaseAdmin, data.leadId, currentStatus, "angeschrieben", patch);

      return {
        ok: true,
        messageId: j.id,
        threadId: j.threadId,
        subject: finalSubject,
      };
    },
  );

// ---- Templates ----------------------------------------------------

export interface DbEmailTemplate {
  id: string;
  zielgruppe: string;
  sprache: string;
  betreff: string;
  body_text: string;
  body_html: string | null;
  is_default: boolean;
  erstellt_am: string;
  updated_at: string;
}

const APP_MODES_TPL = ["gutachten", "dsb"] as const;
const ModeSchemaTpl = z.enum(APP_MODES_TPL).optional().default("gutachten");

export const listEmailTemplates = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ mode: ModeSchemaTpl }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ ok: boolean; items: DbEmailTemplate[]; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("email_templates")
      .select("*")
      .eq("mode", data.mode)
      .order("zielgruppe")
      .order("is_default", { ascending: false });
    if (error) return { ok: false, items: [], error: error.message };
    return { ok: true, items: (rows ?? []) as unknown as DbEmailTemplate[] };
  });

const UpsertTemplateInput = z.object({
  id: z.string().uuid().optional(),
  zielgruppe: z.string().min(1).max(60),
  sprache: z.string().min(2).max(8).default("de"),
  betreff: z.string().min(1).max(300),
  body_text: z.string().min(1).max(20000),
  body_html: z.string().max(40000).optional().nullable(),
  is_default: z.boolean().optional().default(false),
  mode: z.enum(APP_MODES_TPL).optional().default("gutachten"),
});

export const upsertEmailTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpsertTemplateInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      zielgruppe: data.zielgruppe,
      sprache: data.sprache,
      betreff: data.betreff,
      body_text: data.body_text,
      body_html: data.body_html ?? null,
      is_default: data.is_default ?? false,
      mode: data.mode ?? "gutachten",
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("email_templates")
        .update(row)
        .eq("id", data.id);
      return error ? { ok: false, error: error.message } : { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("email_templates")
      .insert(row)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: (ins as { id: string } | null)?.id };
  });

export const deleteEmailTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("email_templates").delete().eq("id", data.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  });

// keep LEAD_STATUS reachable to avoid tree-shake of the runtime tuple import
void LEAD_STATUS;
