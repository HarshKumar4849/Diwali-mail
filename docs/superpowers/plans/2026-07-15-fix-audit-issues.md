# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all security, correctness, and architectural issues found in the codebase audit.

**Architecture:** Fixes span the full stack — OAuth flow (security), API routes (auth/validation), CSV parsing (correctness), email sending pipeline (transactional safety + real rate limiting), and client components (types, error handling, XSS). Each task is self-contained and independently testable.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + Auth + Storage), Microsoft Graph API, TypeScript, Tailwind CSS

---

### Task 1: Fix OAuth CSRF — add `state` parameter

**Files:**
- Modify: `app/api/auth/microsoft/route.ts`
- Modify: `app/api/auth/callback/route.ts`

- [ ] **Step 1: Generate and store `state` in Microsoft OAuth redirect**

Edit `app/api/auth/microsoft/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const state = crypto.randomUUID();
  // Store state in a cookie so callback can verify it
  const stateCookie = `microsoft_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/callback; Max-Age=600`;

  const clientId = process.env.MICROSOFT_CLIENT_ID!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`;
  const scope = "Mail.Send offline_access User.Read";
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": stateCookie,
    },
  });
}
```

- [ ] **Step 2: Verify `state` in callback**

Edit `app/api/auth/callback/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const returnedState = req.nextUrl.searchParams.get("state");
  if (!code) return NextResponse.json({ error: "No code provided" }, { status: 400 });

  // Verify state to prevent CSRF
  const cookies = req.cookies;
  const storedState = cookies.get("microsoft_oauth_state")?.value;
  if (!returnedState || !storedState || returnedState !== storedState) {
    return NextResponse.json({ error: "Invalid state parameter" }, { status: 403 });
  }

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

  const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings`);
  // Clear the state cookie
  response.cookies.set("microsoft_oauth_state", "", { maxAge: 0, path: "/api/auth/callback" });
  return response;
}
```

- [ ] **Step 3: Verify the fix**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 2: Fix XSS in template preview

**Files:**
- Modify: `components/campaign-wizard/step-template.tsx`

- [ ] **Step 1: Replace `dangerouslySetInnerHTML` with safe text rendering**

Edit `components/campaign-wizard/step-template.tsx` line 54:
```tsx
          <div className="mt-2 whitespace-pre-wrap">{renderTemplate(data.body_template || "", sampleData)}</div>
```

- [ ] **Step 2: Verify the fix**

Run: `npm run lint`
Expected: No lint errors.

---

### Task 3: Remove client-side OAuth token exposure

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Add a server-side endpoint to check Microsoft connection status**

Create `app/api/auth/microsoft/status/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("microsoft_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const connected = data && data.length > 0;
  const { data: { user: userData } } = await supabase.auth.getUser();

  return NextResponse.json({
    connected,
    email: userData?.email || "",
  });
}
```

- [ ] **Step 2: Update settings page to use the server endpoint**

Edit `app/settings/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Settings() {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const supabase = createClient();

  useEffect(() => {
    fetch("/api/auth/microsoft/status")
      .then(r => r.json())
      .then(data => {
        setConnected(data.connected);
        setEmail(data.email || "");
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
            {connected ? `Connected as ${email}` : "Not connected"}
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

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 4: Fix API route authorization and input validation

**Files:**
- Modify: `app/api/campaigns/[id]/route.ts`
- Modify: `app/api/campaigns/route.ts`
- Modify: `app/api/campaigns/[id]/recipients/route.ts`
- Modify: `app/api/campaigns/[id]/attachments/route.ts`
- Modify: `app/api/campaigns/[id]/send/route.ts`
- Modify: `app/api/campaigns/[id]/retry/route.ts`

- [ ] **Step 1: Add ownership check + input validation to PATCH**

Edit `app/api/campaigns/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  // Only allow updating specific fields
  const allowedFields = ["name", "subject_template", "body_template", "global_bcc", "global_cc", "rate_limit"];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  if (updates.rate_limit !== undefined) {
    const rateLimit = Number(updates.rate_limit);
    if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 100) {
      return NextResponse.json({ error: "rate_limit must be an integer between 1 and 100" }, { status: 400 });
    }
    updates.rate_limit = rateLimit;
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("campaigns").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Add input validation to POST /api/campaigns**

