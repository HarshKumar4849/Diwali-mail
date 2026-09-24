# Mailcraft Email Sending Details

## Quick Summary

* **Provider**: Microsoft 365 / Outlook (via Microsoft Graph API)
* **Base URL**: `NOT FOUND — needs to be obtained from the person who deployed/hosts the service.` (Local default: `http://localhost:3000`)
* **Send Endpoint**: `Mailcraft currently does not expose a standalone email-sending REST API.`
* **Authentication**: Microsoft OAuth 2.0 (Server-side stored tokens in `microsoft_tokens` table) + Supabase Session Auth
* **Message ID**: `No message ID is currently returned.`
* **Sandbox/Test**: `NO` (Sends live emails through connected Microsoft account)
* **From Domain**: Determined dynamically by the connected Microsoft 365 user account (`microsoft_tokens.microsoft_email`); not statically configured in codebase.

---

## Exact Information Available

### 1. Current Email Sending System
* **Provider**: Microsoft 365 / Outlook.
* **Technology / SDK**: `@microsoft/microsoft-graph-client` (v3.0.7), using `Client.initWithMiddleware`.
* **API / Endpoint Called**: `https://graph.microsoft.com/v1.0/me/sendMail` (HTTP POST).
* **Execution File & Function**:
  * File: [`lib/email/send.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts)
  * Function: `sendEmail({ campaign, recipient, globalAttachments, supabase })`
* **Standalone REST API Status**:
  > **Mailcraft currently does not expose a standalone email-sending REST API.**
  > Mailcraft is an internal campaign execution system. It does not have an open or token-authenticated REST endpoint designed for external applications to trigger arbitrary email dispatches.

---

### 2. Base URL
* **Repository & Config Inspection**:
  * `.env.local.example`: `NEXT_PUBLIC_APP_URL=http://localhost:3000`
  * Application Code ([`app/api/auth/callback/route.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/auth/callback/route.ts)):
    `const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");`
* **Production Deployed Base URL**:
  > **NOT FOUND — needs to be obtained from the person who deployed/hosts the service.**
  > The repository only contains localhost fallbacks. The live production domain (e.g. Vercel or custom domain) is configured in the production host environment.

---

### 3. Send Endpoint

Mailcraft only has an **internal campaign trigger route**:

* **HTTP Method**: `POST`
* **Path**: `/api/campaigns/[id]/send` (and `/api/campaigns/[id]/process-batch`)
* **Authentication Required**:
  * Active Supabase user cookie session (`supabase.auth.getUser()`).
  * User must be the owner of the campaign (`campaign.user_id === user.id`).
  * User must have an active, valid Microsoft 365 OAuth connection in `microsoft_tokens`.
* **Request Body**: None (the campaign ID is passed via URL path parameters).
* **Response Format**:
  ```json
  { "status": "sending" }
  ```
* **External Application Suitability**:
  > **CRITICAL**: This endpoint is strictly an internal Mailcraft route. It cannot be used by external applications to send emails because it does not accept ad-hoc email payloads (to, subject, body). It only starts processing an existing campaign that was previously created and populated in the Mailcraft Supabase database.

---

### 4. Email Request Data

Data structure constructed internally by `lib/email/send.ts` and passed to Microsoft Graph:

| Field | Classification | Data Type | Source in Mailcraft |
|---|---|---|---|
| **`to`** | **REQUIRED** | `string` (email) | Sourced from `recipients.email` (CSV/Excel upload column). |
| **`from`** | **REQUIRED** | `string` (email) | Derived implicitly from the authenticated Microsoft 365 mailbox (`/me/sendMail`). |
| **`fromName`** | **NOT USED (Implicit)** | `string` | Managed by Microsoft 365 account profile; not passed in payload. |
| **`subject`** | **REQUIRED** | `string` | Compiled from `campaigns.subject_template` with `{{placeholder}}` replacements. |
| **`body`** | **REQUIRED** | `string` | Plain-text fallback for non-HTML email clients. |
| **`htmlBody`** | **REQUIRED** | `string` (HTML) | Rich HTML compiled via `compileTemplate()` with inline styles and hosted image URLs. |
| **`cc`** | **OPTIONAL** | `array` of `string` emails | Sourced from `campaigns.global_cc`. Filtered by email regex. |
| **`bcc`** | **OPTIONAL** | `array` of `string` emails | Sourced from `campaigns.global_bcc`. Filtered by email regex. |
| **`attachments`** | **OPTIONAL** | `array` of `object` | Global attachments (`attachments` table) + Per-recipient attachment (`recipients.attachment_path`). |
| **`replyTo`** | **NOT USED** | N/A | Not implemented. |

---

### 5. Success Response

* **Microsoft Graph Response**:
  * **HTTP Status**: `202 Accepted`
  * **Response Body**: Empty body (`{}`)
  * **Success Indicator**: Resolution of promise without HTTP error code.
* **Message ID Status**:
  > **No message ID is currently returned.**
  > Microsoft Graph `/me/sendMail` does not return a message ID in its 202 response. Neither the `recipients` table nor the `campaigns` table possesses a `message_id` column.

---

### 6. Error Response

Mailcraft does not expose a public REST error schema for sending. Internally, errors are handled as follows:

* **Authentication Failure (`401 Unauthorized`)**:
  * Detected via `isGraph401()` in [`lib/graph/throttling.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/throttling.ts).
  * Triggers automatic single-flight OAuth token refresh and retries the send once (`lib/email/send.ts:173-184`).
  * If refresh fails, campaign aborts and reverts to status `'draft'`.
* **Rate Limiting / Throttling (`429 Too Many Requests` / `503 Service Unavailable`)**:
  * Detected via `isGraphThrottled()`.
  * Extracts `Retry-After` header value (capped at 300s).
  * Pauses the mailbox cooldown timestamp (`setMailboxThrottledUntil`).
  * Retries up to 3 times before failing (`lib/email/send.ts:186-197`).
* **Recipient / Sending Failure**:
  * Caught in loop ([`lib/campaign/processor.ts:236-250`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts#L236-L250)).
  * Increments `recipients.retry_count`.
  * If `retry_count < 3`: Re-queued as `status: 'pending'`.
  * If `retry_count >= 3`: Marked as `status: 'failed'`, with human-readable error saved to `recipients.error_message`.

---

### 7. Authentication

* **Email Sending Authentication**: Microsoft OAuth 2.0 (Delegated permissions: `Mail.Send`, `offline_access`, `User.Read`).
* **Environment Variables (NAMES ONLY — NO SECRETS)**:
  * `MICROSOFT_CLIENT_ID` = EXISTS (configured)
  * `MICROSOFT_CLIENT_SECRET` = EXISTS (configured)
  * `MICROSOFT_TENANT_ID` = EXISTS (configured, default: `common`)
  * `NEXT_PUBLIC_SUPABASE_URL` = EXISTS (configured)
  * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = EXISTS (configured)
  * `SUPABASE_SECRET_KEY` = EXISTS (configured)
* **Where Authentication Happens**:
  * Server-side only in [`lib/graph/client.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/client.ts) (`getValidAccessToken`) and [`app/api/auth/callback/route.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/auth/callback/route.ts). Tokens are persisted in the database table `microsoft_tokens`.

---

### 8. From Address / Domain

* **Sender Address Determination**:
  * Mailcraft uses the Microsoft email address returned during OAuth authorization:
    `microsoft_tokens.microsoft_email` (queried from `https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName`).
* **Sender Configurable**: No. The sender cannot be arbitrarily customized in campaign settings; it is tied to the logged-in Microsoft 365 account.
* **Sending Domain**:
  * **Cannot be determined from the codebase.** It is determined at runtime by whichever Microsoft 365 account is connected in Settings.
* **Domain Verification**:
  * Handled entirely within the user's Microsoft 365 / Entra ID tenant (via DNS records for Exchange Online).

---

### 9. Bulk Email Capability

Extracted directly from [`lib/campaign/processor.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts) and [`lib/campaign/rate-limiter.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/rate-limiter.ts):

* **Batch Size**: `10` recipients fetched per database query (`batchSize = 10`).
* **Dispatch Mode**: Sequential individual emails (each recipient is sent one-by-one).
* **Default Rate**: `20` emails/minute (in wizard UI & processor; SQL migration default is `10`).
* **Minimum Rate**: `1` email/minute.
* **Maximum Rate**: `100` emails/minute.
* **Pacing Interval**: `Math.floor(60_000 / rateLimit)` ms between sends (e.g. 3,000 ms at 20/min).
* **Mailbox Micro-Pacing**: Minimum `150 ms` between requests to prevent socket flooding.
* **Concurrent Campaigns**: Supported. Each campaign runs independently in background tasks tracked in `activeProcessors = new Set<string>()`.
* **Retry Behavior**: `3` attempts per recipient before permanently marking as `'failed'`.
* **Duplicate Protection**: Atomic database claim (`UPDATE recipients SET status='sending' WHERE id=... AND status='pending'`).
* **Stuck-Job Recovery**: Automatically reclaims stuck `'sending'` recipients back to `'pending'` after 2 consecutive empty checks.
* **CC / BCC**: Supports `global_cc` and `global_bcc` across all emails in a campaign.
* **Attachments**: Supports global attachments and per-recipient attachment URLs/paths.

---

### 10. Test / Sandbox

* **Sandbox / Test Available**: **`NO`**
* **Findings**:
  * No sandbox mode, mock provider, or test email endpoint exists in the repository.
  * Any campaign launched executes live sends through the connected Microsoft 365 mailbox.

---

### 11. Documentation

Relevant documentation files found in repository:

* **System Design Spec**: [`docs/superpowers/specs/2026-07-14-mailcraft-design.md`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/docs/superpowers/specs/2026-07-14-mailcraft-design.md)
* **Architecture Implementation Plan**: [`docs/superpowers/plans/2026-07-14-mailcraft-plan.md`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/docs/superpowers/plans/2026-07-14-mailcraft-plan.md)
* **Throttling & Concurrency Audit Plan**: [`docs/superpowers/plans/2026-07-15-fix-audit-issues.md`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/docs/superpowers/plans/2026-07-15-fix-audit-issues.md)
* **General Readme**: [`README.md`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/README.md)
* **External API / OpenAPI Documentation**: None exists (no public API is exposed).

---

## Information Not Available

The following information **cannot be found in the Mailcraft codebase** and must be provided by the host/deployment administrator or the external email provider:

1. **Production Base URL**: The deployed public domain (e.g. `https://mailcraft.yourdomain.com`).
2. **Public REST Send Endpoint**: Mailcraft has no standalone REST endpoint for third-party email sending.
3. **Public API Key**: No API key mechanism currently exists for inbound email-sending requests.
4. **Sending Domain**: The specific domain used depends on which Microsoft 365 mailbox is authenticated at runtime.
5. **Provider Message ID**: Microsoft Graph does not return a message ID for sent mail.
6. **Sandbox / Test Environment**: No test environment or mock email sinkhole is configured in the codebase.
