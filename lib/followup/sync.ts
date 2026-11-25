import { createGraphClient } from "@/lib/graph/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lead Follow-up sync (Phase 1).
 *
 * Uses ONLY capabilities the connected Microsoft Graph mailbox actually supports
 * (delegated Mail.Read + Mail.Send):
 * - Delivery failures: NDR / "Undeliverable:" messages in the inbox.
 * - Replies: inbox messages whose In-Reply-To / References header matches the
 *   stored internetMessageId of a sent email (fallback: same sender after sent_at).
 * - Automated vs genuine: X-Autoreply / Auto-Submitted / Precedence headers,
 *   or "Automatic Reply"/"Out of Office" style subjects.
 *
 * Nothing here is inferred as "delivered": a send is delivered when no NDR
 * arrives for it within the reply window.
 */

export interface SyncResult {
  inboxScanned: number;
  sentItemsScanned: number;
  bouncesDetected: number;
  autoRepliesDetected: number;
  genuineRepliesDetected: number;
  trackingColumnsAvailable: boolean;
  /** Detected this run, keyed by recipient id (live overlay when columns don't exist yet). */
  bounces: Record<string, string>;
  replies: Record<string, { reply_kind: "auto" | "genuine"; reply_at: string; reply_category: string }>;
  errors: string[];
}

interface FollowupRecipient {
  id: string;
  campaign_id: string;
  email: string;
  status: string;
  sent_at: string | null;
  internet_message_id?: string;
  bounced_at?: string | null;
  reply_kind?: string;
}

interface GraphRecipientAddress {
  emailAddress: { address?: string; name?: string };
}

interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { address?: string } };
  toRecipients?: GraphRecipientAddress[];
  receivedDateTime?: string;
  sentDateTime?: string;
  bodyPreview?: string;
  internetMessageId?: string;
  internetMessageHeaders?: { name: string; value: string }[];
}

const TRACKING_COLUMNS = "id, campaign_id, email, status, sent_at, internet_message_id, bounced_at, reply_kind";
const BASIC_COLUMNS = "id, campaign_id, email, status, sent_at";
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const AUTO_SUBJECT_RE =
  /^(automatic reply|auto:|autoreply|automatic response|out of office|absence notification|abwesenheit|réponse automatique|risposta automatica)/i;

