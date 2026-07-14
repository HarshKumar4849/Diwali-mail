# Mailcraft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PWA for sending personalized bulk emails via Microsoft Outlook (Graph API) with CSV import, template placeholders, attachments, and BCC/CC support.

**Architecture:** Next.js App Router with Supabase (Postgres, Auth, Storage, Realtime). Frontend is a multi-step wizard for composing campaigns. Backend API routes handle Microsoft OAuth, campaign CRUD, file uploads, and a queued email sending pipeline via Graph API.

**Tech Stack:** Next.js 14+ (App Router, TypeScript), Tailwind CSS, shadcn/ui, Supabase, Microsoft Graph API (`@microsoft/microsoft-graph-client`), `@serwist/next` (PWA), Supabase Realtime for live progress.

---

## File Structure

```
mailcraft/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── .env.local.example
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── campaign/
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── microsoft/route.ts
│   │       │   └── callback/route.ts
│   │       ├── campaigns/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       ├── recipients/route.ts
│   │       │       ├── attachments/route.ts
│   │       │       ├── send/route.ts
│   │       │       ├── retry/route.ts
│   │       │       └── process-batch/route.ts
│   │       └── upload/route.ts
│   ├── components/
│   │   ├── campaign-wizard/
│   │   │   ├── wizard.tsx
│   │   │   ├── step-setup.tsx
│   │   │   ├── step-template.tsx
│   │   │   ├── step-attachments.tsx
│   │   │   ├── step-recipients.tsx
│   │   │   ├── step-send-config.tsx
│   │   │   └── step-review.tsx
│   │   ├── campaign-card.tsx
│   │   ├── recipient-table.tsx
│   │   └── progress-bar.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   └── server.ts
│   │   ├── graph/
│   │   │   └── client.ts
│   │   ├── email/
│   │   │   ├── template.ts
│   │   │   └── send.ts
│   │   └── utils.ts
│   └── types/
│       └── index.ts
├── supabase/
│   └── migrations/
│       └── 001_schema.sql
├── public/
│   ├── manifest.json
│   ├── icon-192.png
│   └── icon-512.png
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `mailcraft/package.json`
- Create: `mailcraft/tsconfig.json`
- Create: `mailcraft/next.config.ts`
- Create: `mailcraft/tailwind.config.ts`
- Create: `mailcraft/postcss.config.js`
- Create: `mailcraft/.env.local.example`
- Create: `mailcraft/.gitignore`
- Modify: `mailcraft/src/app/globals.css`
- Create: `mailcraft/public/manifest.json`

- [ ] **Step 1: Initialize Next.js project**

Run: `npx create-next-app@latest mailcraft --typescript --tailwind --eslint --app --import-alias "@/*"`

- [ ] **Step 2: Move into project and install dependencies**

Run in `mailcraft/`:
```bash
npm install @supabase/supabase-js @supabase/ssr @microsoft/microsoft-graph-client @serwist/next
npm install -D @types/node
npx shadcn@latest init -d
npx shadcn@latest add button input card table dialog badge progress toast textarea select
```

- [ ] **Step 3: Configure environment template**

Write `mailcraft/.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_TENANT_ID=common
SESSION_SECRET=generate_a_random_secret_here
```

- [ ] **Step 4: Configure next.config.ts**

Write `mailcraft/next.config.ts`:
```ts
import type { NextConfig } from "next";
import withSerwist from "@serwist/next";

const config: NextConfig = {};

export default withSerwist({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: true,
})(config);
```

- [ ] **Step 5: Write globals.css**

Write `mailcraft/src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Write .gitignore**

Write `mailcraft/.gitignore`:
```
node_modules/
.next/
*.local
.env
```

- [ ] **Step 7: Write PWA manifest**

Write `mailcraft/public/manifest.json`:
```json
{
  "name": "Mailcraft",
  "short_name": "Mailcraft",
  "description": "Personalized bulk email campaigns via Outlook",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 8: Commit**

```bash
git init && git add -A && git commit -m "chore: initial Next.js project scaffolding"
```

---

### Task 2: Database schema (Supabase migration)

**Files:**
- Create: `mailcraft/supabase/migrations/001_schema.sql`

- [ ] **Step 1: Write migration**

Write `mailcraft/supabase/migrations/001_schema.sql`:
```sql
-- Campaigns table
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

-- Recipients table
CREATE TABLE recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  attachment_path TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
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

-- Attachments table
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

-- Microsoft OAuth tokens
CREATE TABLE microsoft_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE microsoft_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their tokens"
  ON microsoft_tokens FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_recipients_campaign ON recipients(campaign_id);