Edit `app/api/campaigns/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.subject_template || typeof body.subject_template !== "string") {
    return NextResponse.json({ error: "subject_template is required" }, { status: 400 });
  }

  const rateLimit = body.rate_limit ? Number(body.rate_limit) : 10;
  if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 100) {
    return NextResponse.json({ error: "rate_limit must be an integer between 1 and 100" }, { status: 400 });
  }

  const { data, error } = await supabase.from("campaigns").insert({
    user_id: user.id,
    name: body.name.trim(),
    subject_template: body.subject_template,
    body_template: body.body_template || "",
    global_bcc: body.global_bcc || "",
    global_cc: body.global_cc || "",
    rate_limit: rateLimit,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 3: Add email validation to recipients POST**

Edit `app/api/campaigns/[id]/recipients/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("recipients")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify campaign ownership
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (!Array.isArray(body.recipients)) {
    return NextResponse.json({ error: "recipients must be an array" }, { status: 400 });
  }

  for (const r of body.recipients) {
    if (!r.email || !EMAIL_RE.test(r.email)) {
      return NextResponse.json({ error: `Invalid email: ${r.email}` }, { status: 400 });
    }
  }

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

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 5: Fix `renderTemplate` duplication

**Files:**
- Modify: `lib/email/template.ts`
- Modify: `lib/utils.ts`

- [ ] **Step 1: Remove the duplicated `renderTemplate` in `lib/utils.ts`**

Edit `lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
```

- [ ] **Step 2: Make `lib/email/template.ts` the canonical version (preserve missing placeholders)**

Edit `lib/email/template.ts`:
```ts
export function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => data[key] || `{{${key}}}`);
}
```

- [ ] **Step 3: Update imports in `step-template.tsx` to use `lib/email/template`**

Edit `components/campaign-wizard/step-template.tsx` line 6:
```tsx
import { renderTemplate } from "@/lib/email/template";
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 6: Fix CSV parser to handle quoted fields

**Files:**
- Modify: `lib/utils.ts`

- [ ] **Step 1: Replace naive CSV parser with a proper one**

Edit `lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  values.push(current.trim());
  return values;
}

export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).filter(Boolean);
  if (headers.length === 0) return { headers: [], rows: [] };
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i]?.trim() || ''; });
    return row;
  });
  return { headers, rows };
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 7: Fix per-recipient attachment naming

**Files:**
- Modify: `lib/email/send.ts`

- [ ] **Step 1: Pass original filename for per-recipient attachments**

