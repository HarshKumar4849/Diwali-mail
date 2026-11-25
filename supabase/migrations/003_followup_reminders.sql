-- 003_followup_reminders.sql
-- Lead Follow-up Management: persistent follow-up reminders for follow-up contacts.

CREATE TABLE IF NOT EXISTS followup_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE followup_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their followup reminders"
  ON followup_reminders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_followup_reminders_recipient
  ON followup_reminders(recipient_id);

CREATE INDEX IF NOT EXISTS idx_followup_reminders_status_scheduled
  ON followup_reminders(status, scheduled_at);

-- Prevent duplicate pending reminders for the same recipient.
CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_reminders_one_pending_per_recipient
  ON followup_reminders(recipient_id)
  WHERE status = 'pending';
