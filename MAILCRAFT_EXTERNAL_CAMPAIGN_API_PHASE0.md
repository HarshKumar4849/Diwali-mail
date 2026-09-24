# Mailcraft External Campaign API — Phase 0: Deep Technical Analysis

**Document Status**: Phase 0 — Analysis Only (No Implementation)  
**Target Consumer**: LeadForge (External Lead Generation / Sales Automation System)  
**System Target**: Mailcraft Cold Email & Bulk Outreach Engine  

---

## 1. Executive Summary & Purpose

The objective of this analysis is to evaluate how an external system, **LeadForge**, can submit an array of personalized emails to **Mailcraft** via a REST API to automatically create a campaign, enqueue the recipients, and trigger Mailcraft's existing campaign processor and Microsoft Graph email dispatcher — **without altering or disrupting any existing Mailcraft features, database tables, or sending workflows**.

### High-Level Target Architecture

```
LeadForge Application
        │
        │ HTTP POST /api/v1/campaigns (or /api/campaigns/external)
        │ Headers: Authorization: Bearer <LEADFORGE_API_KEY>
        │          Idempotency-Key: <unique-uuid>
        │ Payload: { campaignName: "...", emails: [ { to, from, subject, body }, ... ] }
        ▼
External Campaign API Route Handler (NEW)
  ├─ 1. Authenticate Request (Timing-safe Bearer API key check)
  ├─ 2. Idempotency & Duplicate Check
  ├─ 3. Payload Validation (Array bounds, email syntax, required fields)
  ├─ 4. Sender Verification (Map `from` to connected Microsoft 365 token in DB)
  ├─ 5. Create Campaign (Record in `campaigns` table via Admin Client)
  ├─ 6. Bulk Insert Recipients (Records in `recipients` table via Admin Client)
  ├─ 7. Invoke Existing Processor (`startCampaignProcessor(campaignId, adminDb)`)
  └─ 8. Synchronous Response: HTTP 201 { campaignId, status: "sending", totalQueued }
        │
        ▼ (Asynchronous Background Execution)
Existing Mailcraft Campaign Processor (lib/campaign/processor.ts)
  ├─ Fetches pending recipients in batches of 10
  ├─ Atomic lock (`status: 'sending'`)
  ├─ Enforces per-campaign rate limiter (sliding 1-min window)
  ├─ Enforces per-mailbox micro-pacing (150ms socket guard)
  └─ Calls existing sendEmail()
        │
        ▼
Existing Microsoft Graph Email Sending (lib/email/send.ts)
  ├─ Obtains valid unexpired OAuth access token (`lib/graph/client.ts`)
  ├─ Handles inline images (upload to Supabase bucket) & attachments
  ├─ Sends via Microsoft Graph `POST /me/sendMail`
  └─ Persists recipient status (`sent` or `pending`/`failed` with retry count)
        │
        ▼
Recipients
```

---

## 2. In-Depth Analysis of the 18 Architectural Areas

