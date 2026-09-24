# Mailcraft Email API Integration Requirements

## 1. Purpose

This document specifies the exact technical requirements for integrating an external REST email-sending API into **Mailcraft**.

Mailcraft is a cold outreach and bulk email automation application. The external email-sending service will be used for:
1. **Application Emails**: System-generated and transactional notifications.
2. **Bulk Outreach Campaign Emailing**: Dispatching personalized outbound emails at scale to recipient lists uploaded via CSV or Excel spreadsheets.
3. **On-Demand Dispatch**: Executing email delivery when the user clicks the "Send" button inside the Mailcraft campaign dashboard.

### Expected Operational Flow

```
User clicks "Send" in Mailcraft UI (/campaign/[id])
                      ↓
Mailcraft Backend Route (POST /api/campaigns/[id]/send)
                      ↓
Campaign Processor Background Worker (lib/campaign/processor.ts)
  - Fetches batch of pending recipients (batchSize = 10)
  - Claims recipient atomically (status: "sending")
  - Evaluates per-campaign rate limiter (e.g., 20 emails/min)
  - Compiles subject & HTML/plain-text templates (lib/email/template.ts)
  - Resolves CC, BCC, and downloads attachments (lib/email/send.ts)
                      ↓
External REST Email-Sending API (POST /<send-endpoint>)
                      ↓
Email is sent to recipient by provider
                      ↓
API returns synchronous response (HTTP 200/201 Success OR 4xx/5xx Error)
                      ↓
Mailcraft records result in database (Supabase: recipients table)
  - On Success: status = 'sent', sent_at = ISO timestamp, message_id recorded
  - On Failure: status = 'failed' (or 'pending' if retry count < 3), error_message stored
                      ↓
Mailcraft UI updates in real time via Supabase Realtime & polling:
  - Progress bar recalculates (% delivered, % failed)
  - Recipient delivery table displays status badge, dispatched time, or error reason
  - Campaign status completes as "done" (all delivered) or "partial" (has failures)
```

---

## 2. Information Required From Email API Provider

The table below catalogs every integration parameter required from the email API vendor, cross-referenced against what is currently available inside the Mailcraft codebase.

| Requirement | Required Information | Current Status in Mailcraft Codebase |
|---|---|---|
| **Base URL** | Root URL for the API (e.g., `https://api.emailprovider.com/v1`) | To be provided by email API provider. |
| **API Key** | Authentication token/key scoped to the account or sending domain | To be provided by email API provider. |
| **Send Endpoint** | Relative POST path for single message dispatch (e.g., `/email/send` or `/messages`) | To be provided by email API provider. |
| **Authentication Method** | Header structure (e.g., `Bearer <key>`, `X-Api-Key: <key>`, or Basic Auth) | To be provided by email API provider. |
| **From Domain Verification** | Confirmation that `outreach@ourdomain.com` is verified with active SPF, DKIM, and DMARC records | To be provided by email API provider. |
| **Message ID** | Unique provider-assigned identifier returned in the synchronous response body for each accepted message | To be provided by email API provider. |
| **Synchronous Response** | Immediate HTTP response indicating whether the message was accepted for delivery | To be provided by email API provider. |
| **Standardized Error Format** | Structured JSON schema distinguishing auth failures, rate limits, invalid recipients, and provider faults | To be provided by email API provider. |
| **Sandbox / Test Environment** | Dedicated test Base URL or Test API Key that allows end-to-end integration testing without sending real emails | To be provided by email API provider. |
| **SDK / Documentation** | Official REST API reference documentation, OpenAPI/Swagger specification, or TypeScript SDK | To be provided by email API provider. |

---

## 3. Required Send API Contract

### Request Method and Path
```http
POST /<send-endpoint>
Host: <provider-base-url>
Authorization: Bearer <API_KEY>  (or X-Api-Key: <API_KEY>)
Content-Type: application/json
```

### JSON Request Payload Specification