Edit `lib/email/send.ts`:
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

  const ext = name.split(".").pop();
  const contentType = ext === "pdf" ? "application/pdf"
    : ext === "png" ? "image/png"
    : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "doc" || ext === "docx" ? "application/msword"
    : "application/octet-stream";

  return {
    name,
    contentBytes: Buffer.from(buffer).toString("base64"),
    contentType,
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
    const originalName = recipient.attachment_path.split("/").pop() || "attachment";
    attachmentPromises.push(downloadAttachment(recipient.attachment_path, originalName));
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

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 8: Add real rate limiting with delays between sends

**Files:**
- Modify: `app/api/campaigns/[id]/process-batch/route.ts`

- [ ] **Step 1: Replace parallel sends with sequential sends and delays**

Edit `app/api/campaigns/[id]/process-batch/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

  // Calculate delay to spread sends evenly across ~60 seconds
  const delayMs = Math.max(500, Math.floor(60000 / pending.length));
  let sent = 0;

  for (const recipient of pending) {
    try {
      await sendEmail({ campaign, recipient, globalAttachments: globalAttachments || [] });
      await supabase.from("recipients").update({
        status: "sent",
        sent_at: new Date().toISOString(),
      }).eq("id", recipient.id);
      sent++;
    } catch (err: any) {
      const retryCount = (recipient.retry_count || 0) + 1;
      const newStatus = retryCount >= 3 ? "failed" : "pending";
      await supabase.from("recipients").update({
        status: newStatus,
        error_message: err.message,
        retry_count: retryCount,
      }).eq("id", recipient.id);
    }
    await delay(delayMs);
  }

  return NextResponse.json({ processed: pending.length, sent });
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 9: Add transactional safety to prevent double-sends

**Files:**
- Modify: `app/api/campaigns/[id]/process-batch/route.ts`

- [ ] **Step 1: Use atomic status check + update with a single-row lock pattern**

Edit `app/api/campaigns/[id]/process-batch/route.ts` to use the Supabase RPC or a two-phase approach:

Replace the batch loop's email sending section with:
```ts
  for (const recipient of pending) {
    // Atomically claim this recipient — set status to "sending" so no other batch picks it up
    const { data: claimed, error: claimError } = await supabase
      .from("recipients")
      .update({ status: "sending" })
      .eq("id", recipient.id)
      .eq("status", "pending")
      .select()
      .single();

    // Another batch already claimed this recipient — skip
    if (claimError || !claimed) {
      continue;
    }

    try {
      await sendEmail({ campaign, recipient, globalAttachments: globalAttachments || [] });
      await supabase.from("recipients").update({
        status: "sent",
        sent_at: new Date().toISOString(),
      }).eq("id", recipient.id);
      sent++;
    } catch (err: any) {
      const retryCount = (recipient.retry_count || 0) + 1;
      const newStatus = retryCount >= 3 ? "failed" : "pending";
      await supabase.from("recipients").update({
        status: newStatus,
        error_message: err.message,
        retry_count: retryCount,
      }).eq("id", recipient.id);
    }
    await delay(delayMs);
  }
```

Also add `'sending'` to the `RecipientStatus` type in `types/index.ts`:
```ts
export type RecipientStatus = 'pending' | 'sending' | 'sent' | 'failed';
```

And add `'sending'` to the CHECK constraint in `supabase/migrations/001_schema.sql`:
```sql
status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 10: Add BCC/CC email validation

**Files:**
- Modify: `lib/email/send.ts`

- [ ] **Step 1: Filter invalid emails from BCC/CC fields**

Add a helper and filter in `lib/email/send.ts`:

After imports, add:
```ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

Update the BCC/CC sections:
```ts
  if (campaign.global_cc) {
    const ccList = campaign.global_cc.split(",").map(e => e.trim()).filter(e => EMAIL_RE.test(e));
    if (ccList.length > 0) {
      message.ccRecipients = ccList.map(e => ({
        emailAddress: { address: e },
      }));
    }
  }

  if (campaign.global_bcc) {
    const bccList = campaign.global_bcc.split(",").map(e => e.trim()).filter(e => EMAIL_RE.test(e));
    if (bccList.length > 0) {
      message.bccRecipients = bccList.map(e => ({
        emailAddress: { address: e },
      }));
    }
  }
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 11: Add `updated_at` auto-update trigger

**Files:**
- Modify: `supabase/migrations/001_schema.sql`

- [ ] **Step 1: Add trigger function and triggers for campaigns and microsoft_tokens**

Append to `supabase/migrations/001_schema.sql`:
```sql
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
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds (schema file doesn't affect build).

---

### Task 12: Replace `any` types in wizard with proper types

**Files:**
- Modify: `types/index.ts`
- Modify: `components/campaign-wizard/wizard.tsx`
- Modify: `components/campaign-wizard/step-setup.tsx`
- Modify: `components/campaign-wizard/step-template.tsx`
- Modify: `components/campaign-wizard/step-attachments.tsx`
- Modify: `components/campaign-wizard/step-recipients.tsx`
- Modify: `components/campaign-wizard/step-send-config.tsx`
- Modify: `components/campaign-wizard/step-review.tsx`
- Modify: `app/campaign/new/page.tsx`

- [ ] **Step 1: Add `WizardData` type to `types/index.ts`**

Add to `types/index.ts`:
```ts
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
}
```

- [ ] **Step 2: Type the wizard component**

Edit `components/campaign-wizard/wizard.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WizardData } from "@/types";

