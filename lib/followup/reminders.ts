import type { FollowupReminder } from "@/types";
import { pickContactField } from "@/lib/followup/contacts";

export type ReminderViewStatus = "pending" | "overdue" | "completed";

export interface FollowupReminderView {
  id: string;
  recipient_id: string;
  user_id: string;
  scheduled_at: string;
  status: ReminderViewStatus;
  note: string;
  created_at: string;
  updated_at: string;
  recipient_email: string;
  recipient_name: string;
  recipient_company: string;
  recipient_campaign: string;
}

type ReminderRow = Pick<
  FollowupReminder,
  "id" | "recipient_id" | "user_id" | "scheduled_at" | "status" | "note" | "created_at" | "updated_at"
> & {
  recipients?:
    | { email?: string; data?: Record<string, string> | null; campaigns?: unknown }
    | Array<{ email?: string; data?: Record<string, string> | null; campaigns?: unknown }>
    | null;
};

/** Effective reminder status: completed | pending | overdue. */
export function effectiveReminderStatus(
  status: string,
  scheduledAt: string,
  now: number = Date.now()
): ReminderViewStatus {
  if (status === "completed") return "completed";
  return new Date(scheduledAt).getTime() < now ? "overdue" : "pending";
}

/** Enriches a reminder row with linked recipient + campaign display fields. */
export function mapReminderToView(r: ReminderRow): FollowupReminderView {
  const recipientRaw = Array.isArray(r.recipients) ? r.recipients[0] : r.recipients;
  const recipient = (recipientRaw ?? null) as { email?: string; data?: Record<string, string> | null; campaigns?: unknown } | null;
  const campaign = Array.isArray(recipient?.campaigns)
    ? (recipient.campaigns[0] as { name?: string } | null)
    : (recipient?.campaigns as { name?: string } | null);
  const status: ReminderViewStatus =
    r.status === "completed"
      ? "completed"
      : effectiveReminderStatus(r.status, r.scheduled_at);

  return {
    id: r.id,
    recipient_id: r.recipient_id,
    user_id: r.user_id,
    scheduled_at: r.scheduled_at,
    status,
    note: r.note || "",
    created_at: r.created_at,
    updated_at: r.updated_at,
    recipient_email: recipient?.email || "",
    recipient_name: pickContactField(recipient?.data ?? null, "name", "full name", "fullname", "first name", "firstname", "contact", "lead"),
    recipient_company: pickContactField(recipient?.data ?? null, "company", "company name", "organization", "organisation", "business"),
    recipient_campaign: campaign?.name || "",
  };
}