```json
{
  "to": "recipient@company.com",
  "from": "outreach@ourdomain.com",
  "fromName": "Our Brand",
  "subject": "Quick intro ahead of CES 2027",
  "body": "Hello Alex,\n\nWe noticed your work in robotics...",
  "htmlBody": "<p style=\"margin: 0 0 12px 0; line-height: 1.5;\">Hello Alex,</p><p style=\"margin: 0 0 12px 0; line-height: 1.5;\">We noticed your work in robotics...</p>",
  "cc": ["manager@ourdomain.com"],
  "bcc": ["crm-audit@ourdomain.com"],
  "attachments": [
    {
      "name": "Conference_Overview.pdf",
      "contentType": "application/pdf",
      "contentBytes": "JVBERi0xLjQKJcTl8uXrp42vm..."
    }
  ]
}
```

### Field Breakdown & Mailcraft Compatibility

#### 1. Core Fields (Mandatory Contract)

* **`to`** *(string, Required)*:
  * **Mailcraft Source**: `recipient.email` (from `recipients` table, sourced from CSV/Excel upload column).
  * **Validation**: Mailcraft sanitizes recipients and ensures non-empty strings adhering to `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
* **`subject`** *(string, Required)*:
  * **Mailcraft Source**: `renderTemplate(campaign.subject_template, recipient.data)` (`lib/email/template.ts:118`).
  * **Format**: Dynamic subject line with `{{column}}` placeholder merge-tags populated per recipient.
* **`body`** *(string, Required)*:
  * **Mailcraft Source**: Plain-text fallback version generated by `htmlToPlainText(body)` (`lib/docx-to-html.ts:671`) or raw plain-text template.
  * **Purpose**: Multi-part MIME alternative for email clients that do not render HTML.
* **`from`** *(string, Required)*:
  * **Mailcraft Source**: Verified sending email address (e.g., `outreach@ourdomain.com`).
  * **Current Codebase Note**: In the current Microsoft Graph integration, `from` is implicitly derived from the authenticated Microsoft 365 user session (`/me/sendMail`). For the external API, this must be explicitly passed in every request payload.
* **`fromName`** *(string, Required)*:
  * **Mailcraft Source**: Sender display name (e.g., `"Our Brand"` or campaign sender identity).
* **`htmlBody`** *(string, Optional / Strongly Recommended)*:
  * **Mailcraft Source**: `compileTemplate(campaign.body_template, recipient.data)` (`lib/email/template.ts:514`).
  * **Format**: Full HTML markup with inline styles (`style="..."`), semantic tags (`<p>`, `<a>`, `<table>`, `<ul>`, `<ol>`, `<li>`, `<h1>`-`<h6>`, `<img>`), corporate blue links (`#0066cc`), and auto-hosted image URLs.

---

#### 2. Additional Fields Detected in Mailcraft

Inspection of the Mailcraft codebase confirms the following additional fields are actively used and must be accommodated:

* **`cc` / `ccRecipients`** *(array of strings, Optional)*:
  * **Mailcraft Implementation**: Handled in `components/campaign-wizard/step-send-config.tsx` and `lib/email/send.ts:113-120`. Sourced from `campaign.global_cc` (comma-separated email list).
  * **Behavior**: Filtered by email regex and passed to Microsoft Graph as `message.ccRecipients`.
  * **API Requirement**: The provider should accept an array of CC email addresses or a comma-separated string.
* **`bcc` / `bccRecipients`** *(array of strings, Optional)*:
  * **Mailcraft Implementation**: Handled in `components/campaign-wizard/step-send-config.tsx` and `lib/email/send.ts:122-129`. Sourced from `campaign.global_bcc` (comma-separated email list, typically used for CRM compliance tracking).
  * **Behavior**: Filtered by email regex and passed to Microsoft Graph as `message.bccRecipients`.
  * **API Requirement**: The provider should accept an array of BCC email addresses or a comma-separated string.
* **`attachments`** *(array of objects, Optional)*:
  * **Mailcraft Implementation**: Mailcraft supports two tiers of attachments (`lib/email/send.ts:131-150`):
    1. **Global Attachments**: Stored in Supabase Storage (`mailcraft` bucket) and the `attachments` table; attached to every email in the campaign.
    2. **Per-Recipient Attachments**: Specified via spreadsheet column (`recipient.attachment_path`); can be a public HTTPS URL or a Supabase storage path.
  * **Preparation in Mailcraft**: `downloadAttachment()` fetches file buffers from Supabase Storage or URLs and converts them to base64 strings (`contentBytes`) along with filename and MIME type (`contentType`).
  * **API Requirement**: The external provider must support an array of attachments containing:
    * `name` (or `filename`): string (e.g., `"Contract.pdf"`)
    * `contentType` (or `mimeType`): string (e.g., `"application/pdf"`)
    * `contentBytes` (or `content`): string (base64-encoded file payload)