function headerValue(msg: GraphMessage, name: string): string {
  const h = msg.internetMessageHeaders?.find(x => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function isAutomated(msg: GraphMessage): boolean {
  if (/yes/i.test(headerValue(msg, "X-Autoreply"))) return true;
  if (/^auto/i.test(headerValue(msg, "Auto-Submitted"))) return true;
  if (/auto_reply|junk/i.test(headerValue(msg, "Precedence"))) return true;
  if (/^bulk|autoreply$/i.test(headerValue(msg, "X-Autorespond"))) return true;
  if (AUTO_SUBJECT_RE.test(msg.subject || "")) return true;
  return false;
}

/**
 * Phase 4: categorize a genuine reply as Interested / Referral / Other
 * (automated replies are categorized as Automated Response).
 */
function categorizeReply(msg: GraphMessage, kind: "auto" | "genuine"): string {
  if (kind === "auto") return "Automated Response";
  const text = `${msg.subject || ""} ${msg.bodyPreview || ""}`.toLowerCase();
  if (/(referral|introduce|colleague|partner|bringing)/.test(text)) return "Referral";
  if (/(interest|interested|good news|sounds good|let.s talk|excited|pleased|reply to)/.test(text)) return "Interested";
  return "Other";
}

function isNdr(msg: GraphMessage): boolean {
  const from = msg.from?.emailAddress?.address?.toLowerCase() || "";
  if (from.endsWith("@postmaster") || from.startsWith("postmaster@")) return true;
  if (/^undeliverable[:\s]/i.test(msg.subject || "")) return true;
  if (/report\/delivery-status/i.test(headerValue(msg, "Content-Type"))) return true;
  if (/5\.\d\.\d/.test(msg.subject || "") && /undeliver/i.test(msg.subject || "")) return true;
  return false;
}

export async function syncFollowupData(
  userId: string,
  supabase: SupabaseClient
): Promise<SyncResult> {
  const result: SyncResult = {
    inboxScanned: 0,
    sentItemsScanned: 0,
    bouncesDetected: 0,
    autoRepliesDetected: 0,
    genuineRepliesDetected: 0,
    trackingColumnsAvailable: false,
    bounces: {},
    replies: {},
    errors: [],
  };

  // 1. Load this user's sent/failed recipients. Prefer tracking columns when the
  // migration (002) has been applied; degrade to basic columns otherwise.
  let rows: FollowupRecipient[] = [];
  let trackingAvailable = true;
  const primary = await supabase
    .from("recipients")
    .select(`${TRACKING_COLUMNS}, campaigns!inner(user_id)`)
    .eq("campaigns.user_id", userId)
    .in("status", ["sent", "failed"])
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1000);

  if (primary.error && /column|PGRST204/i.test(primary.error.message)) {
    result.errors.push("Tracking columns not found — run supabase/migrations/002_lead_followups.sql");
    trackingAvailable = false;
    const basic = await supabase
      .from("recipients")
      .select(`${BASIC_COLUMNS}, campaigns!inner(user_id)`)
      .eq("campaigns.user_id", userId)
      .in("status", ["sent", "failed"])
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1000);
    if (basic.error) {
      result.errors.push(`Failed to load recipients: ${basic.error.message}`);
      return result;
    }
    rows = (basic.data || []) as unknown as FollowupRecipient[];
  } else {
    if (primary.error) {
      result.errors.push(`Failed to load recipients: ${primary.error.message}`);
      return result;
    }
    rows = (primary.data || []) as unknown as FollowupRecipient[];
  }
  result.trackingColumnsAvailable = trackingAvailable;
  if (!rows.length) return result;

  const graph = createGraphClient(userId, supabase);

  // 2. Backfill sent internetMessageIds from Sent Items (correlates replies).
  let sentMessages: GraphMessage[] = [];
  try {
    const sentRes = await graph
      .api("/me/mailFolders/sentitems/messages")
      .select("id,internetMessageId,toRecipients,sentDateTime")
      .orderby("sentDateTime desc")
      .top(200)
      .get();
    sentMessages = (sentRes?.value || []) as GraphMessage[];
    result.sentItemsScanned = sentMessages.length;
  } catch (e) {
    result.errors.push(`Sent Items read failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const backfilled: FollowupRecipient[] = [];
  for (const r of rows) {
    if (r.status !== "sent" || !r.sent_at) continue;
    if (r.internet_message_id) continue;
    const sentTime = new Date(r.sent_at).getTime();
    const match = sentMessages
      .filter(m => {
        const to = (m.toRecipients || []).some(x =>
          (x.emailAddress?.address || "").toLowerCase() === r.email.toLowerCase()
        );
        if (!to || !m.sentDateTime) return false;
        const t = new Date(m.sentDateTime).getTime();
        return t >= sentTime - 5 * 60 * 1000 && t <= sentTime + 24 * 60 * 60 * 1000;
      })
      .sort(
        (a, b) =>
          Math.abs(new Date(a.sentDateTime!).getTime() - sentTime) -
          Math.abs(new Date(b.sentDateTime!).getTime() - sentTime)
      )[0];
    if (match?.internetMessageId) {
      r.internet_message_id = match.internetMessageId;
      backfilled.push(r);
    }
  }

  // 3. Scan inbox for replies and NDRs.
  let inbox: GraphMessage[] = [];
  try {
    const inboxRes = await graph
      .api("/me/mailFolders/inbox/messages")
      .select("id,subject,from,toRecipients,receivedDateTime,bodyPreview,internetMessageId,internetMessageHeaders")
      .orderby("receivedDateTime desc")
      .top(200)
      .get();
    inbox = (inboxRes?.value || []) as GraphMessage[];
    result.inboxScanned = inbox.length;
  } catch (e) {
    result.errors.push(`Inbox read failed: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  const bounceUpdates = new Map<string, { bounced_at: string }>();
  const replyUpdates = new Map<
    string,
    { reply_kind: "auto" | "genuine"; reply_at: string; reply_message_id: string; reply_category: string }
  >();

  const byMsgId = new Map<string, FollowupRecipient>();
  for (const r of rows) if (r.internet_message_id) byMsgId.set(r.internet_message_id.toLowerCase(), r);

  for (const msg of inbox) {
    const received = msg.receivedDateTime ? new Date(msg.receivedDateTime) : null;

    // NDR / bounce
    if (isNdr(msg)) {
      const bodyEmails = (msg.bodyPreview?.match(EMAIL_RE) || []).map(e => e.toLowerCase());
      const targets = rows.filter(r => bodyEmails.includes(r.email.toLowerCase()));
      for (const r of targets) {
        if (r.bounced_at) continue;
        bounceUpdates.set(r.id, { bounced_at: (received || new Date()).toISOString() });
        result.bouncesDetected++;
      }
      continue;
    }

    // Reply matched by In-Reply-To / References → stored internetMessageId
    let target: FollowupRecipient | undefined;
    const inReplyTo = `${headerValue(msg, "In-Reply-To")} ${headerValue(msg, "References")}`.toLowerCase();
    if (inReplyTo) {
      for (const [mid, r] of byMsgId) {
        if (inReplyTo.includes(mid)) {
          target = r;
          break;
        }
      }
    }
    // Fallback: same sender replying after the send (exact when one email per contact/campaign)
    if (!target) {
      const fromAddr = (msg.from?.emailAddress?.address || "").toLowerCase();
      if (fromAddr) {
        const candidates = rows.filter(
          r =>
            r.email.toLowerCase() === fromAddr &&
            r.sent_at &&
            received &&
            new Date(received).getTime() > new Date(r.sent_at).getTime()
        );
        target = candidates.sort(
          (a, b) => new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime()
        )[0];
      }
    }

    if (!target || target.reply_kind) continue;
    const kind: "auto" | "genuine" = isAutomated(msg) ? "auto" : "genuine";
    replyUpdates.set(target.id, {
      reply_kind: kind,
      reply_at: (received || new Date()).toISOString(),
      reply_message_id: msg.internetMessageId || msg.id,
      reply_category: categorizeReply(msg, kind),
    });
    if (kind === "genuine") result.genuineRepliesDetected++;
    else result.autoRepliesDetected++;
  }

  // 4. Persist to Supabase when tracking columns exist; always expose detections live.
  for (const [id, patch] of bounceUpdates) result.bounces[id] = patch.bounced_at;
  for (const [id, patch] of replyUpdates) result.replies[id] = { reply_kind: patch.reply_kind, reply_at: patch.reply_at, reply_category: patch.reply_category };
  if (result.trackingColumnsAvailable) {
    for (const r of backfilled) {
      const { error } = await supabase
        .from("recipients")
        .update({ internet_message_id: r.internet_message_id })
        .eq("id", r.id);
      if (error) result.errors.push(`Backfill update failed: ${error.message}`);
    }
    for (const [id, patch] of bounceUpdates) {
      const { error } = await supabase.from("recipients").update(patch).eq("id", id);
      if (error) result.errors.push(`Bounce update failed: ${error.message}`);
    }
    for (const [id, patch] of replyUpdates) {
      const { error } = await supabase.from("recipients").update(patch).eq("id", id);
      if (error) result.errors.push(`Reply update failed: ${error.message}`);
    }
  }

  return result;
}