CREATE INDEX idx_recipients_status ON recipients(status);
CREATE INDEX idx_campaigns_user ON campaigns(user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/001_schema.sql
git commit -m "feat: add database schema"
```

---

### Task 3: TypeScript types and Supabase clients

**Files:**
- Create: `mailcraft/src/types/index.ts`
- Create: `mailcraft/src/lib/utils.ts`
- Create: `mailcraft/src/lib/supabase/client.ts`
- Create: `mailcraft/src/lib/supabase/server.ts`

- [ ] **Step 1: Write type definitions**

Write `mailcraft/src/types/index.ts`:
```ts
export type CampaignStatus = 'draft' | 'sending' | 'done' | 'partial';
export type RecipientStatus = 'pending' | 'sent' | 'failed';
export type AttachmentType = 'global' | 'per-recipient';

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
}

export interface CampaignFormData {
  name: string;
  subject_template: string;
  body_template: string;
  global_bcc: string;
  global_cc: string;
  rate_limit: number;
}
```

- [ ] **Step 2: Write utils**

Write `mailcraft/src/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
  return { headers, rows };
}

export function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || `{{${key}}}`);
}
```

- [ ] **Step 3: Write Supabase browser client**

Write `mailcraft/src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: Write Supabase server client**

Write `mailcraft/src/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/utils.ts src/lib/supabase/client.ts src/lib/supabase/server.ts
git commit -m "feat: add types and Supabase clients"
```

---

### Task 4: Microsoft OAuth integration

**Files:**
- Create: `mailcraft/src/app/api/auth/microsoft/route.ts`
- Create: `mailcraft/src/app/api/auth/callback/route.ts`

- [ ] **Step 1: Write Microsoft OAuth initiation route**

Write `mailcraft/src/app/api/auth/microsoft/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const clientId = process.env.MICROSOFT_CLIENT_ID!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`;
  const scope = "Mail.Send offline_access User.Read";
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Write OAuth callback route**

Write `mailcraft/src/app/api/auth/callback/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "No code provided" }, { status: 400 });

  const tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    code,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(tokenUrl, { method: "POST", body });
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok) {
    return NextResponse.json({ error: tokenData.error_description }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await supabase.from("microsoft_tokens").upsert({
    user_id: user.id,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
  }, { onConflict: "user_id" });

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/
git commit -m "feat: add Microsoft OAuth flow"
```

---

### Task 5: Campaign CRUD API

**Files:**
- Create: `mailcraft/src/app/api/campaigns/route.ts`
- Create: `mailcraft/src/app/api/campaigns/[id]/route.ts`

- [ ] **Step 1: Write campaigns list + create route**

Write `mailcraft/src/app/api/campaigns/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { data, error } = await supabase.from("campaigns").insert({
    user_id: user.id,
    name: body.name,
    subject_template: body.subject_template,
    body_template: body.body_template,
    global_bcc: body.global_bcc || "",
    global_cc: body.global_cc || "",
    rate_limit: body.rate_limit || 10,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Write single campaign routes (GET, PATCH, DELETE)**

Write `mailcraft/src/app/api/campaigns/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await req.json();
  const { data, error } = await supabase.from("campaigns").update(body).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/campaigns/
git commit -m "feat: add campaign CRUD API"
```

---

### Task 6: Recipients API + file upload API

**Files:**
- Create: `mailcraft/src/app/api/campaigns/[id]/recipients/route.ts`
- Create: `mailcraft/src/app/api/campaigns/[id]/attachments/route.ts`
- Create: `mailcraft/src/app/api/upload/route.ts`

- [ ] **Step 1: Write recipients route (batch insert + list)**

Write `mailcraft/src/app/api/campaigns/[id]/recipients/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipients").select("*").eq("campaign_id", id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await req.json();
  const recipients = body.recipients.map((r: { email: string; data: Record<string, string>; attachment_path?: string }) => ({
    campaign_id: id,
    email: r.email,
    data: r.data,
    attachment_path: r.attachment_path || "",
  }));
  const { data, error } = await supabase.from("recipients").insert(recipients).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Write attachments route (save campaign attachments)**