---

#### 3. Fields Inspected and NOT Required by Mailcraft

* **`replyTo`**: Not present in Mailcraft database schema, wizard steps, or sending logic. *Not required.*
* **`custom headers`**: Not used in Mailcraft. *Not required.*
* **`tags` / `metadata`**: Not currently stored or passed. *Optional vendor feature.*

---

## 4. Required Success Response

Mailcraft requires a **synchronous** JSON response acknowledging delivery acceptance.

### Preferred Response Format
```json
HTTP/1.1 200 OK  (or 201 Created / 202 Accepted)
Content-Type: application/json

{
  "success": true,
  "messageId": "msg_984f82a17b0c4e1289df"
}
```

### Message ID Tracking & Current Database Status

* **Current Codebase State**:
  * In the existing Microsoft Graph implementation (`lib/email/send.ts:170`), the client calls `graphClient.api("/me/sendMail").post({ message, saveToSentItems: true })`, which returns an empty `202 Accepted` response without exposing an Outlook message ID.
  * Examination of the Supabase database schema (`supabase/migrations/001_schema.sql` and `002_mailcraft_schema.sql`) and TypeScript definitions (`types/index.ts`) reveals that the `recipients` table currently contains:
    * `id` (UUID, primary key)
    * `campaign_id` (UUID)
    * `email` (TEXT)
    * `data` (JSONB)
    * `attachment_path` (TEXT)
    * `status` (TEXT: `'pending' | 'sending' | 'sent' | 'failed'`)
    * `error_message` (TEXT)
    * `retry_count` (INT)
    * `sent_at` (TIMESTAMPTZ)
    * `created_at` (TIMESTAMPTZ)
  * **CRITICAL FINDING**: The database currently **DOES NOT** have a `message_id` or `provider_message_id` column.
* **Tracking Recommendation**:
  * Mailcraft can immediately log and utilize the provider's `messageId`.
  * To persist the message ID permanently for webhook delivery events or bounce tracking, a database migration will be required to add `provider_message_id TEXT` to the `recipients` table (see Section 14).

---

## 5. Required Failure Response

When an email send fails, Mailcraft requires a structured, synchronous JSON error payload so that the background processor can decide whether to retry or fail the recipient.

### Preferred Failure Response Format
```json
HTTP/1.1 <4xx / 5xx Status Code>
Content-Type: application/json

{
  "success": false,
  "message": "Human-readable explanation of why the dispatch failed",
  "code": "PROVIDER_ERROR_CODE",
  "retryable": false
}
```

### Error Categories & Existing Mailcraft Handling

Mailcraft's campaign processor (`lib/campaign/processor.ts`) and throttling detector (`lib/graph/throttling.ts`) already categorize errors into distinct operational paths:

| Error Category | Expected HTTP Status & Code | Mailcraft Current Handling & Representation | Action Needed by Processor |
|---|---|---|---|
| **Authentication Failure** | `401 Unauthorized`<br>`AUTH_INVALID_KEY` / `UNAUTHORIZED` | Currently caught via `isGraph401()`. Causes immediate abort of campaign processing; logs error. | Abort campaign immediately; revert campaign status to `'draft'`; notify user in UI that the API key is invalid. |
| **Invalid API Key** | `403 Forbidden`<br>`API_KEY_INACTIVE` / `FORBIDDEN` | Caught as authorization error. | Abort campaign immediately; do not retry recipients. |
| **Invalid Recipient** | `400 Bad Request` / `422 Unprocessable`<br>`INVALID_RECIPIENT` / `MAILBOX_NOT_FOUND` | Recorded as `error_message` on the recipient record in Supabase. | Non-retryable error. Immediately mark recipient as `status: "failed"` with `error_message: response.message`. |
| **Invalid Sender / Unverified Domain** | `403 Forbidden` / `422 Unprocessable`<br>`SENDER_NOT_VERIFIED` / `DOMAIN_UNVERIFIED` | Campaign fails pre-flight or first send. | Abort campaign; mark campaign as `'draft'`; alert user to verify domain. |
| **Quota Exceeded** | `402 Payment Required` / `429 Too Many Requests`<br>`MONTHLY_QUOTA_EXCEEDED` / `DAILY_LIMIT` | Caught and stored in `recipient.error_message`. | Pause/abort campaign; record quota exhaustion; prevent further billing exhaustion. |
| **Rate Limit / Throttling** | `429 Too Many Requests`<br>`RATE_LIMIT_EXCEEDED`<br>*(with `Retry-After` header)* | Currently detected via `isGraphThrottled()`. Extracts seconds via `extractRetryAfterSeconds()`, applies cooldown via `setMailboxThrottledUntil()`. | Pause worker for the specified `Retry-After` duration (up to 300s); retry the current recipient (up to 3 attempts). |
| **Provider Server Error** | `500 Internal Error` / `502 Bad Gateway` / `503 Service Unavailable` / `504 Gateway Timeout` | Detected via `isGraphThrottled()` (status 503/504) or caught as generic exception in loop. | Retry recipient up to 3 times with exponential backoff (`retry_count`). If retries exhaust, mark recipient as `'failed'`. |
| **Invalid Request / Schema Error** | `400 Bad Request`<br>`INVALID_PAYLOAD` / `MISSING_FIELD` | Caught and stored in `recipient.error_message`. | Non-retryable. Mark recipient as `status: "failed"`. |
| **Temporary Delivery Failure** | `451 / 503`<br>`TEMPORARY_FAILURE` / `DNS_TIMEOUT` | Treated as retryable error in `processor.ts:237-250`. | Re-queue recipient with `status: "pending"` and increment `retry_count`. If `retry_count >= 3`, mark as `status: "failed"`. |

---

## 6. Authentication Requirements

### 1. Key Storage and Management
* The external email API key **MUST BE STORED SERVER-SIDE ONLY** in environment variables (`.env.local` for local development, platform environment settings for production/Vercel/Docker).
* Recommended environment variable naming convention:
  ```bash
  EMAIL_API_KEY=your_secure_provider_api_key_here
  EMAIL_API_BASE_URL=https://api.emailprovider.com/v1
  ```

