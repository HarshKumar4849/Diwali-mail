import type { SupabaseClient } from "@supabase/supabase-js";
import { syncFollowupData, type SyncResult } from "@/lib/followup/sync";
import type { FollowupStatus } from "@/types";

export interface FollowupContact {
  id: string;
  email: string;
  name: string;
  company: string;
  campaign: string;
  sentAt: string;
  status: FollowupStatus;
  bouncedAt?: string | null;
  replyAt?: string;
  replyCategory?: string;
}

export const FOLLOWUP_INTERVALS = [3, 5, 7, 10] as const;
export type FollowupInterval = (typeof FOLLOWUP_INTERVALS)[number];

/**
 * Derives the five follow-up statuses from REAL send/bounce/reply data.
 * Sent is never treated as delivered: a send only stays "No Response" /
 * "Follow-up Due" while no NDR has arrived for it.
 */
export function deriveFollowupStatus(
  r: {
    status: string;
    bounced_at?: string | null;
    reply_kind?: string;
    sent_at: string | null;
  },
  intervalDays: number
): FollowupStatus | null {
  if (r.status === "failed" || r.bounced_at) return "delivery_failed";
  if (r.status !== "sent" || !r.sent_at) return null; // pending/sending: no campaign history yet
  if (r.reply_kind === "genuine") return "genuine_reply";
  if (r.reply_kind === "auto") return "auto_reply";
  const days = (Date.now() - new Date(r.sent_at).getTime()) / 86_400_000;
  return days >= intervalDays ? "followup_due" : "no_response";
}

/** Picks display values from the CSV data columns (case-insensitive lookup). */
export function pickContactField(data: Record<string, string> | null, ...keys: string[]): string {
  if (!data) return "";
  const lower = Object.fromEntries(Object.entries(data).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const v = lower[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

export interface FollowupContactsResult {
  contacts: FollowupContact[];
  sync: SyncResult;
  error?: string;
}

/**
 * Loads the current user's follow-up contacts (with live mailbox sync applied).
 * Shared by /api/followups and /api/followups/export.
 */
export async function loadFollowupContacts(
  userId: string,
  supabase: SupabaseClient,
  intervalDays: number
): Promise<FollowupContactsResult> {
  const sync = await syncFollowupData(userId, supabase);

  const baseSelect = `id, campaign_id, email, data, status, sent_at, campaigns!inner(name)`;
  let { data: rows, error } = await supabase
    .from("recipients")
    .select(`${baseSelect}, bounced_at, reply_kind`)
    .eq("campaigns.user_id", userId)
    .in("status", ["sent", "failed"])
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1000);

  if (error && /column|PGRST204/i.test(error.message)) {
    // Migration 002 not applied yet: derive statuses from existing data only.
    const fallback = await supabase
      .from("recipients")
      .select(baseSelect)
      .eq("campaigns.user_id", userId)
      .in("status", ["sent", "failed"])
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1000);
    rows = fallback.data as typeof rows;
    error = fallback.error;
  }

  if (error) {
    return { contacts: [], sync, error: error.message };
  }

  const contacts: FollowupContact[] = [];
  for (const r of rows || []) {
    // Overlay live sync detections for anything the DB doesn't have yet
    const bounced = r.bounced_at ?? sync.bounces[r.id];
    const replyKind = r.reply_kind || sync.replies[r.id]?.reply_kind || "";
    const replyAt = sync.replies[r.id]?.reply_at;
    const replyCategory = sync.replies[r.id]?.reply_kind === "auto" ? "Automated Response" : sync.replies[r.id]?.reply_kind === "genuine" ? sync.replies[r.id]?.reply_category : "";
    const status = deriveFollowupStatus({ status: r.status, bounced_at: bounced, reply_kind: replyKind, sent_at: r.sent_at }, intervalDays);
    if (!status) continue; // pending/sending or no campaign history yet
    contacts.push({
      id: r.id,
      email: r.email,
      name: pickContactField(r.data as Record<string, string>, "name", "full name", "fullname", "first name", "firstname", "contact", "lead"),
      company: pickContactField(r.data as Record<string, string>, "company", "company name", "organization", "organisation", "business"),
      campaign: Array.isArray(r.campaigns) ? (r.campaigns[0] as { name?: string } | null)?.name || "" : "",
      sentAt: r.sent_at,
      status,
      bouncedAt: bounced,
      replyAt,
      replyCategory,
    });
  }

  return { contacts, sync };
}