Write `mailcraft/src/app/api/campaigns/[id]/attachments/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const attachments = body.attachments.map((a: { file_path: string; original_name: string; type: string }) => ({
    campaign_id: id,
    file_path: a.file_path,
    original_name: a.original_name,
    type: a.type || "global",
  }));

  const { data, error } = await supabase.from("attachments").insert(attachments).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 3: Write file upload route**

Write `mailcraft/src/app/api/upload/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.split(".").pop();
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from("attachments").upload(path, file);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
  return NextResponse.json({ path, url: urlData.publicUrl, originalName: file.name });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/campaigns/[id]/recipients/route.ts src/app/api/campaigns/[id]/attachments/route.ts src/app/api/upload/route.ts
git commit -m "feat: add recipients, attachments, and upload APIs"
```

---

### Task 7: Template engine and email sending (Graph API)

**Files:**
- Create: `mailcraft/src/lib/graph/client.ts`
- Create: `mailcraft/src/lib/email/template.ts`
- Create: `mailcraft/src/lib/email/send.ts`

- [ ] **Step 1: Write Graph API client with token refresh**

Write `mailcraft/src/lib/graph/client.ts`:
```ts
import { Client } from "@microsoft/microsoft-graph-client";
import { createClient } from "@/lib/supabase/server";

async function getAccessToken(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data: token } = await supabase
    .from("microsoft_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!token) throw new Error("No Microsoft token found");

  if (new Date(token.expires_at) < new Date()) {
    const refreshUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const body = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    });
    const res = await fetch(refreshUrl, { method: "POST", body });
    const data = await res.json();
    await supabase.from("microsoft_tokens").update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || token.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    }).eq("user_id", userId);
    return data.access_token;
  }

  return token.access_token;
}

export async function createGraphClient(userId: string) {
  const accessToken = await getAccessToken(userId);
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken,
    },
  });
}
```

- [ ] **Step 2: Write template rendering**

Write `mailcraft/src/lib/email/template.ts`:
```ts
export function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => data[key] || "");
}
```

- [ ] **Step 3: Write send email function**

Write `mailcraft/src/lib/email/send.ts`:
```ts
import { createGraphClient } from "@/lib/graph/client";
import { renderTemplate } from "@/lib/email/template";
import { createClient } from "@/lib/supabase/server";
import type { Recipient, Campaign, Attachment } from "@/types";

async function downloadAttachment(path: string, name: string): Promise<{ name: string; contentBytes: string; contentType: string }> {
  const supabase = await createClient();
  const isUrl = path.startsWith("http://") || path.startsWith("https://");

  let buffer: ArrayBuffer;
  if (isUrl) {
    const res = await fetch(path);
    buffer = await res.arrayBuffer();
  } else {
    const { data, error } = await supabase.storage.from("attachments").download(path);
    if (error || !data) throw new Error(`Failed to download attachment: ${error?.message}`);
    buffer = await data.arrayBuffer();
  }

  return {
    name,
    contentBytes: Buffer.from(buffer).toString("base64"),
    contentType: "application/octet-stream",
  };
}

interface SendEmailParams {
  campaign: Campaign;
  recipient: Recipient;
  globalAttachments: Attachment[];
}