### 2. Client-Side Protection & Security
* **STRICT RULE**: The API key must **NEVER** have the `NEXT_PUBLIC_` prefix. In Next.js, variables prefixed with `NEXT_PUBLIC_` are baked into the browser JavaScript bundle and exposed to all visitors.
* Mailcraft's existing environment variable convention strictly honors this separation (from `.env.local.example`):
  * Public client variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`
  * Secret server variables: `SUPABASE_SECRET_KEY`, `MICROSOFT_CLIENT_SECRET`, `SEED_PASSWORD`
* The frontend browser application will **never** communicate directly with the external Email API. All outbound requests originate exclusively from server-side Next.js route handlers (`/app/api/campaigns/[id]/send`, `/app/api/campaigns/[id]/process-batch`) and server-side worker modules (`lib/campaign/processor.ts`, `lib/email/send.ts`).

---

## 7. From Domain Requirements

### Provider Requirements for Sender Identity
The external provider must explicitly verify and allow sending on behalf of:

* **FROM Email Address**: `outreach@ourdomain.com` (or the client's configured sending domain)
* **FROM Display Name**: `Our Brand` (or the client's configured organization name)

### Required Confirmations from Provider
1. **Domain Verification**: Active verification of the root and subdomain in the provider's management console.
2. **DNS Record Validation**: Confirmation that SPF (`v=spf1 include:... ~all`), DKIM (CNAME or TXT keys), and DMARC (`v=DMARC1; p=quarantine; ...`) records are fully validated.
3. **No Sender Enforcement Rejection**: Confirmation that the API will not reject dispatches due to strict envelope or header sender mismatches once DNS records are active.

### Current Mailcraft Source for Sender Address
* In the current Mailcraft implementation, the sender address is **not configurable per campaign**. It is automatically derived from the Microsoft 365 OAuth connection stored in `microsoft_tokens.microsoft_email` (`app/api/auth/callback/route.ts:59`, `app/api/auth/microsoft/status/route.ts:38`).
* If the external API requires a static sender across all campaigns, it will be configured via server environment variables (`EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`).
* If the sender is intended to be configurable by user or campaign, a campaign-level field (`from_email`, `from_name`) will need to be added to Mailcraft in a future iteration.

---

## 8. Bulk Email Requirements

Inspection of `lib/campaign/processor.ts` and `lib/campaign/rate-limiter.ts` defines Mailcraft's exact bulk email execution model:

### 1. Recipient Processing & Batching
* Recipients are **not sent in a single bulk array call**.
* Instead, Mailcraft fetches pending recipients from the Supabase database in sequential chunks of **10** (`batchSize = 10`):
  ```typescript
  // lib/campaign/processor.ts:141-146
  const { data: pending } = await supabase
    .from("recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .limit(batchSize);
  ```
* Each recipient in the batch is processed **individually** through an atomic claim lock:
  ```typescript
  // lib/campaign/processor.ts:202-208
  const { data: claimed } = await supabase
    .from("recipients")
    .update({ status: "sending" })
    .eq("id", recipient.id)
    .eq("status", "pending")
    .select().single();
  ```

### 2. Rate Limiting & Dispatch Timing
* **Per-Campaign Independent Rate Limiter**: Every campaign maintains its own isolated `CampaignRateLimiter` (`lib/campaign/rate-limiter.ts:18`).
* **Configured Rate**: Configurable in the Campaign Wizard (`components/campaign-wizard/step-send-config.tsx:76-88`) between **1 and 100 emails per minute** (default: **20 emails/min**).
* **Pacing Interval**: Emails are smoothed evenly across each 60-second window. At 20 emails/min, the limiter enforces an interval of `60,000 / 20 = 3,000 ms` (3 seconds) between dispatches:
  ```typescript
  // lib/campaign/rate-limiter.ts:32
  this.targetIntervalMs = Math.max(100, Math.floor(this.windowDurationMs / this.campaignRateLimit));
  ```
* **Mailbox Micro-Pacing**: An additional micro-pacer enforces a minimum gap of **150 ms** between requests (`MIN_MAILBOX_REQUEST_INTERVAL_MS = 150`) to avoid socket flooding.

### 3. Retry Behavior & Error Recording
* When a dispatch fails:
  * Mailcraft increments `retry_count` on the recipient.
  * If `retry_count < 3`: Recipient is reset to `status: "pending"` to be picked up in subsequent batch cycles.
  * If `retry_count >= 3`: Recipient is marked as `status: "failed"` with `error_message` set to the returned error string.
* When a dispatch succeeds:
  * Recipient is updated to `status: "sent"`, `sent_at = new Date().toISOString()`, `error_message = ""`.

### 4. Concurrent Campaign Execution
* Multiple campaigns run **concurrently and independently** in background tasks tracked by an active processor registry (`activeProcessors = new Set<string>()`).
* If User launches Campaign A (20 emails/min) and Campaign B (30 emails/min), both run in parallel without blocking each other.
* **API Volume Expectation**: The provider's API must support concurrent burst requests from multiple active campaigns without premature global account rate limiting.

---

## 9. HTML and Plain Text Requirements

Mailcraft features an email template engine (`lib/email/template.ts`) and DOCX document compiler (`lib/docx-to-html.ts`). The external API must preserve Mailcraft's output formatting:

### 1. Content Formats Produced by Mailcraft
Mailcraft produces two content representations:
1. **`htmlBody` (Rich HTML)**:
   * **DOCX-Imported Layouts**: Word documents converted into semantic HTML tables, headings, and paragraphs with inline CSS (`margin: 0 0 12px 0; line-height: 1.5;`).
   * **Hyperlinks**: Standardized with corporate blue underlined styling:
     ```html
     <a href="https://example.com" target="_blank" rel="noopener noreferrer" style="color: #0066cc !important; text-decoration: underline;">Link Text</a>
     ```
   * **Lists**: Nested bullet lists (`<ul style="margin: 0 0 12px 0; padding-left: 24px; line-height: 1.5;"><li style="margin-bottom: 4px;">...</li></ul>`) and numbered lists (`<ol>`).
   * **Tables**: Formatted with inline borders and cell padding: `<table style="border-collapse: collapse; margin: 0 0 16px 0;">`.
   * **Images**: Embedded images are detected by Mailcraft, uploaded to Supabase Storage, and injected as `<img src="https://...supabase.co/storage/v1/object/public/mailcraft/email-images/..." style="..." />`.
   * **Placeholders**: `{{column_name}}` tokens replaced with escaped, sanitized recipient values.
2. **`body` (Plain Text)**:
   * Clean text representation generated by stripping HTML tags, converting tables to tab-delimited columns, and formatting hyperlinks as `Link Text (https://example.com)`.

### 2. Critical Provider Requirements for HTML
* **HTML Preservation**: The provider **must not alter, strip, or sanitize** valid inline CSS attributes (such as `style="color: #0066cc !important; text-decoration: underline;"` or `margin: ...`).
* **No Markdown Conversion**: The provider must **not** attempt to parse or convert HTML into Markdown.
* **Character Encoding**: The provider must accept and properly deliver UTF-8 encoded text, special characters (`&`, `©`, `™`, `—`), and non-ASCII characters without entity corruption or double-encoding (`&amp;amp;`).

---

## 10. Attachments

Mailcraft fully supports attachments in its email-sending flow (`lib/email/send.ts:18-55, 131-150`).

### 1. Attachment Types Supported in Mailcraft
1. **Global Attachments**: Uploaded by the user in Step 4 of the Campaign Wizard (`components/campaign-wizard/step-attachments.tsx`). Stored in Supabase Storage (`mailcraft` bucket) and registered in the `attachments` table. Sent with every outbound email.
2. **Per-Recipient Attachments**: Configured by selecting a spreadsheet column containing file URLs or storage paths (e.g., individualized invoices or certificates).

### 2. Current Preparation Pipeline
Inside `lib/email/send.ts`, `downloadAttachment()` retrieves the raw file from either Supabase Storage or an HTTP/HTTPS URL, detects the file extension, determines the MIME type, and base64-encodes the buffer:

```typescript
// lib/email/send.ts:50-54
return {
  name: filename,
  contentBytes: Buffer.from(buffer).toString("base64"),
  contentType: contentType[ext] || "application/octet-stream",
};
```

### 3. Provider Requirements for Attachments
The external API must support:
* Multiple attachments per single outbound email.
* Standard payload schema:
  ```json
  "attachments": [
    {
      "name": "Invoice_1042.pdf",
      "contentType": "application/pdf",
      "contentBytes": "JVBERi0xLjQKJcTl8uXrp42vm..."
    }
  ]
  ```
* Standard MIME types supported by Mailcraft: `application/pdf`, `image/png`, `image/jpeg`, `image/gif`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`, `text/plain`.

---

## 11. Message ID / Tracking

### How Mailcraft Currently Identifies Operations
* **Campaign Level**: Every campaign has a unique UUID `campaign.id` (`campaigns` table).
* **Recipient Level**: Every recipient has a unique UUID `recipient.id` (`recipients` table).
* **Current Provider Message ID**: Currently **absent**. Microsoft Graph `/me/sendMail` does not return a message ID in its 202 response.

### Where the Provider Message ID Logically Fits
1. When the external API responds with:
   ```json
   { "success": true, "messageId": "provider-msg-id-12345" }
   ```
2. The campaign processor (`lib/campaign/processor.ts`) should record this ID alongside `status = "sent"` and `sent_at = now()`.
3. To store this ID, a database migration is recommended:
   ```sql
   ALTER TABLE recipients ADD COLUMN provider_message_id TEXT DEFAULT '';
   CREATE INDEX idx_recipients_provider_message_id ON recipients(provider_message_id);
   ```
4. This enables:
   * Tracking individual delivery logs.
   * Correlating future webhook callbacks (delivery confirmations, opens, clicks, bounces, unsubscribes) with the exact recipient in Mailcraft.

---

## 12. Sandbox / Testing

To ensure safe verification before dispatching campaigns to real prospective clients, the email API provider must supply a sandbox or test configuration:

1. **Sandbox / Test Base URL or Flag**: A dedicated sandbox endpoint (e.g., `https://sandbox-api.emailprovider.com/v1`) or test mode header/flag.
2. **Dedicated Test API Key**: A test key that validates request payloads and authentication without triggering real email delivery.
3. **Deterministic Test Scenarios**: Specific recipient email addresses or test tokens to simulate various delivery outcomes:
   * `success@simulator.emailprovider.com` → Returns HTTP 200 with mock `messageId`.
   * `bounce@simulator.emailprovider.com` → Returns HTTP 400/422 invalid recipient.
   * `throttle@simulator.emailprovider.com` → Returns HTTP 429 with `Retry-After: 5`.
   * `error@simulator.emailprovider.com` → Returns HTTP 500 internal server error.
4. **Safety Guarantee**: The test environment must strictly prevent unintended real-world dispatches while verifying payload compilation, rate limiting, and status updates.

---

## 13. Exact Information To Send To The Provider

*(The section below is formatted for direct transmission to the external email API provider.)*

***

### Mailcraft Integration Requirements

We need the following technical specifications to integrate your email-sending REST API into the Mailcraft application for transactional and bulk cold outreach campaigns:

1. **Base URL**: The production REST API base URL (e.g., `https://api.yourdomain.com/v1`).
2. **API Key**: An API key scoped to our sending account/domain.
3. **Authentication Method**: Exact header format required (e.g., `Authorization: Bearer <KEY>` or `X-Api-Key: <KEY>`).
4. **Send Endpoint**: The HTTP POST route for sending a single email (e.g., `POST /v1/email/send`).
5. **Request Format**: The JSON request payload schema. Our system generates the following structure:
   ```json
   {
     "to": "recipient@company.com",
     "from": "outreach@ourdomain.com",
     "fromName": "Our Brand",
     "subject": "Introductory inquiry",
     "body": "Plain text fallback content",
     "htmlBody": "<p style=\"margin: 0 0 12px 0; line-height: 1.5;\">Rich HTML content</p>",
     "cc": ["team@ourdomain.com"],
     "bcc": ["crm-compliance@ourdomain.com"],
     "attachments": [
       {
         "name": "OnePager.pdf",
         "contentType": "application/pdf",
         "contentBytes": "base64_encoded_string=="
       }
     ]
   }
   ```
   *Please confirm if your parameter names differ (e.g., `html` vs `htmlBody`, `text` vs `body`, `filename` vs `name`).*
6. **Success Response**: Synchronous response returned upon message acceptance. Preferred format:
   ```json
   {
     "success": true,
     "messageId": "your-unique-message-id"
   }
   ```
7. **Message ID**: The field name and format of the unique identifier returned in the response body.
8. **Error Response Format**: Synchronous error payload structure and error codes for:
   * Authentication failure (`401`)
   * Invalid API key (`403`)
   * Invalid/malformed recipient address (`400` / `422`)
   * Unverified From sender or domain (`403` / `422`)
   * Quota exceeded (`402` / `429`)
   * Rate limit / Throttling (`429` with `Retry-After` header or wait duration)
   * Internal provider error (`500` / `503`)
9. **From Domain Verification**: Confirmation of the DNS setup requirements (SPF, DKIM, DMARC) to verify `outreach@ourdomain.com` and ensure dispatches are not rejected due to sender policy checks.
10. **Sandbox / Test Key**: A test API key or sandbox endpoint that allows us to validate authentication, payload serialization, rate limiting, and error handling without dispatching real emails.
11. **API Documentation / SDK**: Link to your official API reference, OpenAPI/Swagger JSON, or TypeScript client library.

***

---

## 14. Mailcraft Integration Notes For Developer

*(Technical architecture guidance for the internal Mailcraft developer implementing the integration once credentials are provided.)*

### 1. Where the Integration Connects
* **Primary Integration Point**: [`lib/email/send.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts).
  * Currently, `sendEmail()` initializes `createGraphClient()` and calls `graphClient.api("/me/sendMail").post({ message, saveToSentItems: true })`.
  * The HTTP request to the external provider should be encapsulated here (e.g., via a helper `dispatchViaEmailApi(...)`).
* **Pre-Flight Checks**:
  * Currently, [`app/api/campaigns/[id]/send/route.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/send/route.ts), [`process-batch/route.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/process-batch/route.ts), and [`lib/campaign/processor.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts) call `getValidAccessToken(campaign.user_id)` to ensure Microsoft Graph is connected.
  * When using the external API, this check should verify that the provider API key is present in environment variables.

### 2. Components That Must Remain Unchanged
* **Campaign Processor Architecture** ([`lib/campaign/processor.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts)):
  * Atomic claiming (`pending` → `sending`).
  * Batch fetching (`batchSize = 10`).
  * 3-attempt retry loop (`retry_count >= 3 ? "failed" : "pending"`).
  * Updating campaign status to `"sending"`, `"done"`, or `"partial"`.
* **Rate Limiter Engine** ([`lib/campaign/rate-limiter.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/rate-limiter.ts)):
  * The per-campaign 60-second window, pacing intervals, and `waitForNextSend()` mechanisms must remain intact to smooth out dispatches and avoid provider bursts.
* **Email Template & DOCX Processing** ([`lib/email/template.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/template.ts), [`lib/docx-to-html.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/docx-to-html.ts)):
  * `renderTemplate()`, `compileTemplate()`, `cleanHtmlWhitespace()`, `autoLinkHtml()`, and image-to-storage upload logic must be preserved exactly as-is.
* **Frontend Real-time UI** ([`app/campaign/[id]/page.tsx`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/campaign/[id]/page.tsx), [`components/recipient-table.tsx`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/components/recipient-table.tsx)):
  * The frontend relies on Supabase Realtime changes and polling on the `recipients` table. As long as `recipients.status` and `recipients.error_message` continue to be updated, the progress bar and recipient table work seamlessly.

### 3. What Needs to be Mapped

| Mailcraft Data | External API Request Field | Mapping Notes |
|---|---|---|
| `recipient.email` | `to` | Recipient address. |
| `campaign.subject_template` + `recipient.data` | `subject` | Compiled via `renderTemplate()`. |
| `campaign.body_template` + `recipient.data` | `htmlBody` | Compiled via `compileTemplate()`. |
| `htmlToPlainText(compiledHtml)` | `body` | Fallback plain text. |
| Configuration / Env Var | `from` | e.g. `process.env.EMAIL_FROM_ADDRESS`. |
| Configuration / Env Var | `fromName` | e.g. `process.env.EMAIL_FROM_NAME`. |
| `campaign.global_cc` | `cc` | Split by comma, trimmed, validated by regex. |
| `campaign.global_bcc` | `bcc` | Split by comma, trimmed, validated by regex. |
| `attachments` + `recipient.attachment_path` | `attachments` | Downloaded to buffer, base64-encoded via `downloadAttachment()`. |
| Provider response `messageId` | `recipients.provider_message_id` | Save to recipient record upon successful dispatch. |
| Provider error `message` | `recipients.error_message` | Save to recipient record upon dispatch error. |

---

## 15. Unknown / Needs Confirmation

The following items cannot be determined from the repository and must be confirmed directly by the external email API vendor:

- [ ] **Provider Base URL**: Production endpoint URL.
- [ ] **API Key**: Provisioned production API key.
- [ ] **Send Endpoint**: Exact path for the POST request (e.g., `/v1/send`, `/v1/emails`, `/v1/messages`).
- [ ] **Authentication Header Scheme**: `Bearer <key>`, `X-Api-Key: <key>`, or Basic auth.
- [ ] **Exact Request Payload Field Names**: Confirmation of key names (`body` vs `text`, `htmlBody` vs `html`, `attachments[].contentBytes` vs `content`).
- [ ] **From Domain DNS Verification Status**: Active SPF, DKIM, and DMARC verification for `outreach@ourdomain.com`.
- [ ] **Sandbox / Test Key**: Test credentials and test recipient behavior.
- [ ] **Message ID Response Schema**: Exact JSON key used for message tracking (e.g., `messageId`, `id`, `message_id`).
- [ ] **Error Payload Schema & Error Codes**: Exact error schema format and HTTP status mapping.
- [ ] **Provider Rate Limits & Burst Thresholds**: Global requests per second (RPS) and concurrent connection limits enforced on the account.
- [ ] **Attachment Limits**: Maximum single attachment size, total payload size (e.g., 10MB vs 25MB), and disallowed file types.
- [ ] **API Documentation / OpenAPI Specification**: Official documentation link or spec file.
