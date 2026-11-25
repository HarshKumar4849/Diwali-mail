export type CampaignStatus = 'draft' | 'sending' | 'done' | 'partial';
export type RecipientStatus = 'pending' | 'sending' | 'sent' | 'failed';
export type AttachmentType = 'global' | 'per-recipient';
export type FollowupStatus =
  | 'delivery_failed'
  | 'auto_reply'
  | 'genuine_reply'
  | 'no_response'
  | 'followup_due';

export type FollowupReminderStatus = 'pending' | 'completed';

export interface FollowupReminder {
  id: string;
  recipient_id: string;
  user_id: string;
  scheduled_at: string;
  status: FollowupReminderStatus;
  note: string;
  created_at: string;
  updated_at: string;
}

/** Reminder enriched with the linked recipient + campaign display fields. */
export interface FollowupReminderContact extends FollowupReminder {
  recipient_email: string;
  recipient_name: string;
  recipient_company: string;
  recipient_campaign: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  subject_template: string;
  body_template: string;
  global_bcc: string;
  global_cc: string;
  rate_limit: number;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface Recipient {
  id: string;
  campaign_id: string;
  email: string;
  data: Record<string, string>;
  attachment_path: string;
  status: RecipientStatus;
  error_message: string;
  retry_count: number;
  sent_at: string | null;
  created_at: string;
  // Lead follow-up tracking columns (migration 002)
  internet_message_id?: string;
  bounced_at?: string | null;
  reply_kind?: '' | 'auto' | 'genuine';
  reply_at?: string | null;
  reply_message_id?: string;
  last_synced_at?: string | null;
}

export interface Attachment {
  id: string;
  campaign_id: string;
  file_path: string;
  original_name: string;
  type: AttachmentType;
  csv_column: string;
  created_at: string;
}

export interface MicrosoftToken {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  microsoft_email: string;
}

export interface CampaignFormData {
  name: string;
  subject_template: string;
  body_template: string;
  global_bcc: string;
  global_cc: string;
  rate_limit: number;
}

export interface WizardData {
  name: string;
  subject_template: string;
  body_template: string;
  global_bcc: string;
  global_cc: string;
  rate_limit: number;
  csvHeaders: string[];
  csvRows: Record<string, string>[];
  csvFileName: string;
  globalAttachments: { name: string; path: string }[];
  attachmentColumn: string;
  emailColumn: string;
}