export async function sendEmail({ campaign, recipient, globalAttachments }: SendEmailParams) {
  const graphClient = await createGraphClient(campaign.user_id);

  const subject = renderTemplate(campaign.subject_template, recipient.data);
  const body = renderTemplate(campaign.body_template, recipient.data);

  const message: any = {
    subject,
    body: { contentType: "HTML", content: body.replace(/\n/g, "<br>") },
    toRecipients: [{ emailAddress: { address: recipient.email } }],
  };

  if (campaign.global_cc) {
    message.ccRecipients = campaign.global_cc.split(",").map(e => ({
      emailAddress: { address: e.trim() },
    }));
  }

  if (campaign.global_bcc) {
    message.bccRecipients = campaign.global_bcc.split(",").map(e => ({
      emailAddress: { address: e.trim() },
    }));
  }

  const attachmentPromises: Promise<{ name: string; contentBytes: string; contentType: string }>[] = [];
  for (const a of globalAttachments) {
    attachmentPromises.push(downloadAttachment(a.file_path, a.original_name));
  }
  if (recipient.attachment_path) {
    attachmentPromises.push(downloadAttachment(recipient.attachment_path, "attachment"));
  }

  if (attachmentPromises.length > 0) {
    message.attachments = await Promise.all(attachmentPromises.map(async (p) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      ...await p,
    })));
  }

  await graphClient.api("/me/sendMail").post({ message, saveToSentItems: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/graph/client.ts src/lib/email/
git commit -m "feat: add Graph API client and email sending"
```

---

### Task 8: Send, retry, and batch-processing API

**Files:**
- Create: `mailcraft/src/app/api/campaigns/[id]/send/route.ts`
- Create: `mailcraft/src/app/api/campaigns/[id]/retry/route.ts`
- Create: `mailcraft/src/app/api/campaigns/[id]/process-batch/route.ts`

- [ ] **Step 1: Write send trigger route**

Write `mailcraft/src/app/api/campaigns/[id]/send/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: campaign } = await supabase.from("campaigns").select("user_id").eq("id", id).single();
  if (!campaign || campaign.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.from("campaigns").update({ status: "sending" }).eq("id", id);

  return NextResponse.json({ status: "sending" });
}
```

- [ ] **Step 2: Write retry route (reset failed recipients to pending)**

Write `mailcraft/src/app/api/campaigns/[id]/retry/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: campaign } = await supabase.from("campaigns").select("user_id").eq("id", id).single();
  if (!campaign || campaign.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.from("recipients").update({
    status: "pending",
    error_message: "",
    retry_count: 0,
  }).eq("campaign_id", id).eq("status", "failed");

  await supabase.from("campaigns").update({ status: "sending" }).eq("id", id);

  return NextResponse.json({ status: "sending" });
}
```

- [ ] **Step 3: Write batch processing route**

Write `mailcraft/src/app/api/campaigns/[id]/process-batch/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (!campaign || campaign.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status === "done") return NextResponse.json({ done: true });

  const { data: globalAttachments } = await supabase
    .from("attachments")
    .select("*")
    .eq("campaign_id", id)
    .eq("type", "global");

  const { data: pending } = await supabase
    .from("recipients")
    .select("*")
    .eq("campaign_id", id)
    .eq("status", "pending")
    .limit(campaign.rate_limit);

  if (!pending || pending.length === 0) {
    const { count } = await supabase
      .from("recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "failed");

    const newStatus = count && count > 0 ? "partial" : "done";
    await supabase.from("campaigns").update({ status: newStatus }).eq("id", id);
    return NextResponse.json({ done: true, status: newStatus });
  }

  const results = await Promise.allSettled(
    pending.map(async (recipient) => {
      try {
        await sendEmail({ campaign, recipient, globalAttachments: globalAttachments || [] });
        await supabase.from("recipients").update({
          status: "sent",
          sent_at: new Date().toISOString(),
        }).eq("id", recipient.id);
      } catch (err: any) {
        const retryCount = (recipient.retry_count || 0) + 1;
        const newStatus = retryCount >= 3 ? "failed" : "pending";
        await supabase.from("recipients").update({
          status: newStatus,
          error_message: err.message,
          retry_count: retryCount,
        }).eq("id", recipient.id);
      }
    })
  );

  const sent = results.filter(r => r.status === "fulfilled").length;
  return NextResponse.json({ processed: pending.length, sent });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/campaigns/[id]/send/route.ts src/app/api/campaigns/[id]/retry/route.ts src/app/api/campaigns/[id]/process-batch/route.ts
git commit -m "feat: add send, retry, and batch processing"
```

---

### Task 9: Root layout, login page, and auth guard

**Files:**
- Create: `mailcraft/src/app/layout.tsx`
- Create: `mailcraft/src/app/login/page.tsx`

- [ ] **Step 1: Write root layout**

Write `mailcraft/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mailcraft",
  description: "Personalized bulk email campaigns",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Write login page**

Write `mailcraft/src/app/login/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setError("Account created! Check your email to confirm, or try logging in again.");
      }
    } else {
      router.push("/");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 p-6">
        <h1 className="text-2xl font-bold text-center">Mailcraft</h1>
        <p className="text-sm text-muted-foreground text-center">Sign in to manage campaigns</p>
        <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Loading..." : "Sign In / Sign Up"}</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx src/app/login/page.tsx
git commit -m "feat: add root layout and login page"
```

---

### Task 10: Dashboard page

**Files:**
- Create: `mailcraft/src/app/page.tsx`
- Create: `mailcraft/src/components/campaign-card.tsx`

- [ ] **Step 1: Write campaign card component**

Write `mailcraft/src/components/campaign-card.tsx`:
```tsx
"use client";

import { Campaign } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500",
  sending: "bg-blue-500 animate-pulse",
  done: "bg-green-500",
  partial: "bg-yellow-500",
};

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{campaign.name}</CardTitle>
          <Badge className={statusColors[campaign.status]}>{campaign.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Created: {new Date(campaign.created_at).toLocaleDateString()}
        </p>
        <p className="text-sm text-muted-foreground">
          Subject: {campaign.subject_template}
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write dashboard page**

Write `mailcraft/src/app/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Campaign } from "@/types";
import { CampaignCard } from "@/components/campaign-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session) router.push("/login");
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    fetch("/api/campaigns").then(r => r.json()).then(setCampaigns);
  }, [session]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!session) return null;

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Mailcraft</h1>
        <Button onClick={() => router.push("/campaign/new")}>
          New Campaign
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map(c => (
          <div key={c.id} onClick={() => router.push(`/campaign/${c.id}`)}>
            <CampaignCard campaign={c} />
          </div>
        ))}
      </div>
      {campaigns.length === 0 && (
        <p className="text-center text-muted-foreground mt-12">
          No campaigns yet. Create your first one!
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx src/components/campaign-card.tsx
git commit -m "feat: add dashboard page"
```

---

### Task 11: Campaign wizard (multi-step setup)

**Files:**
- Create: `mailcraft/src/components/campaign-wizard/wizard.tsx`
- Create: `mailcraft/src/components/campaign-wizard/step-setup.tsx`
- Create: `mailcraft/src/components/campaign-wizard/step-template.tsx`
- Create: `mailcraft/src/components/campaign-wizard/step-attachments.tsx`
- Create: `mailcraft/src/components/campaign-wizard/step-recipients.tsx`
- Create: `mailcraft/src/components/campaign-wizard/step-send-config.tsx`
- Create: `mailcraft/src/components/campaign-wizard/step-review.tsx`
- Create: `mailcraft/src/app/campaign/new/page.tsx`

- [ ] **Step 1: Write wizard container**

Write `mailcraft/src/components/campaign-wizard/wizard.tsx`:
```tsx
"use client";

import { useState, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface WizardStep {
  title: string;
  component: ReactNode;
}

const STORAGE_KEY = "mailcraft-wizard-data";

function loadSavedData(): any {
  if (typeof window === "undefined") return {};
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

export function Wizard({ steps, onComplete }: { steps: WizardStep[]; onComplete: (data: any) => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<any>(loadSavedData);

  const updateData = (partial: any) => {
    setData((prev: any) => {
      const next = { ...prev, ...partial };
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const next = () => {
    if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1);
    else onComplete(data);
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <p className="text-xs text-muted-foreground mb-2 text-center">Progress is saved in this browser tab</p>
      <div className="flex mb-8">
        {steps.map((s, i) => (
          <div key={i} className={`flex-1 text-center pb-2 border-b-2 ${i <= currentStep ? "border-primary text-primary" : "border-muted text-muted-foreground"}`}>
            {s.title}
          </div>
        ))}
      </div>
      <div className="mb-6">
        {React.cloneElement(steps[currentStep].component as React.ReactElement, { data, updateData })}
      </div>
      <div className="flex justify-between">
        <Button variant="outline" onClick={prev} disabled={currentStep === 0}>Back</Button>
        <Button onClick={next}>{currentStep < steps.length - 1 ? "Next" : "Review & Send"}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write step-setup (name + CSV upload)**

Write `mailcraft/src/components/campaign-wizard/step-setup.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseCSV } from "@/lib/utils";

export function StepSetup({ data, updateData }: { data: any; updateData: (d: any) => void }) {
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    updateData({ csvHeaders: parsed.headers, csvRows: parsed.rows, csvFileName: file.name });
    setCsvPreview([parsed.headers, ...parsed.rows.slice(0, 3).map(r => parsed.headers.map(h => r[h]))]);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Campaign Name</label>
        <Input value={data.name || ""} onChange={e => updateData({ name: e.target.value })} placeholder="Welcome Campaign Q3" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Upload CSV</label>
        <Input type="file" accept=".csv" onChange={handleFile} />
      </div>
      {csvPreview.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-2">Preview ({data.csvRows?.length} rows):</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {csvPreview[0].map((h, i) => <th key={i} className="border p-1 text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {csvPreview.slice(1).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => <td key={j} className="border p-1">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write step-template (subject + body with placeholder autocomplete)**

Write `mailcraft/src/components/campaign-wizard/step-template.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { renderTemplate } from "@/lib/utils";

export function StepTemplate({ data, updateData }: { data: any; updateData: (d: any) => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const sampleData = data.csvHeaders?.reduce((acc: any, h: string) => {
    acc[h] = data.csvRows?.[0]?.[h] || `{{${h}}}`;
    return acc;
  }, {}) || {};

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Subject Line</label>
        <Input value={data.subject_template || ""} onChange={e => updateData({ subject_template: e.target.value })} placeholder="Hello {{first_name}}, welcome!" />
        <p className="text-xs text-muted-foreground mt-1">Use {'{{column_name}}'} placeholders from CSV</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Available Columns</label>
        <div className="flex flex-wrap gap-1">
          {data.csvHeaders?.map((h: string) => (
            <code key={h} className="px-2 py-1 bg-muted rounded text-xs cursor-pointer" onClick={() => {
              const ta = document.getElementById("body-template") as HTMLTextAreaElement;
              if (ta) {
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const text = ta.value;
                const newText = text.slice(0, start) + `{{${h}}}` + text.slice(end);
                updateData({ body_template: newText });
                setTimeout(() => ta.focus(), 0);
              }
            }}>
              {'{{' + h + '}}'}
            </code>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Email Body</label>
        <Textarea id="body-template" value={data.body_template || ""} onChange={e => updateData({ body_template: e.target.value })} rows={10} placeholder="Hi {{first_name}},&#10;&#10;We have a special offer for you..." />
      </div>
      <div className="flex items-center gap-2">
        <button className="text-sm underline" onClick={() => setShowPreview(!showPreview)}>
          {showPreview ? "Hide" : "Show"} Preview
        </button>
      </div>
      {showPreview && (
        <div className="border rounded p-4 bg-muted/30">
          <p className="font-semibold">{renderTemplate(data.subject_template || "", sampleData)}</p>
          <div className="mt-2" dangerouslySetInnerHTML={{ __html: renderTemplate(data.body_template || "", sampleData).replace(/\n/g, "<br>") }} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write step-attachments**

Write `mailcraft/src/components/campaign-wizard/step-attachments.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function StepAttachments({ data, updateData }: { data: any; updateData: (d: any) => void }) {
  const [uploading, setUploading] = useState(false);
  const [globalFiles, setGlobalFiles] = useState<{ name: string; path: string }[]>(data.globalAttachments || []);

  const uploadFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const result = await res.json();
    const newFiles = [...globalFiles, { name: result.originalName, path: result.url }];
    setGlobalFiles(newFiles);
    updateData({ globalAttachments: newFiles });
    setUploading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Global Attachments (sent to everyone)</label>
        <Input type="file" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} disabled={uploading} />
        <ul className="mt-2 space-y-1">
          {globalFiles.map((f, i) => (
            <li key={i} className="text-sm text-muted-foreground">{f.name}</li>
          ))}
        </ul>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Per-Recipient Attachment Column</label>
        <select className="w-full p-2 border rounded" value={data.attachmentColumn || ""} onChange={e => updateData({ attachmentColumn: e.target.value })}>
          <option value="">None</option>
          {data.csvHeaders?.map((h: string) => <option key={h} value={h}>{h}</option>)}
        </select>
        <p className="text-xs text-muted-foreground mt-1">If a CSV column contains URLs or file paths to attach per recipient</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write step-recipients**

Write `mailcraft/src/components/campaign-wizard/step-recipients.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

export function StepRecipients({ data, updateData }: { data: any; updateData: (d: any) => void }) {
  const [search, setSearch] = useState("");
  const filtered = (data.csvRows || []).filter((r: any) =>
    r.email?.toLowerCase().includes(search.toLowerCase()) ||
    Object.values(r).some(v => v?.toString().toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {data.csvRows?.length || 0} recipients loaded. Review below.
      </p>
      <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
      <div className="max-h-96 overflow-y-auto border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              {data.csvHeaders?.map((h: string) => <th key={h} className="p-2 text-left">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row: any, i: number) => (
              <tr key={i} className="border-t">
                {data.csvHeaders?.map((h: string) => <td key={h} className="p-2">{row[h]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write step-send-config**

Write `mailcraft/src/components/campaign-wizard/step-send-config.tsx`:
```tsx
"use client";

import { Input } from "@/components/ui/input";

export function StepSendConfig({ data, updateData }: { data: any; updateData: (d: any) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Global BCC</label>
        <Input value={data.global_bcc || ""} onChange={e => updateData({ global_bcc: e.target.value })} placeholder="bcc1@example.com, bcc2@example.com" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Global CC</label>
        <Input value={data.global_cc || ""} onChange={e => updateData({ global_cc: e.target.value })} placeholder="cc1@example.com, cc2@example.com" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Rate Limit (emails per minute)</label>
        <Input type="number" value={data.rate_limit || 10} onChange={e => updateData({ rate_limit: parseInt(e.target.value) || 10 })} min={1} max={100} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write step-review**

Write `mailcraft/src/components/campaign-wizard/step-review.tsx`:
```tsx
"use client";

export function StepReview({ data }: { data: any; updateData: (d: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="border rounded p-4">
        <h3 className="font-semibold text-lg">{data.name}</h3>
        <p className="text-sm mt-2"><strong>Subject:</strong> {data.subject_template}</p>
        <p className="text-sm mt-1"><strong>Recipients:</strong> {data.csvRows?.length || 0}</p>
        <p className="text-sm"><strong>BCC:</strong> {data.global_bcc || "None"}</p>
        <p className="text-sm"><strong>CC:</strong> {data.global_cc || "None"}</p>
        <p className="text-sm"><strong>Rate Limit:</strong> {data.rate_limit || 10} emails/min</p>
        <p className="text-sm"><strong>Global Attachments:</strong> {data.globalAttachments?.length || 0} files</p>
        <p className="text-sm"><strong>Per-Recipient Attachment Column:</strong> {data.attachmentColumn || "None"}</p>
      </div>
      <div className="border rounded p-4">
        <h4 className="font-medium mb-2">Email Preview (first recipient)</h4>
        {data.csvRows?.[0] && (
          <div>
            <p><strong>To:</strong> {data.csvRows[0].email}</p>
            <p><strong>Body:</strong></p>
            <div className="bg-muted p-3 rounded mt-1 text-sm whitespace-pre-wrap">
              {data.body_template}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Write campaign new page**

Write `mailcraft/src/app/campaign/new/page.tsx`:
```tsx
"use client";

import { Wizard } from "@/components/campaign-wizard/wizard";
import { StepSetup } from "@/components/campaign-wizard/step-setup";
import { StepTemplate } from "@/components/campaign-wizard/step-template";
import { StepAttachments } from "@/components/campaign-wizard/step-attachments";
import { StepRecipients } from "@/components/campaign-wizard/step-recipients";
import { StepSendConfig } from "@/components/campaign-wizard/step-send-config";
import { StepReview } from "@/components/campaign-wizard/step-review";
import { useRouter } from "next/navigation";

export default function NewCampaign() {
  const router = useRouter();

  const handleComplete = async (data: any) => {
    const campRes = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        subject_template: data.subject_template,
        body_template: data.body_template,
        global_bcc: data.global_bcc,
        global_cc: data.global_cc,
        rate_limit: data.rate_limit,
      }),
    });
    const campaign = await campRes.json();

    // Import recipients (set per-recipient attachment_path from CSV column if configured)
    const attachmentCol = data.attachmentColumn;
    const recipients = data.csvRows.map((row: any) => ({
      email: row.email,
      data: row,
      attachment_path: attachmentCol ? (row[attachmentCol] || "") : "",
    }));
    await fetch(`/api/campaigns/${campaign.id}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients }),
    });

    // Save global attachments
    if (data.globalAttachments?.length > 0) {
      await fetch(`/api/campaigns/${campaign.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachments: data.globalAttachments.map((att: any) => ({
            file_path: att.path,
            original_name: att.name,
            type: "global",
          })),
        }),
      });
    }

    sessionStorage.removeItem("mailcraft-wizard-data");
    router.push(`/campaign/${campaign.id}`);
  };

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold text-center mb-6">New Campaign</h1>
      <Wizard
        steps={[
          { title: "Setup", component: <StepSetup /> },
          { title: "Template", component: <StepTemplate /> },
          { title: "Attachments", component: <StepAttachments /> },
          { title: "Recipients", component: <StepRecipients /> },
          { title: "Send Config", component: <StepSendConfig /> },
          { title: "Review", component: <StepReview /> },
        ]}
        onComplete={handleComplete}
      />
    </div>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git add src/components/campaign-wizard/ src/app/campaign/new/page.tsx
git commit -m "feat: add campaign creation wizard"
```

---

### Task 12: Campaign detail page with real-time progress

**Files:**
- Create: `mailcraft/src/app/campaign/[id]/page.tsx`
- Create: `mailcraft/src/components/recipient-table.tsx`
- Create: `mailcraft/src/components/progress-bar.tsx`

- [ ] **Step 1: Write progress bar component**

Write `mailcraft/src/components/progress-bar.tsx`:
```tsx
"use client";

export function ProgressBar({ sent, total }: { sent: number; total: number }) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{sent} of {total} sent</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-3">
        <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write recipient table component**

Write `mailcraft/src/components/recipient-table.tsx`:
```tsx
"use client";

import { Recipient } from "@/types";

const statusColors: Record<string, string> = {
  pending: "text-yellow-600",
  sent: "text-green-600",
  failed: "text-red-600",
};

export function RecipientTable({ recipients }: { recipients: Recipient[] }) {
  return (
    <div className="max-h-96 overflow-y-auto border rounded">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted">
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Sent At</th>
            <th className="p-2 text-left">Error</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.email}</td>
              <td className={`p-2 font-medium ${statusColors[r.status]}`}>{r.status}</td>
              <td className="p-2">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "-"}</td>
              <td className="p-2 text-red-600 text-xs">{r.error_message || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Write campaign detail page**

Write `mailcraft/src/app/campaign/[id]/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Campaign, Recipient } from "@/types";
import { ProgressBar } from "@/components/progress-bar";
import { RecipientTable } from "@/components/recipient-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const supabase = createClient();

  useEffect(() => {
    fetch(`/api/campaigns/${id}`).then(r => r.json()).then(setCampaign);
    fetch(`/api/campaigns/${id}/recipients`).then(r => r.json()).then(setRecipients);
  }, [id]);

  useEffect(() => {
    const channel = supabase
      .channel(`campaign-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recipients", filter: `campaign_id=eq.${id}` }, (payload) => {
        setRecipients(prev => prev.map(r => r.id === payload.new.id ? payload.new as Recipient : r));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleSend = async () => {
    await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
    setCampaign(prev => prev ? { ...prev, status: "sending" } : prev);
  };

  const handleRetry = async () => {
    await fetch(`/api/campaigns/${id}/retry`, { method: "POST" });
  };

  if (!campaign) return <div className="p-8 text-center">Loading...</div>;

  const total = recipients.length;
  const sent = recipients.filter(r => r.status === "sent").length;

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{campaign.name}</h1>
          <Badge>{campaign.status}</Badge>
        </div>
        <div className="flex gap-2">
          {campaign.status === "draft" && <Button onClick={handleSend}>Send Now</Button>}
          {campaign.status === "partial" && <Button variant="outline" onClick={handleRetry}>Retry Failed</Button>}
        </div>
      </div>

      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Subject: {campaign.subject_template}</p>
        <ProgressBar sent={sent} total={total} />
      </div>

      <RecipientTable recipients={recipients} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/campaign/[id]/page.tsx src/components/recipient-table.tsx src/components/progress-bar.tsx
git commit -m "feat: add campaign detail with real-time progress"
```

---

### Task 13: Settings page (Microsoft OAuth)

**Files:**
- Create: `mailcraft/src/app/settings/page.tsx`

- [ ] **Step 1: Write settings page**

Write `mailcraft/src/app/settings/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Settings() {
  const [connected, setConnected] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const supabase = createClient();

  useEffect(() => {
    supabase.from("microsoft_tokens").select("*").limit(1).then(({ data }) => {
      setConnected(data && data.length > 0);
    });
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || "");
    });
  }, []);

  const handleConnect = () => {
    window.location.href = "/api/auth/microsoft";
  };

  const handleDisconnect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("microsoft_tokens").delete().eq("user_id", user.id);
    setConnected(false);
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Microsoft Outlook</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {connected ? `Connected as ${userEmail}` : "Not connected"}
          </p>
          {connected ? (
            <Button variant="destructive" onClick={handleDisconnect}>Disconnect</Button>
          ) : (
            <Button onClick={handleConnect}>Connect Outlook</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: add settings page with Microsoft OAuth connect"
```

---

### Task 14: PWA service worker setup

**Files:**
- Create: `mailcraft/src/sw.ts`
- Create: `mailcraft/public/icon-192.png` (placeholder)
- Create: `mailcraft/public/icon-512.png` (placeholder)

- [ ] **Step 1: Write service worker source**

Write `mailcraft/src/sw.ts`:
```ts
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

- [ ] **Step 2: Create placeholder icons**

Run in `mailcraft/`:
```bash
mkdir -p public
# Create minimal 1x1 PNG placeholders — in production, replace with real icons
python3 -c "
import struct, zlib
def make_png(w, h):
    raw = b''
    for y in range(h):
        raw += b'\x00' + bytes([255, 0, 0, 255]) * w
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
with open('public/icon-192.png', 'wb') as f: f.write(make_png(192, 192))
with open('public/icon-512.png', 'wb') as f: f.write(make_png(512, 512))
"
```

- [ ] **Step 3: Commit**

```bash
git add src/sw.ts public/icon-192.png public/icon-512.png
git commit -m "feat: add PWA service worker"
```
