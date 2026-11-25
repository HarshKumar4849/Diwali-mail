-- 002_lead_followups.sql
-- Lead Follow-up Management: delivery/reply tracking associations on recipients.
-- No new tables: contacts are recipients; statuses are derived, never stored stale.

ALTER TABLE recipients
  ADD COLUMN IF NOT EXISTS internet_message_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_kind TEXT DEFAULT '' CHECK (reply_kind IN ('', 'auto', 'genuine')),
  ADD COLUMN IF NOT EXISTS reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_message_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Exact reply correlation via In-Reply-To / References headers
CREATE INDEX IF NOT EXISTS idx_recipients_internet_message_id
  ON recipients(internet_message_id) WHERE internet_message_id <> '';

CREATE INDEX IF NOT EXISTS idx_recipients_sent_at
  ON recipients(sent_at) WHERE sent_at IS NOT NULL;
