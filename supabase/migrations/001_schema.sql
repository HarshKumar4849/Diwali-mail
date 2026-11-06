CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL DEFAULT '',
  global_bcc TEXT DEFAULT '',
  global_cc TEXT DEFAULT '',
  rate_limit INT DEFAULT 10,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sending','done','partial')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their campaigns"
  ON campaigns FOR ALL
  USING (auth.uid() = user_id);

CREATE TABLE recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  attachment_path TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  error_message TEXT DEFAULT '',
  retry_count INT DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their recipients"
  ON recipients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = recipients.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  type TEXT DEFAULT 'global' CHECK (type IN ('global','per-recipient')),
  csv_column TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their attachments"
  ON attachments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = attachments.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE TABLE microsoft_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  microsoft_email TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE microsoft_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their tokens"
  ON microsoft_tokens FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_recipients_campaign ON recipients(campaign_id);
CREATE INDEX idx_recipients_status ON recipients(status);
CREATE INDEX idx_campaigns_user ON campaigns(user_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_microsoft_tokens_updated_at
  BEFORE UPDATE ON microsoft_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Storage policies for the mailcraft bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('mailcraft', 'mailcraft', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Allow all on mailcraft bucket"
ON storage.objects FOR ALL
USING ( bucket_id = 'mailcraft' )
WITH CHECK ( bucket_id = 'mailcraft' );
