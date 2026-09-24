# Mailcraft Email API — Phase 0: Deep Technical Analysis

## 1. Executive Summary & Target Architecture

This analysis establishes the architectural foundation for enabling an external application, **LeadForge**, to utilize **Mailcraft** as a dedicated REST email-sending service backed by Mailcraft's existing Microsoft Graph integration.

### Target System Architecture

```
LeadForge Application
        │
        │ HTTP POST /api/v1/send (or /api/send)
        │ Headers: Authorization: Bearer <LEADFORGE_API_KEY>
        │ Payload: { to, subject, htmlBody, body, cc, bcc, attachments }
        ▼
Mailcraft REST Email API Route Handler
  ├─ API Key & Permission Verification (Timing-safe token validation)
  ├─ Tenant / Sender Mailbox Resolution (Maps to active Microsoft 365 connection)
  └─ Payload Validation (Schema, email syntax, MIME types, size limits)
        │
        ▼
Mailcraft Reusable Dispatch Core (lib/email/send-direct.ts or adapted sendEmail)
  ├─ Resolves valid Microsoft Graph Client (with single-flight OAuth token refresh)
  ├─ Mailbox-level Micro-Pacing (MIN_MAILBOX_REQUEST_INTERVAL_MS = 150ms)
  ├─ Mailbox Cooldown & Throttling Evaluation (HTTP 429/503 Retry-After handler)
  ├─ Image & Attachment Handling (Base64 buffers, MIME types)
  └─ Graph Payload Assembly ({ message, saveToSentItems: true })
        │
        ▼
Microsoft Graph API (POST https://graph.microsoft.com/v1.0/me/sendMail)
        │
        ▼
Target Recipient Mailbox
```

---

## 2. Current Architecture & Exact Relevant Files

The existing email dispatch pipeline in Mailcraft is structured across the following core modules:

| Component | File Path | Function / Responsibility |
|---|---|---|
| **Campaign Trigger UI** | [`app/campaign/[id]/page.tsx`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/campaign/[id]/page.tsx) | `handleSend()` triggers campaign dispatch via `POST /api/campaigns/${id}/send`. |
| **Send Trigger Route** | [`app/api/campaigns/[id]/send/route.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/send/route.ts) | Verifies Supabase session, checks campaign ownership, runs pre-flight Microsoft authorization, sets status to `'sending'`, starts background worker. |
| **Batch Processing Route** | [`app/api/campaigns/[id]/process-batch/route.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/campaigns/[id]/process-batch/route.ts) | Triggers or continues batch processor; supports cookie session or `x-internal-token: SUPABASE_SECRET_KEY`. |
| **Campaign Processor** | [`lib/campaign/processor.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts) | `startCampaignProcessor()`, `runCampaignLoop()`: Manages batch queries (`batchSize = 10`), atomic claims (`status: 'sending'`), rate limiter delays, and retry transitions (`pending` → `failed` after 3 tries). |
| **Rate Limiting Engine** | [`lib/campaign/rate-limiter.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/rate-limiter.ts) | `CampaignRateLimiter`: Sliding 1-minute window with smoothed intervals (`Math.floor(60_000 / rateLimit)` ms). |
| **Email Construction & Dispatch** | [`lib/email/send.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts) | `sendEmail()`: Low-level dispatcher. Handles template rendering, attachment downloading, inline image conversion, throttling cooldowns, token refresh retries, and calls `graphClient.api("/me/sendMail").post()`. |
| **Template Compiler** | [`lib/email/template.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/template.ts) | `renderTemplate()`, `compileTemplate()`, `autoLinkHtml()`: Compiles Markdown/plain-text into corporate HTML with blue underlined links (`#0066cc`) and escapes placeholders. |
| **DOCX Converter** | [`lib/docx-to-html.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/docx-to-html.ts) | `docxToHtml()`: Parses Word document XML, hierarchical numbered/bullet lists, tables, and images. |
| **Graph Client & Tokens** | [`lib/graph/client.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/client.ts) | `createGraphClient()`, `getValidAccessToken()`: Manages dynamic token refresh, mutexes (`activeRefreshes`), and client initialization. |
| **Graph Throttling Safety** | [`lib/graph/throttling.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/throttling.ts) | `isGraph401()`, `isGraphThrottled()`, `extractRetryAfterSeconds()`, `setMailboxThrottledUntil()`, `getMailboxThrottledUntil()`: Coordinates mailbox-level backoffs for HTTP 429/503/504 responses. |

---

## 3. Current Email Sending Flow vs. Lowest-Level Reusable Function

### Current Execution Trace
1. **User Interaction**: User clicks "Send" in [`app/campaign/[id]/page.tsx`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/campaign/[id]/page.tsx).
2. **Route Entry**: `POST /api/campaigns/[id]/send` validates the user's Supabase session and campaign record.
3. **Background Worker**: `startCampaignProcessor(campaignId)` spins off an independent, detached asynchronous worker `runCampaignLoop()`.
4. **Batch & Atomic Claiming**:
   * Slices 10 pending recipients (`limit(10)` where `status = 'pending'`).
   * Executes atomic locking: `UPDATE recipients SET status='sending' WHERE id = ... AND status = 'pending'`.
5. **Pacing**:
   * Evaluates per-campaign rate limiter (`rateLimiter.waitForNextSend()`).
   * Enforces per-mailbox micro-pacing (`MIN_MAILBOX_REQUEST_INTERVAL_MS = 150ms`).
6. **Dispatch Execution**:
   * Calls `sendEmail({ campaign, recipient, globalAttachments, supabase })`.
7. **Result Persistence**:
   * On success: Updates recipient `status: 'sent'`, sets `sent_at`, calls `rateLimiter.recordSend()`.
   * On failure: Increments `retry_count`; re-queues as `'pending'` if `< 3`, or marks as `'failed'` if `retry_count >= 3`.

### Identification of the Lowest-Level Reusable Function

Currently, [`lib/email/send.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts#L64) contains `sendEmail()`:
```typescript
interface SendEmailParams {
  campaign: Campaign;
  recipient: Recipient;
  globalAttachments: Attachment[];
  supabase?: SupabaseClient;
}

export async function sendEmail({ campaign, recipient, globalAttachments, supabase }: SendEmailParams)
```

#### Architectural Limitation of Current `sendEmail`
`sendEmail()` is tightly coupled to campaign database entities:
* Requires a full `Campaign` object (`campaign.user_id`, `campaign.subject_template`, `campaign.body_template`, `campaign.global_cc`, `campaign.global_bcc`).
* Requires a `Recipient` object (`recipient.email`, `recipient.data`, `recipient.attachment_path`).

#### Proposed Reusable Function Core
To support LeadForge without affecting bulk campaigns, Mailcraft requires a clean, lower-level primitive (e.g. `sendDirectEmail` in `lib/email/send-direct.ts` or as an exported primitive in `lib/email/send.ts`):
```typescript
export interface DirectEmailPayload {
  userId: string; // The Mailcraft account owning the Microsoft 365 token
  to: string;
  subject: string;
  htmlBody: string;
  body?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    name: string;
    contentType: string;
    contentBytes: string; // base64
  }>;
}
```
This function will reuse:
1. `createGraphClient(userId)` for token validation and single-flight refresh.
2. `getMailboxThrottledUntil(userId)` and `setMailboxThrottledUntil(userId)` for rate-limit cooldowns.
3. Throttling / 401 retry loops (`isGraph401`, `isGraphThrottled`).
4. Microsoft Graph payload construction.

---

## 4. Existing API Routes Analysis

Inspection of `app/api/` reveals the following route landscape:

1. **`POST /api/campaigns/[id]/send`**:
   * **Scope**: Strictly internal to Mailcraft campaigns.
   * **Authentication**: Cookie session (`supabase.auth.getUser()`).
   * **Payload**: None. Operates on existing database rows.
   * **External Reusability**: **Not reusable** by LeadForge.
2. **`POST /api/campaigns/[id]/process-batch`**:
   * **Scope**: Internal batch processing trigger.
   * **Authentication**: Cookie session OR internal secret token (`x-internal-token: SUPABASE_SECRET_KEY`).
   * **External Reusability**: **Not reusable** for single/direct email dispatch.
3. **`POST /api/campaigns/[id]/retry`**:
   * **Scope**: Resets failed recipients in an existing campaign.
   * **External Reusability**: **Not reusable**.
4. **`POST /api/upload`**:
   * **Scope**: Uploads campaign attachments to Supabase Storage.
   * **External Reusability**: Internal utility.
5. **Generic Email-Sending Endpoint**:
   * **CRITICAL FINDING**: **No generic or standalone email-sending API route currently exists in Mailcraft.**

---

## 5. Microsoft Graph Integration Deep Dive

### 1. Token Acquisition & OAuth Lifecycle
* **Protocol**: Microsoft OAuth 2.0 Authorization Code flow with PKCE (`Mail.Send`, `offline_access`, `User.Read`).
* **Initiation Route**: [`app/api/auth/microsoft/route.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/auth/microsoft/route.ts) generates `code_verifier`, `code_challenge` (SHA-256), and state cookies.
* **Callback Route**: [`app/api/auth/callback/route.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/auth/callback/route.ts) exchanges the authorization code at `https://login.microsoftonline.com/common/oauth2/v2.0/token`.
* **Storage**: Tokens are stored in the Supabase table `microsoft_tokens`:
  * `user_id` (UUID, Unique foreign key to `auth.users`)
  * `access_token` (Text)
  * `refresh_token` (Text)
  * `expires_at` (TIMESTAMPTZ)
  * `microsoft_email` (Text)

### 2. Token Refresh Logic
Implemented in [`lib/graph/client.ts:80-132`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/client.ts#L80-L132) (`getValidAccessToken`):
* **Proactive Refresh**: If token expires within 5 minutes (`TOKEN_REFRESH_BUFFER_SECONDS = 300`), it triggers a refresh.
* **Concurrency Mutex (`activeRefreshes`)**:
  ```typescript
  if (activeRefreshes.has(userId)) {
    return await activeRefreshes.get(userId)!;
  }
  ```
  Prevents race conditions when multiple parallel threads need a fresh token simultaneously.
* **Database Persistence**: Updates `microsoft_tokens` with the new access and refresh tokens.

### 3. Exact Function Calling Microsoft Graph `sendMail`
In [`lib/email/send.ts:170`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts#L170):
```typescript
await graphClient.api("/me/sendMail").post({ message, saveToSentItems: true });
```

### 4. How the Sender Email is Determined
* In Microsoft Graph `/me/sendMail`, the sender address is **implicitly determined** by the authenticated user principal.
* The email address associated with the token is recorded in `microsoft_tokens.microsoft_email`.
* **LeadForge Implication**: LeadForge cannot supply an arbitrary `from` address that differs from the connected Microsoft 365 mailbox unless delegated/shared mailbox permissions (`SendAs` / `SendOnBehalfOf`) are explicitly configured in Microsoft 365 Exchange.

### 5. HTML Email Handling
* In `sendEmail`:
  ```typescript
  message.body = { contentType: "HTML", content: body };
  ```
* Base64 inline images (`<img src="data:image/...;base64,...">`) are parsed, uploaded to Supabase Storage bucket `mailcraft`, and replaced with public URLs because major email clients (e.g. Gmail) block inline base64 image strings.

---

## 6. Existing Email Data Model & Capabilities

| Field | Supported in Code? | Format / Type | Notes |
|---|---|---|---|
| **`to`** | **YES** | `string` | Single email address per dispatch. |
| **`from`** | **IMPLICIT** | `string` | Controlled by the Microsoft 365 token; not explicitly passed in payload. |
| **`fromName`** | **IMPLICIT** | `string` | Managed by Microsoft 365 account display name. |
| **`subject`** | **YES** | `string` | Subject line string. |
| **`body`** | **YES** | `string` | Plain-text content fallback. |
| **`htmlBody`** | **YES** | `string` | Full HTML document snippet. |
| **`cc`** | **YES** | `string[]` | Comma-separated in campaign, mapped to `message.ccRecipients`. |
| **`bcc`** | **YES** | `string[]` | Comma-separated in campaign, mapped to `message.bccRecipients`. |
| **`attachments`** | **YES** | `object[]` | Array of `{ name, contentType, contentBytes }` (base64). |
| **`replyTo`** | **NO** | N/A | Not implemented in current schema or Graph payload. |

---

## 7. Authentication & Security Architecture

### Current Authentication Paradigms in Mailcraft
1. **User Interactive Sessions**: Next.js Server Components and Route Handlers use `@supabase/ssr` to read JWT session cookies (`supabase.auth.getUser()`).
2. **Internal API Triggers**: `app/api/campaigns/[id]/process-batch/route.ts` implements an internal token check:
   ```typescript
   const internalToken = req.headers.get("x-internal-token");
   const isInternal = Boolean(process.env.SUPABASE_SECRET_KEY) && internalToken === process.env.SUPABASE_SECRET_KEY;
   ```
   If verified, it initializes the Supabase admin client (`createAdminClient()`).

### Safest Authentication Pattern for External LeadForge Requests

To allow LeadForge to authenticate securely against Mailcraft without relying on interactive browser sessions:

1. **Dedicated API Key Variable**:
   Define `LEADFORGE_API_KEY` (or `MAILCRAFT_API_KEY`) in server-side environment variables.
2. **Header Specification**:
   LeadForge supplies:
   `Authorization: Bearer <LEADFORGE_API_KEY>` or `X-API-Key: <LEADFORGE_API_KEY>`.
3. **Constant-Time Comparison**:
   Use `crypto.timingSafeEqual` to validate the incoming key against `process.env.LEADFORGE_API_KEY` to prevent timing attacks:
   ```typescript
   function validateApiKey(providedKey: string | null): boolean {
     const secret = process.env.LEADFORGE_API_KEY;
     if (!secret || !providedKey) return false;
     const secretBuffer = Buffer.from(secret);
     const providedBuffer = Buffer.from(providedKey);
     if (secretBuffer.length !== providedBuffer.length) return false;
     return crypto.timingSafeEqual(secretBuffer, providedBuffer);
   }
   ```
4. **Sender Mailbox Mapping / User Context**:
   Because Microsoft Graph tokens are stored per Mailcraft `user_id`, the API must resolve which mailbox to send from:
   * **Strategy A (Dedicated Environment Default)**: Configure `DEFAULT_SENDER_USER_ID=<UUID>` in environment variables representing the primary connected Outlook mailbox.
   * **Strategy B (Tenant / Mailbox Header)**: Allow LeadForge to specify `X-Sender-Email: sales@company.com`, which Mailcraft looks up in `microsoft_tokens.microsoft_email` to resolve the appropriate `user_id`.

---

## 8. Error Handling & Provider Resilience

Mailcraft's existing error handling architecture in [`lib/email/send.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts) and [`lib/graph/throttling.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/throttling.ts) can be directly reused for the LeadForge API:

```
                      Dispatch to Microsoft Graph
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
      Success                                           Exception
   (HTTP 202)                                              │
         │                                ┌────────────────┴────────────────┐
         ▼                                ▼                                 ▼
   Return 200 OK                     401 Unauthorized             429 / 503 / 504 Throttled
   { success: true }                      │                                 │
                                   Attempt === 1?                     Attempt <= 3?
                                   ├─ Yes: Refresh token & retry     ├─ Yes: Extract Retry-After
                                   └─ No: Return 401 Auth Error       │       Set mailbox cooldown
                                                                      │       Wait & retry
                                                                      └─ No: Return 429 / 503 Error
```

* **401 Unauthorized**: Handled automatically. If the access token expired mid-request, Mailcraft forces an immediate refresh and retries once (`attempt === 1`).
* **429 Too Many Requests / 503 Service Unavailable**: Handled automatically. Parses `Retry-After` header (up to 300s), sets mailbox cooldown via `setMailboxThrottledUntil()`, and retries up to 3 times.
* **Invalid Recipient (400 / 422)**: Graph throws `ErrorInvalidRecipients` or validation failure; caught and returned immediately to caller as a non-retryable 400 error.
* **Provider Outage (500 / 504)**: Retried up to 3 times before returning a structured 500 error to LeadForge.

---

## 9. Rate Limiting Analysis

### Existing Mechanism
* Mailcraft uses `CampaignRateLimiter` (`lib/campaign/rate-limiter.ts`) which is **scoped to bulk campaigns**.
* Each campaign manages an internal queue to smooth dispatches across a 60-second window (e.g. 20 emails/min = 3,000ms delay between emails).
* Additionally, `paceMailboxRequest(userId)` enforces a minimum interval of **150ms** between calls to the same mailbox.

### Requirements for LeadForge API
* An incoming REST API call is synchronous and on-demand.
* **Risk**: If LeadForge fires 50 concurrent requests simultaneously, it would bypass campaign-level rate limiters and trigger Microsoft Graph's concurrency limit (`MailboxConcurrencyLimitExceeded`).
* **Solution**:
  1. Re-use `paceMailboxRequest(userId)` to ensure requests do not hit the socket simultaneously.
  2. Respect `getMailboxThrottledUntil(userId)`: If Microsoft has throttled the mailbox, the API route should return `HTTP 429 Too Many Requests` with the exact `Retry-After` header so LeadForge can back off.
  3. Optional: Add a simple token-bucket or sliding-window rate limiter on the `/api/v1/send` route (e.g. 30 requests/minute per API key).

---

## 10. Message ID Analysis

* **Microsoft Graph Behavior**:
  * The current call:
    `await graphClient.api("/me/sendMail").post({ message, saveToSentItems: true })`
    returns **HTTP 202 Accepted with an empty body (`{}`)**.
  * **Microsoft Graph does NOT return a message ID via `/me/sendMail`.**
* **Database State**:
  * Neither `recipients` nor `campaigns` has a `message_id` column.
* **Recommendation for LeadForge**:
  * Mailcraft can generate and return a unique tracking identifier (e.g. `mc_msg_01JK89ABCDEF...`).
  * If LeadForge strictly requires the native Microsoft Internet Message ID, the dispatch flow would need to be rewritten to:
    1. Create a draft: `POST /me/messages` (returns message object with `id`).
    2. Send the draft: `POST /me/messages/{id}/send`.
    *(Note: Two-step draft creation adds ~200-400ms latency per email and is not recommended unless native Outlook message IDs are mandatory).*

---

## 11. Deployment & Environment

* **Framework**: Next.js 16 (App Router), Node.js runtime.
* **Current Environment Variables**:
  * `MICROSOFT_CLIENT_ID` (OAuth client ID)
  * `MICROSOFT_CLIENT_SECRET` (OAuth client secret)
  * `MICROSOFT_TENANT_ID` (`common` or specific tenant)
  * `NEXT_PUBLIC_APP_URL` (`http://localhost:3000` locally, production domain in deployment)
  * `NEXT_PUBLIC_SUPABASE_URL`
  * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  * `SUPABASE_SECRET_KEY`
* **Production Base URL Source**:
  * Configured via `process.env.NEXT_PUBLIC_APP_URL` or derived from request headers (`x-forwarded-host`, `host`).

---

## 12. Database Assessment

### Does the integration require modifying existing tables?
* **NO**. Existing tables (`campaigns`, `recipients`, `attachments`, `microsoft_tokens`) remain 100% untouched.

### Recommended Optional Additions
For auditability and delivery tracking of LeadForge dispatches:
* A new standalone table `external_email_logs`:
  * `id` (`UUID`, Primary Key)
  * `user_id` (`UUID`, References auth user whose mailbox was used)
  * `source` (`TEXT`, e.g. `'leadforge'`)
  * `to_address` (`TEXT`)
  * `subject` (`TEXT`)
  * `status` (`TEXT`, `'sent'` | `'failed'`)
  * `error_message` (`TEXT`)
  * `created_at` (`TIMESTAMPTZ`)
*(Can be implemented without affecting any existing campaign workflows).*

---

## 13. Existing Test Suites & Quality Assurance

Mailcraft has an extensive verification suite in `scripts/` that must remain green:

| Test Script | Target System |
|---|---|
| [`scripts/master-regression.mjs`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/scripts/master-regression.mjs) | Master regression harness covering 12 integration scenarios. |
| [`scripts/verify-batch-processing.mjs`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/scripts/verify-batch-processing.mjs) | Campaign processor batching, atomic claiming, and completion states. |
| [`scripts/verify-independent-rate-limiting.mjs`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/scripts/verify-independent-rate-limiting.mjs) | Pacing, sliding windows, and concurrent campaign independence. |
| [`scripts/verify-concurrent-campaigns.mjs`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/scripts/verify-concurrent-campaigns.mjs) | Parallel background workers on separate campaigns. |
| [`scripts/verify-microsoft-auth.mjs`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/scripts/verify-microsoft-auth.mjs) | Proactive token refresh, OAuth expiry calculation, single-flight mutex. |
| [`scripts/verify-template-compilation.mjs`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/scripts/verify-template-compilation.mjs) | Template placeholder interpolation and HTML sanitization. |
| [`scripts/verify-docx-lists-exact.mjs`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/scripts/verify-docx-lists-exact.mjs) | Nested multi-level DOCX list parsing. |

**Requirement**: Adding the LeadForge REST API route must not alter any shared behavior in `lib/email/template.ts`, `lib/campaign/processor.ts`, or `lib/campaign/rate-limiter.ts`.

---

## 14. Proposed REST API Architecture for LeadForge

### Endpoint Design
* **Route**: `POST /api/v1/email/send` (or `POST /api/send`)
* **Headers**:
  ```http
  Authorization: Bearer <LEADFORGE_API_KEY>
  Content-Type: application/json
  ```
* **Request Payload**:
  ```json
  {
    "to": "recipient@company.com",
    "subject": "Introductory meeting",
    "htmlBody": "<p style=\"margin: 0 0 12px 0;\">Hello Alex,</p>",
    "body": "Hello Alex,",
    "cc": ["team@ourdomain.com"],
    "bcc": ["archive@ourdomain.com"],
    "attachments": [
      {
        "name": "Deck.pdf",
        "contentType": "application/pdf",
        "contentBytes": "base64_encoded_content=="
      }
    ]
  }
  ```
* **Success Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "messageId": "mc_msg_01JK89ABCDEF123456",
    "sender": "outreach@ourdomain.com",
    "timestamp": "2026-09-23T22:15:00.000Z"
  }
  ```
* **Error Response (HTTP 4xx / 5xx)**:
  ```json
  {
    "success": false,
    "error": "Human-readable error description",
    "code": "INVALID_RECIPIENT",
    "retryable": false
  }
  ```

---

## 15. Risks & Mitigation Strategies

1. **Risk: Microsoft 365 Mailbox Throttling (HTTP 429)**
   * *Cause*: LeadForge sending bursts of emails faster than Microsoft allows (~30 messages/minute per mailbox).
   * *Mitigation*: Respect `getMailboxThrottledUntil()`; return 429 with `Retry-After` to LeadForge; apply micro-pacing (150ms).
2. **Risk: Missing Sender Context**
   * *Cause*: LeadForge does not have a user session cookie.
   * *Mitigation*: Configure `DEFAULT_SENDER_USER_ID` in `.env.local`, or support an `X-Sender-Email` header mapped to `microsoft_tokens`.
3. **Risk: API Key Exposure**
   * *Cause*: Insecure handling or client-side leakage.
   * *Mitigation*: Store key strictly in server environment variable `LEADFORGE_API_KEY` (no `NEXT_PUBLIC_` prefix); validate via `crypto.timingSafeEqual`.
4. **Risk: Regression of Bulk Campaign System**
   * *Cause*: Modifying `lib/email/send.ts` or `lib/campaign/processor.ts` directly.
   * *Mitigation*: Create a decoupled helper `lib/email/send-direct.ts` that reuses low-level Graph utilities without touching the campaign worker loop.

---

## 16. Questions & Blockers for Implementation

1. **Sender Mailbox Mapping**:
   * Does LeadForge send exclusively through a single default Microsoft 365 account, or must it dynamically select between multiple connected mailboxes?
2. **Message ID Requirement**:
   * Is a Mailcraft-generated unique UUID sufficient for LeadForge tracking, or is the native Microsoft Graph Internet Message ID strictly required (which would require the slower draft-then-send two-step flow)?
3. **Audit Logging**:
   * Should dispatches from LeadForge be recorded in a new Supabase table (e.g. `external_email_logs`), or should dispatches remain stateless in-memory?