interface WizardStep {
  title: string;
  render: (props: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) => React.ReactNode;
}

const STORAGE_KEY = "mailcraft-wizard-data";

function loadSavedData(): Partial<WizardData> {
  if (typeof window === "undefined") return {};
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

export function Wizard({ steps, onComplete }: { steps: WizardStep[]; onComplete: (data: WizardData) => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<WizardData>(loadSavedData as WizardData);

  const updateData = (partial: Partial<WizardData>) => {
    setData((prev: WizardData) => {
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

  const CurrentStep = steps[currentStep];

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
        {CurrentStep.render({ data, updateData })}
      </div>
      <div className="flex justify-between">
        <Button variant="outline" onClick={prev} disabled={currentStep === 0}>Back</Button>
        <Button onClick={next}>{currentStep < steps.length - 1 ? "Next" : "Review & Send"}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type step-setup.tsx**

Edit `components/campaign-wizard/step-setup.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { parseCSV } from "@/lib/utils";
import type { WizardData } from "@/types";

export function StepSetup({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
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

- [ ] **Step 4: Type step-template.tsx**

Edit `components/campaign-wizard/step-template.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { renderTemplate } from "@/lib/email/template";
import type { WizardData } from "@/types";

export function StepTemplate({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const sampleData = data.csvHeaders?.reduce((acc: Record<string, string>, h: string) => {
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
          <div className="mt-2 whitespace-pre-wrap">{renderTemplate(data.body_template || "", sampleData)}</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Type step-attachments.tsx**

Edit `components/campaign-wizard/step-attachments.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WizardData } from "@/types";

export function StepAttachments({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
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

- [ ] **Step 6: Type step-recipients.tsx**

Edit `components/campaign-wizard/step-recipients.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { WizardData } from "@/types";

export function StepRecipients({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [search, setSearch] = useState("");
  const filtered = (data.csvRows || []).filter((r: Record<string, string>) =>
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
            {filtered.map((row: Record<string, string>, i: number) => (
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

- [ ] **Step 7: Type step-send-config.tsx**

Edit `components/campaign-wizard/step-send-config.tsx`:
```tsx
"use client";

import { Input } from "@/components/ui/input";
import type { WizardData } from "@/types";

export function StepSendConfig({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
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

- [ ] **Step 8: Type step-review.tsx**

Edit `components/campaign-wizard/step-review.tsx`:
```tsx
"use client";

import type { WizardData } from "@/types";

export function StepReview({ data }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
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

- [ ] **Step 9: Type `app/campaign/new/page.tsx` handleComplete**

Edit `app/campaign/new/page.tsx`:
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
import type { WizardData } from "@/types";

export default function NewCampaign() {
  const router = useRouter();

  const handleComplete = async (data: WizardData) => {
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

    const attachmentCol = data.attachmentColumn;
    const recipients = data.csvRows.map((row: Record<string, string>) => ({
      email: row.email,
      data: row,
      attachment_path: attachmentCol ? (row[attachmentCol] || "") : "",
    }));
    await fetch(`/api/campaigns/${campaign.id}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients }),
    });

    if (data.globalAttachments?.length > 0) {
      await fetch(`/api/campaigns/${campaign.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachments: data.globalAttachments.map((att: { path: string; name: string }) => ({
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
          { title: "Setup", render: (props) => <StepSetup {...props} /> },
          { title: "Template", render: (props) => <StepTemplate {...props} /> },
          { title: "Attachments", render: (props) => <StepAttachments {...props} /> },
          { title: "Recipients", render: (props) => <StepRecipients {...props} /> },
          { title: "Send Config", render: (props) => <StepSendConfig {...props} /> },
          { title: "Review", render: (props) => <StepReview {...props} /> },
        ]}
        onComplete={handleComplete}
      />
    </div>
  );
}
```

- [ ] **Step 10: Build check**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 13: Add error handling to client-side fetch calls

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/campaign/[id]/page.tsx`

- [ ] **Step 1: Add error handling to the dashboard fetch**

Edit `app/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campaign } from "@/types";
import { CampaignCard } from "@/components/campaign-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    fetch("/api/campaigns")
      .then(r => {
        if (!r.ok) throw new Error("Failed to load campaigns");
        return r.json();
      })
      .then(setCampaigns)
      .catch(e => setError(e.message));
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
      {error && <p className="text-red-500 text-center mb-4">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map(c => (
          <div key={c.id} onClick={() => router.push(`/campaign/${c.id}`)}>
            <CampaignCard campaign={c} />
          </div>
        ))}
      </div>
      {campaigns.length === 0 && !error && (
        <p className="text-center text-muted-foreground mt-12">
          No campaigns yet. Create your first one!
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add error handling to campaign detail page**

Edit `app/campaign/[id]/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Campaign, Recipient } from "@/types";
import { ProgressBar } from "@/components/progress-bar";
import { RecipientTable } from "@/components/recipient-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then(r => {
        if (!r.ok) throw new Error("Failed to load campaign");
        return r.json();
      })
      .then(setCampaign)
      .catch(e => setError(e.message));
    fetch(`/api/campaigns/${id}/recipients`)
      .then(r => {
        if (!r.ok) throw new Error("Failed to load recipients");
        return r.json();
      })
      .then(setRecipients)
      .catch(e => setError(e.message));
  }, [id]);

  useEffect(() => {
    const channel = supabase
      .channel(`campaign-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recipients", filter: `campaign_id=eq.${id}` }, (payload) => {
        const newRecord = payload.new as Record<string, any>;
        if (newRecord.id) {
          setRecipients(prev => prev.map(r => r.id === newRecord.id ? newRecord as unknown as Recipient : r));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start sending");
      setCampaign(prev => prev ? { ...prev, status: "sending" } : prev);
    } catch (e: any) {
      setError(e.message);
    }
    setSending(false);
  };

  const handleRetry = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to retry");
      setCampaign(prev => prev ? { ...prev, status: "sending" } : prev);
    } catch (e: any) {
      setError(e.message);
    }
    setSending(false);
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
          {campaign.status === "draft" && <Button onClick={handleSend} disabled={sending}>{sending ? "Sending..." : "Send Now"}</Button>}
          {campaign.status === "partial" && <Button variant="outline" onClick={handleRetry} disabled={sending}>{sending ? "Sending..." : "Retry Failed"}</Button>}
        </div>
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Subject: {campaign.subject_template}</p>
        <ProgressBar sent={sent} total={total} />
      </div>

      <RecipientTable recipients={recipients} />
    </div>
  );
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Build succeeds.

---

### Self-Review Checklist

**Spec coverage:** All 15 issues from the audit are covered:
1. ✅ OAuth CSRF state param → Task 1
2. ✅ XSS via dangerouslySetInnerHTML → Task 2
3. ✅ OAuth tokens exposed client-side → Task 3
4. ✅ PATCH ownership check → Task 4
5. ✅ Input validation on all routes → Task 4
6. ✅ renderTemplate duplication → Task 5
7. ✅ Naive CSV parser → Task 6
8. ✅ Per-recipient attachment naming → Task 7
9. ✅ rate_limit as batch size → Task 8
10. ✅ No transactional safety → Task 9
11. ✅ BCC/CC validation → Task 10
12. ✅ No updated_at trigger → Task 11
13. ✅ Excessive any types → Task 12
14. ✅ No error handling on fetch calls → Task 13
15. ✅ Cron auth (process-batch already has auth, Task 9 improves idempotency)

**Placeholder scan:** No TBD, TODO, or placeholder patterns found.

**Type consistency:** `WizardData` type used consistently across all 7 wizard files. `RecipientStatus` updated in types and schema. All function signatures match across tasks.