### 2.1 Campaign Database Schema
* **Table**: `public.campaigns` (defined in [`supabase/migrations/001_schema.sql`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/supabase/migrations/001_schema.sql#L1) and mirrored in [`002_mailcraft_schema.sql`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/supabase/migrations/002_mailcraft_schema.sql#L11)).
* **Columns & Types**:
  * `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  * `user_id UUID NOT NULL` (references Supabase `auth.users`)
  * `name TEXT NOT NULL`
  * `subject_template TEXT NOT NULL`
  * `body_template TEXT NOT NULL DEFAULT ''`
  * `global_bcc TEXT DEFAULT ''`
  * `global_cc TEXT DEFAULT ''`
  * `rate_limit INT DEFAULT 10`
  * `status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sending','done','partial'))`
  * `created_at TIMESTAMPTZ DEFAULT now()`
  * `updated_at TIMESTAMPTZ DEFAULT now()`
* **Triggers & Indexes**:
  * `CREATE INDEX idx_campaigns_user ON campaigns(user_id)`
  * `BEFORE UPDATE ON campaigns EXECUTE FUNCTION update_updated_at_column()`
* **Row-Level Security (RLS)**:
  * `USING (auth.uid() = user_id)` (Enabled). External API requests must execute with the Supabase Service Role client (`createAdminClient()`) to bypass user session cookie requirements.

### 2.2 Campaign Creation Flow
In the current application:
1. **User Input / CSV Upload**: Handled in [`components/campaign-wizard/`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/components/campaign-wizard).
2. **Draft Creation**: Frontend posts to [`POST /api/campaigns`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/route.ts#L19) with `{ name, subject_template, body_template, global_bcc, global_cc, rate_limit }`. Status initializes as `'draft'`.
3. **Recipient Enqueueing**: Frontend posts to [`POST /api/campaigns/[id]/recipients`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/recipients/route.ts#L30) with `{ recipients: [{ email, data, attachment_path }] }`.
4. **Trigger Send**: When the user clicks "Send", frontend calls [`POST /api/campaigns/[id]/send`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/send/route.ts#L6), which validates the Microsoft OAuth token, updates campaign status to `'sending'`, and starts [`startCampaignProcessor(campaignId, supabase)`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts#L50).

### 2.3 Recipient / Email Database Schema
* **Table**: `public.recipients` ([`supabase/migrations/001_schema.sql:21`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/supabase/migrations/001_schema.sql#L21))
* **Columns & Types**:
  * `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  * `campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE`
  * `email TEXT NOT NULL` (Target recipient address)
  * `data JSONB DEFAULT '{}'` (Arbitrary key-value dictionary)
  * `attachment_path TEXT DEFAULT ''`
  * `status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed'))`
  * `error_message TEXT DEFAULT ''`
  * `retry_count INT DEFAULT 0`
  * `sent_at TIMESTAMPTZ`
  * `created_at TIMESTAMPTZ DEFAULT now()`
* **Indexes**:
  * `CREATE INDEX idx_recipients_campaign ON recipients(campaign_id)`
  * `CREATE INDEX idx_recipients_status ON recipients(status)`
* **Data Storage Compatibility**:
  * The `email` column maps directly to `to`.
  * The `data JSONB` column can store `{ "subject": email.subject, "body": email.body, "from": email.from }` or any personalization variables without schema alterations.

### 2.4 Existing Campaign APIs
* [`POST /api/campaigns`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/route.ts): Creates a campaign record. Requires user cookie session.
* [`GET /api/campaigns`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/route.ts): Returns all campaigns for the logged-in user.
* [`GET /api/campaigns/[id]`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/route.ts): Fetches campaign metadata.
* [`POST /api/campaigns/[id]/recipients`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/recipients/route.ts): Inserts recipients array.
* [`POST /api/campaigns/[id]/send`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/send/route.ts): Verifies Microsoft token, sets status to `'sending'`, and starts processor.
* [`POST /api/campaigns/[id]/process-batch`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/process-batch/route.ts): Polled by the UI or cron jobs. Accepts cookie session or `x-internal-token: SUPABASE_SECRET_KEY` to continue an in-flight campaign processor.
* [`POST /api/campaigns/[id]/retry`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/retry/route.ts): Resets failed recipients and resumes processing.

### 2.5 Existing Campaign Processor
* **Location**: [`lib/campaign/processor.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts)
* **Key Function**: `startCampaignProcessor(campaignId: string, existingSupabase?: SupabaseClient)`
* **Execution Model**:
  * Spawns an asynchronous detached worker `runCampaignLoop(campaignId, supabase)`.
  * Returns `{ started: true, message: "..." }` immediately so HTTP callers are not blocked.
  * Tracks running jobs in an in-memory `activeProcessors = new Set<string>()`.
  * Pre-flight checks Microsoft token validity using `getValidAccessToken(campaign.user_id, supabase)`.
  * Fetches pending recipients in chunks of 10 (`batchSize = 10`).
  * Claims each recipient atomically:
    ```sql
    UPDATE recipients SET status = 'sending' WHERE id = :id AND status = 'pending' RETURNING *;
    ```
  * Enforces rate limiting via `await rateLimiter.waitForNextSend()`.
  * Enforces mailbox pacing via `await paceMailboxRequest(campaign.user_id)`.
  * Dispatches email via `sendEmail({ campaign, recipient, globalAttachments, supabase })`.
  * Updates recipient to `'sent'` on success, or increments `retry_count` on failure.

### 2.6 Existing Bulk Processing
* Recipients are fetched sequentially in batches of 10 (`limit(10)` where `status = 'pending'`).
* Processed in a serial `for` loop to strictly adhere to rate limits and prevent socket flooding.
* Automatically terminates when all recipients reach terminal statuses (`sent` or `failed`), transitioning the campaign status to `'done'` (or `'partial'` if any errors occurred).

### 2.7 Existing Rate Limiting
* **Location**: [`lib/campaign/rate-limiter.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/rate-limiter.ts)
* **Mechanics**:
  * `CampaignRateLimiter` enforces both:
    1. **Sliding 1-minute window quota**: `campaignSendCount < campaignRateLimit`.
    2. **Smoothed interval pacing**: `targetIntervalMs = Math.max(100, Math.floor(60_000 / campaignRateLimit))`. For example, at 20 emails/min, dispatches are spaced ~3,000ms apart.
  * Managed in memory via `activeLimiters = new Map<string, CampaignRateLimiter>()`.
  * Cleaned up in the `finally` block of `runCampaignLoop`.

### 2.8 Existing Retry Mechanism
* **Recipient Failure**:
  * In [`lib/campaign/processor.ts:237-245`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts#L237-L245):
    * If an error is thrown during `sendEmail()`, `retry_count` is incremented.
    * If `retry_count < 3`: recipient is set back to `status: 'pending'`, allowing it to be retried in a subsequent loop batch.
    * If `retry_count >= 3`: recipient is marked as `status: 'failed'` with the error recorded in `recipients.error_message`.
* **Microsoft Graph Throttling / Transient Retries**:
  * In [`lib/email/send.ts:164-201`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts#L164-L201):
    * On `401 Unauthorized`: Retries once immediately after forcing a single-flight token refresh.
    * On `429 Too Many Requests` or `503 Service Unavailable`: Automatically extracts `Retry-After` header (default 5s, 10s, 15s), pauses the mailbox cooldown, and retries up to 3 times before failing the recipient.

### 2.9 Existing Stuck-Job Recovery
* When `runCampaignLoop` encounters 0 pending recipients:
  * It checks if any recipients remain stuck in `status: 'sending'`.
  * If stuck recipients are detected across 2 consecutive empty batch checks (e.g. following a server restart or network interruption):
    ```typescript
    await supabase.from("recipients").update({ status: "pending" }).eq("campaign_id", campaignId).eq("status", "sending");
    ```
  * Automatically recovers in-flight recipients back to `'pending'` and resumes dispatching.

### 2.10 Existing Concurrent Campaign Handling
* Mailcraft supports concurrent campaigns running simultaneously.
* Handled safely via three safeguards:
  1. **Campaign Level**: Independent `Set<string>` registry (`activeProcessors`) and isolated rate limiters (`activeLimiters`).
  2. **Mailbox Level (`paceMailboxRequest`)**: Tracks `mailboxLastCallTimestamps: Map<string, number>`. Ensures campaigns sharing the same Microsoft account space requests at least 150ms apart.
  3. **Token Level (`activeRefreshes`)**: Single-flight mutex prevents concurrent campaigns for the same user from initiating multiple simultaneous OAuth token refresh calls to Microsoft.

### 2.11 Existing Microsoft Graph Email Sending
* **File**: [`lib/email/send.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts)
* **SDK**: `@microsoft/microsoft-graph-client` (v3.0.7).
* **Endpoint**: `POST https://graph.microsoft.com/v1.0/me/sendMail`
* **Payload Structure**:
  ```json
  {
    "message": {
      "subject": "...",
      "body": { "contentType": "HTML", "content": "..." },
      "toRecipients": [{ "emailAddress": { "address": recipient.email } }],
      "ccRecipients": [...],
      "bccRecipients": [...],
      "attachments": [...]
    },
    "saveToSentItems": true
  }
  ```
* **Inline Image Hosting**: Scans `body` for base64 images (`data:image/...;base64,...`), uploads them to Supabase Storage bucket `mailcraft/email-images/`, and swaps `src` attributes for public URLs before sending.

### 2.12 Existing OAuth & Token Refresh
* **Table**: `public.microsoft_tokens` ([`001_schema.sql:68`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/supabase/migrations/001_schema.sql#L68))
  * Columns: `user_id`, `access_token`, `refresh_token`, `expires_at`, `microsoft_email`.
* **Logic**: [`lib/graph/client.ts:getValidAccessToken()`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/client.ts#L30)
  * Proactive refresh buffer: 300 seconds (5 minutes) before expiration.
  * Endpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/token`
  * Mutex protection via `activeRefreshes` Map prevents `invalid_grant` token rotation collisions.

### 2.13 Existing Sender / From Handling
* **Critical Architectural Detail**:
  * Mailcraft sends emails through Microsoft Graph `/me/sendMail`.
  * The actual sending address is determined by the **connected Microsoft 365 account** whose token is used.
  * That address is recorded in `microsoft_tokens.microsoft_email`.
  * Microsoft Graph delegated permission `Mail.Send` only permits sending from the authenticated mailbox (or mailboxes for which "Send As" / "Send on Behalf of" permissions have been explicitly granted in Exchange Online).
  * **LeadForge `from` Resolution**:
    * Mailcraft can query `microsoft_tokens` WHERE `LOWER(microsoft_email) = LOWER(incoming_from)`.
    * This resolves the specific `user_id` in Mailcraft who owns that connected account.
    * If `from` is not connected, the request must be rejected prior to campaign creation.

### 2.14 Existing HTML Email Handling
* **Location**: [`lib/email/template.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/template.ts) and [`lib/email/send.ts:67-68`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts#L67-L68).
* In `sendEmail()`:
  ```typescript
  const subject = renderTemplate(campaign.subject_template, recipient.data);
  let body = compileTemplate(campaign.body_template, recipient.data);
  ```
* **Current Behavior Trace for LeadForge**:
  * LeadForge sends individual `subject` and `body` (e.g. `<p>Hello Person 1</p>`) per recipient in the `emails` array.
  * **Subject**:
    * If `campaign.subject_template = "{{subject}}"`, and `recipient.data = { subject: email.subject }`:
    * `renderTemplate("{{subject}}", { subject: "Hello Person 1" })` returns `"Hello Person 1"`. Works as expected.
  * **Body**:
    * Mailcraft's template engine was architected with the assumption that `campaign.body_template` is the master layout, and `recipient.data` contains plain-text variables (like `{ Name: "John", Company: "Acme" }`).
    * If `campaign.body_template = "{{body}}"`, `isHtml("{{body}}")` evaluates to `false` because the template string itself has no HTML tags.
    * `compileTemplate` routes to `compilePlainText(rendered)`, which calls `escapeHtml(lineText)`:
      ```typescript
      compileTemplate('{{body}}', { body: '<p>Hello</p>' })
      // Returns: <p style="margin: 0 0 12px 0; line-height: 1.5;">&lt;p&gt;Hello&lt;/p&gt;</p>
      ```
    * If `campaign.body_template = "<div>{{body}}</div>"`, `isHtml` is `true`, but `compileTemplate` calls `renderTemplate(template, data, { escapeHtml: true })`, which also escapes `<p>` to `&lt;p&gt;`.
    * **Impact**: We have identified this behavior. See Section 6 for solutions and recommendations.

### 2.15 Existing Error Handling
* Database query errors are caught and logged with campaign context.
* Microsoft Graph errors are classified via [`lib/graph/throttling.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/throttling.ts):
  * `isGraph401()`: Triggers OAuth token refresh and retry.
  * `isGraphThrottled()`: Triggers backoff using `Retry-After`.
  * Other errors: Stored in `recipients.error_message`.
* Unhandled processor exceptions are caught in `startCampaignProcessor` IIFE `catch` block to prevent node crashes.

### 2.16 Existing Authentication & Authorization
* **Web UI**: Supabase Auth with cookie sessions (`createClient()` via `@supabase/ssr`).
* **Service / Admin**: `createAdminClient()` via `@supabase/supabase-js` using `SUPABASE_SECRET_KEY` (bypasses RLS).
* **Internal Route Guard**: `x-internal-token: process.env.SUPABASE_SECRET_KEY` in `app/api/campaigns/[id]/process-batch/route.ts`.
* **Database RLS**: Active on all tables (`auth.uid() = user_id`).

### 2.17 Existing Tests
* Mailcraft does not use Jest or Vitest; regression tests are standalone Node.js ESM scripts located in [`scripts/`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/scripts):
  * `scripts/master-regression.mjs`
  * `scripts/verify-independent-rate-limiting.mjs`
  * `scripts/verify-concurrent-campaigns.mjs`
  * `scripts/verify-batch-processing.mjs`
  * `scripts/verify-microsoft-auth.mjs`
  * `scripts/verify-html-encoding.mjs`
  * `scripts/verify-link-autolinking.mjs`
  * `scripts/verify-docx-import.mjs`

### 2.18 Existing Deployment Structure
* **Framework**: Next.js 16 (App Router) with Webpack builder.
* **Hosting**: Configured for Vercel deployment (`npm run vercel-build`).
* **Database & Storage**: Supabase (PostgreSQL + S3-compatible Object Storage for DOCX and inline email images).
* **Email Provider**: Microsoft 365 Exchange Online (via Microsoft Entra ID App registration and Graph API).

---

## 3. Specific Design & Operating Decisions

### 3.1 How Large the Incoming Email Array Can Safely Be
* **Recommended Maximum**: **100 to 250 emails per API request** (hard upper limit of **500**).
* **Technical Constraints**:
  1. **HTTP Body Limits**: Next.js and Vercel serverless request body size limit is **4.5 MB**. If each email includes rich HTML (e.g. 10 KB), 250 emails = 2.5 MB. 500 emails = 5.0 MB (exceeds payload limit and triggers `413 Payload Too Large`).
  2. **Database Insertion Time**: Inserting 250 rows in Supabase takes ~150–300ms. Inserting 2,000 rows in a single synchronous API call risks exceeding Vercel serverless function execution timeout (typically 10s or 15s for API routes).
  3. **Sending Rate**: Mailcraft's default rate limit is 20 emails/minute (pacing at 3s per email). A batch of 100 emails takes 5 minutes to deliver; 250 emails takes 12.5 minutes; 500 emails takes 25 minutes.
  4. **Exchange Online Limits**: Microsoft 365 enforces a sending limit of 30 messages/minute and 10,000 recipients/day per mailbox.

### 3.2 How Duplicate API Requests Should Be Handled
* If LeadForge experiences a network timeout or retries an HTTP POST, it must not trigger duplicate campaigns or send duplicate emails.
* **Mechanism**:
  1. Require or support an `Idempotency-Key` HTTP header (or compute a SHA-256 hash of `from` + `campaignName` + `emails.length` + first/last recipient).
  2. Before creating a campaign, check if a campaign matching the idempotency key was created in the last 24 hours.
  3. If a match is found: return the existing `campaignId` and current `status` (`sending`, `done`, etc.) with `200 OK` without creating a second campaign or enqueuing duplicate recipients.

### 3.3 Whether an Idempotency Key Is Required
* **Recommendation**: **Strongly Recommended (Mandatory for production integration)**.
* **Format**: Standard UUID v4 or arbitrary unique alphanumeric string (36–64 chars) provided in `Idempotency-Key` header.
* **Fallback**: If not provided, fallback to SHA-256 hash of the payload to protect against accidental rapid double-posts.

### 3.4 How API Authentication Should Work
* **Mechanism**: Machine-to-machine authentication via Bearer token in the `Authorization` header:
  ```http
  Authorization: Bearer <LEADFORGE_API_KEY>
  ```
* **Validation**:
  * An environment variable `LEADFORGE_API_KEY` configured in `.env.local` / production environment.
  * Validation must use `crypto.timingSafeEqual()` to guard against timing attacks.
  * Requests without a valid key receive `401 Unauthorized` immediately.

### 3.5 How Sender / From Should Be Validated
* In Mailcraft, every campaign must belong to a `user_id` who has an active Microsoft Graph token in `microsoft_tokens`.
* **Validation Pipeline**:
  1. Inspect the incoming array: verify that all items in `emails` share the **same `from` address**. (A single Mailcraft campaign is tied to one `user_id` and one Microsoft 365 token).
  2. Query `microsoft_tokens` using `createAdminClient()`:
     ```sql
     SELECT user_id, microsoft_email FROM microsoft_tokens WHERE LOWER(microsoft_email) = LOWER(:from) LIMIT 1;
     ```
  3. If no matching token is found, return `422 Unprocessable Entity`:
     ```json
     {
       "error": "Unrecognized or disconnected sender",
       "message": "The sender 'sender@example.com' does not have an active Microsoft 365 connection in Mailcraft."
     }
     ```
  4. Perform a pre-flight authorization check with `getValidAccessToken(userId, adminDb)` to verify the token is not revoked.
  5. Assign `campaign.user_id = user_id`.

### 3.6 Whether the Existing Database Can Store All Required Information
* **YES**.
  * `campaigns.name`: Stores `campaignName`
  * `campaigns.user_id`: Stores the resolved `user_id` for the sender
  * `campaigns.subject_template`: Stores `"{{subject}}"`
  * `campaigns.body_template`: Stores `"{{{body}}}"` or `"{{body}}"`
  * `campaigns.rate_limit`: Stores default `20` (or optional payload limit)
  * `campaigns.status`: Stores initial status `'sending'`
  * `recipients.email`: Stores `to`
  * `recipients.data`: Stores `{ "subject": email.subject, "body": email.body, "from": email.from }`
  * `recipients.status`: Stores `'pending'`
  * `recipients.retry_count`: Stores `0`

### 3.7 Whether Any Database Change Is Genuinely Required
* **NO**.
* No schema migration, no new tables, no altered columns, and no new enum values are required. The existing `campaigns` and `recipients` tables already contain all the columns and data structures needed.

---

## 4. Reusable Files and Functions

The existing Mailcraft codebase contains the necessary components for the campaign execution pipeline. Below is the mapping of components to be reused:

| Component | File Path | Function / Symbol | Direct Reuse Strategy |
|---|---|---|---|
| **Campaign Processor** | [`lib/campaign/processor.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts) | `startCampaignProcessor(campaignId, supabaseClient)` | Called by the new API route to initiate the background worker loop. |
| **Campaign Processor** | [`lib/campaign/processor.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts) | `isCampaignRunning(campaignId)` | Used to verify processor initiation status. |
| **Admin Database Client** | [`lib/supabase/admin.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/supabase/admin.ts) | `createAdminClient()` | Used for service-role database operations bypassing RLS for machine-to-machine requests. |
| **OAuth Token Manager** | [`lib/graph/client.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/client.ts) | `getValidAccessToken(userId, supabase)` | Pre-flight check to verify that the sender's Microsoft account is connected and tokens are valid. |
| **Email Dispatch Core** | [`lib/email/send.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts) | `sendEmail({ campaign, recipient, ... })` | Executed by the campaign loop for each recipient. |
| **Rate Limiter** | [`lib/campaign/rate-limiter.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/rate-limiter.ts) | `CampaignRateLimiter`, `getCampaignRateLimiter()` | Automatically managed by `processor.ts`. |
| **Throttling Detector** | [`lib/graph/throttling.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/throttling.ts) | `isGraphThrottled()`, `extractRetryAfterSeconds()` | Automatically active during `sendEmail()`. |

---

## 5. Minimum New Files & Changes Needed

To integrate the External Campaign API on top of Mailcraft without modifying existing code:

### New Files to Add (Phase 1):
1. **`app/api/v1/campaigns/route.ts`** (NEW):
   * Standalone Next.js Route Handler (`POST`).
   * Handles:
     * Bearer token authentication.
     * Idempotency check.
     * Payload validation (schema, email format, bounds).
     * Sender resolution (`from` → `user_id` via `microsoft_tokens`).
     * Campaign insertion (`status: 'sending'`).
     * Recipient batch insertion (`status: 'pending'`).
     * Starts processor via `startCampaignProcessor(campaign.id, adminDb)`.
     * Returns `201 Created` with `{ campaignId, status: "sending", recipientCount }`.

2. **Environment Variable Configuration** (NEW):
   * `LEADFORGE_API_KEY`: Added to `.env.local` / production environment.

### Modifications to Existing Code:
* **Current Phase (Phase 0)**: **ZERO modifications**. All code, database, and settings remain untouched.
* **Subsequent Phase Consideration**: See Section 6 regarding template HTML escaping.

---

## 6. HTML Email Handling Analysis & Architectural Options

### The Finding
As verified by live runtime inspection, Mailcraft's current template engine compiles templates using:
```typescript
const subject = renderTemplate(campaign.subject_template, recipient.data);
let body = compileTemplate(campaign.body_template, recipient.data);
```

In `lib/email/template.ts`:
* If `body_template` is `"{{body}}"`, `isHtml("{{body}}")` is `false`, so `compilePlainText` is called, which passes each line to `escapeHtml()`.
* If `body_template` is `"<div>{{body}}</div>"`, `isHtml` is `true`, but `compileTemplate` calls `renderTemplate(template, data, { escapeHtml: true })`, which passes all `{{...}}` placeholder replacements to `escapeHtml()`.

Therefore, if LeadForge provides raw HTML in `email.body` (e.g. `<p>Hello Person 1</p>`), Mailcraft's existing template compilation will escape the `<` and `>` into `&lt;` and `&gt;`, causing the recipient to receive visible HTML code.

### Architectural Options for Phase 1

#### Option 1 (Recommended — Minimal 3-line adjustment in `compileTemplate` or `renderTemplate`)
Add support for raw unescaped placeholders or triple-braces (standard Handlebars/Mustache pattern):
* If a placeholder uses `{{{key}}}` (or if `key === "body"`), do not pass through `escapeHtml()`.
* This preserves 100% backward compatibility for existing CSV campaigns while allowing external systems like LeadForge to provide ready-made HTML bodies.

#### Option 2 (Zero Changes to Template Engine — Standard Campaign Layout)
* If LeadForge can send a campaign-level template and per-recipient variables:
  * LeadForge payload provides `body_template` at the campaign level, and `emails` contains only personalized data variables (e.g. `{ name: "Person 1" }`).
  * However, based on the prompt's specified input:
    ```json
    {
      "campaignName": "LeadForge Campaign",
      "emails": [
        { "to": "person1@example.com", "from": "sender@example.com", "subject": "Hello 1", "body": "<p>Hello 1</p>" }
      ]
    }
    ```
    Option 1 is the cleanest approach.

---

## 7. Proposed External API Specification (Draft for Phase 1)

### HTTP Request

```http
POST /api/v1/campaigns
Host: mailcraft.example.com
Authorization: Bearer <LEADFORGE_API_KEY>
Idempotency-Key: 7b9a5c8e-3f2d-4e1b-9a8c-7d6e5f4a3b2c
Content-Type: application/json
```

### JSON Request Payload

```json
{
  "campaignName": "LeadForge Q1 Outreach",
  "emails": [
    {
      "to": "person1@example.com",
      "from": "sender@example.com",
      "subject": "Hello Person 1",
      "body": "<p>Hello Person 1,</p><p>Great connecting with you.</p>"
    },
    {
      "to": "person2@example.com",
      "from": "sender@example.com",
      "subject": "Hello Person 2",
      "body": "<p>Hello Person 2,</p><p>Saw your recent updates.</p>"
    }
  ]
}
```

### Validation Rules

| Field | Rule | Error Behavior |
|---|---|---|
| `campaignName` | Required, non-empty string, max 255 chars | `400 Bad Request` |
| `emails` | Required array, length between 1 and 250 | `400 Bad Request` |
| `emails[].to` | Required, valid email format regex | `400 Bad Request` |
| `emails[].from` | Required, valid email format regex; **must be identical across all items in array** | `400 Bad Request` |
| `emails[].from` | Must match an existing connected account in `microsoft_tokens.microsoft_email` | `422 Unprocessable Entity` |
| `emails[].subject` | Required, non-empty string | `400 Bad Request` |
| `emails[].body` | Required, non-empty string | `400 Bad Request` |

### Success Response (`HTTP 201 Created`)

```json
{
  "success": true,
  "campaignId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "campaignName": "LeadForge Q1 Outreach",
  "status": "sending",
  "totalRecipients": 2,
  "sender": "sender@example.com",
  "createdAt": "2026-09-23T17:45:00.000Z"
}
```

### Duplicate Request Response (`HTTP 200 OK`)

```json
{
  "success": true,
  "duplicate": true,
  "campaignId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "status": "sending",
  "message": "Campaign with this Idempotency-Key already exists and is currently processing."
}
```

---

## 8. Security Concerns & Risks

1. **Machine-to-Machine Secret Leakage**:
   * The `LEADFORGE_API_KEY` must never be checked into Git or exposed on the client. It must reside in `.env.local` / deployment environment variables.
2. **Timing Attack Protection**:
   * Token checks must utilize `crypto.timingSafeEqual()` rather than standard string comparison (`===`).
3. **Sender Spoofing Guard**:
   * Without sender verification against `microsoft_tokens`, an external client could claim to send from any address. Strictly requiring a verified row in `microsoft_tokens` prevents unauthorized sender spoofing.
4. **Denial of Service / Socket Exhaustion**:
   * Enforcing an array limit of 250 recipients prevents large payloads from blocking the event loop or exhausting memory.
5. **Mailbox Reputation & Microsoft 365 Tenant Suspension**:
   * Sending too quickly can trigger Microsoft tenant-wide throttling or account suspension. Reusing Mailcraft's `CampaignRateLimiter` and `paceMailboxRequest` protects the tenant.

---

## 9. Testing & Verification Requirements (For Phase 1)

When implementation begins in Phase 1, the following test suite will be required:

1. **Authentication Tests**:
   * Request with no `Authorization` header returns `401 Unauthorized`.
   * Request with invalid key returns `401 Unauthorized`.
   * Request with valid key succeeds.
2. **Payload Validation Tests**:
   * Empty `emails` array returns `400 Bad Request`.
   * Array exceeding 250 items returns `400 Bad Request`.
   * Malformed email addresses return `400 Bad Request`.
   * Heterogeneous `from` addresses in the same array return `400 Bad Request`.
3. **Sender Verification Tests**:
   * Disconnected / non-existent `from` email returns `422 Unprocessable Entity`.
   * Active `from` address resolves to correct `user_id`.
4. **Idempotency Tests**:
   * Re-sending the identical request with the same `Idempotency-Key` returns `200 OK` with the existing `campaignId` without creating duplicate campaign or recipient rows.
5. **End-to-End Processing Tests**:
   * Campaign record is created in `campaigns` table with `status: 'sending'`.
   * Recipients are created in `recipients` table with `status: 'pending'`.
   * `startCampaignProcessor()` begins dispatching recipients.
   * Rate limiter enforces pacing between emails.
   * Recipient rows transition to `'sent'` upon successful Graph dispatch.

---

## 10. Summary & Sign-Off

* **Feasibility**: High. The existing Mailcraft campaign architecture, atomic claiming, rate limiting, and Microsoft Graph dispatcher are well-suited to handle external campaigns.
* **Database Migrations Needed**: **None**.
* **Existing Code Disruptions**: **None**.
* **Phase 0 Status**: Complete. No code or database changes have been performed.
