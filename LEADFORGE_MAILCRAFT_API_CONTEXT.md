# LeadForge ↔ Mailcraft REST API Integration — Context & Decisions Summary

**Document Purpose:** Complete technical retrieval and summary of all architectural decisions, requirements, constraints, and execution plans agreed upon for the Mailcraft External Campaign REST API integration with LeadForge.  
**Repository:** `Tecmotiv-Solutions/mailcraft`  
**Target Branch:** `deploy/v1-docx-list-fix`  
**Status:** Verification & Audit Complete; Handover & Deployment Ready  

---

## 1. Why LeadForge Needs the Mailcraft API

* **Core Business Need:** LeadForge is an outbound sales and lead generation automation platform that identifies prospects and generates personalized cold outreach emails.
* **Corporate Deliverability via Microsoft 365:** LeadForge requires emails to be dispatched directly through verified corporate Microsoft 365 Outlook mailboxes (`/me/sendMail`) so that:
  - Outreach emails inherit corporate domain SPF, DKIM, and DMARC reputations, avoiding spam filters.
  - Sent emails appear natively in each sales representative's real Outlook **"Sent Items"** folder.
  - Prospect replies are delivered directly back to the sales representative's real Outlook inbox.
* **Separation of Concerns:** Instead of LeadForge building and maintaining its own Microsoft Entra ID app registrations, OAuth token refresh pipelines, rate-limiting queues, socket throttling, and retry mechanisms, it delegates email delivery to Mailcraft by submitting email batches to Mailcraft's REST API.

---

## 2. Expected System Architecture

The end-to-end processing pipeline executes as follows:

```
LeadForge Application
        │
        │ HTTP POST /api/external/campaigns
        │ Headers:
        │   Authorization: Bearer <LEADFORGE_API_KEY>
        │   Idempotency-Key: <unique-job-id>
        │ Payload:
        │   {
        │     "campaignName": "...",
        │     "emails": [ { "to": "...", "from": "...", "subject": "...", "body": "..." }, ... ]
        │   }
        ▼
Mailcraft External API Route (POST /api/external/campaigns)
  ├─ 1. Authenticate Request (Timing-safe Bearer API key check)
  ├─ 2. Idempotency Check (24-hour cache/lookup via Idempotency-Key header)
  ├─ 3. All-or-Nothing Payload Validation (Array bounds, email syntax, non-empty fields)
  ├─ 4. Sender Verification (Maps `from` -> connected `microsoft_tokens.user_id`)
  ├─ 5. Pre-flight Token Health Check (Verifies Microsoft 365 OAuth token is active)
  ├─ 6. Insert Campaign Row (`campaigns` table via Supabase admin client, status: 'sending')
  ├─ 7. Bulk Insert Recipient Rows (`recipients` table via Supabase admin client, status: 'pending')
  ├─ 8. Trigger Background Processor (`startCampaignProcessor(campaign.id, adminDb)`)
  └─ 9. Synchronous Acceptance Response (HTTP 201 Created with campaign details)
        │
        ▼ (Asynchronous Detached Background Execution)
Existing Mailcraft Campaign Processor (lib/campaign/processor.ts)
  ├─ Fetches pending recipients in batches of 10 (`limit(10)`)
  ├─ Atomic lock on recipient (`status: 'sending'`)
  ├─ Enforces sliding 1-minute rate limiter (~3,000ms delay at 20 emails/min)
  ├─ Enforces mailbox micro-pacing (150ms minimum socket interval)
  ├─ Preserves HTML body (`__is_html_body === "true"`) and dispatches via sendEmail()
  └─ Updates recipient status (`sent` or `failed` with retry count up to 3)
        │
        ▼
Existing Microsoft Graph Email Dispatcher (lib/email/send.ts)
  ├─ Resolves valid OAuth access token via proactive refresh mutex
  ├─ Uploads base64 inline images to Supabase storage bucket (`mailcraft/email-images/`)
  ├─ Calls Microsoft Graph API: `POST https://graph.microsoft.com/v1.0/me/sendMail`
  └─ Saves email to sender's Outlook "Sent Items" (`saveToSentItems: true`)
        │
        ▼
Recipients' Inboxes
```

---

## 3. Expected API Endpoint

* **Production Endpoint:** `https://mailcraft-smoky.vercel.app/api/external/campaigns`
* **Local / Development Endpoint:** `http://localhost:3000/api/external/campaigns`
* **HTTP Method:** `POST`
* **Route Location:** `app/api/external/campaigns/route.ts`
* **Architectural Rationale:** Machine-to-machine integrations are placed under `/api/external/` to strictly decouple Bearer-token API calls from Mailcraft's web UI routes (`/api/campaigns/...`), which rely on browser cookies and Supabase SSR sessions.

---

## 4. Request Format

### Headers
* `Authorization`: `Bearer <LEADFORGE_API_KEY>` *(Required)*
* `Content-Type`: `application/json` *(Required)*
* `Idempotency-Key`: `<string>` *(Optional but strongly recommended; UUID or unique job ID up to 128 characters)*

### JSON Payload Schema
```json
{
  "campaignName": "LeadForge Q4 Executive Outreach",
  "emails": [
    {
      "to": "sarah.prospect@targetcompany.com",
      "from": "sales.rep@yourcompany.com",
      "subject": "Discussion on Workflow Efficiency",
      "body": "<p>Hi Sarah,</p><p>I noticed your recent announcement and wanted to reach out regarding our <strong>workflow solution</strong>.</p><p>Check out our <a href=\"https://example.com/demo\">live demo</a>.</p>"
    },
    {
      "to": "david.prospect@targetcompany.com",
      "from": "sales.rep@yourcompany.com",
      "subject": "Introductory Discussion",
      "body": "<p>Hi David,</p><p>Would love to connect regarding your recent updates.</p>"
    }
  ]
}
```

### Field Specifications
| Field | Type | Required | Constraints | Description |
| :--- | :---: | :---: | :--- | :--- |
| `campaignName` | `string` | **Yes** | 1 to 255 chars | Display title of the campaign in Mailcraft. |
| `emails` | `array` | **Yes** | 1 to 250 items | List of email objects to be queued. |
| `emails[].to` | `string` | **Yes** | Valid email regex, max 320 chars | Target recipient email address. |
| `emails[].from` | `string` | **Yes** | Valid email regex; **must match connected sender** | Sender email. **All emails in a request must have the identical `from` address.** |
| `emails[].subject` | `string` | **Yes** | 1 to 500 chars | Email subject line. |
| `emails[].body` | `string` | **Yes** | Max 500 KB per email | **Raw, pre-rendered HTML content.** |

---

## 5. How Mailcraft Processes the Array as a Campaign

1. **Validation & All-or-Nothing Rule:** The request payload is validated in a single pass. If even one email has an invalid address, missing subject, or empty body, the entire batch is rejected (no partial batches).
2. **Idempotency Tagging:** If an `Idempotency-Key` is supplied, Mailcraft checks for an identical campaign created by that sender in the last 24 hours. If found, it returns the existing campaign details with `HTTP 200 OK` without creating duplicate records or sending duplicate emails.
3. **Sender Mapping:** The single `from` address is queried against `microsoft_tokens.microsoft_email` to resolve the Mailcraft `user_id`.
4. **Database Insertion (Zero Migrations):**
   - **`campaigns` row:** `name` stores the campaign name (with optional idempotency tag), `user_id` stores the resolved user, `subject_template: "{{subject}}"`, `body_template: "{{body}}"`, `rate_limit: 20`, `status: "sending"`.
   - **`recipients` rows:** Each email becomes a row with `email: item.to`, `status: "pending"`, `retry_count: 0`, and `data: { subject, body, from, __is_html_body: "true" }`.
5. **Background Processor Invocation:** The API handler immediately calls `startCampaignProcessor(campaign.id, adminDb)` and returns `HTTP 201 Created` without waiting for emails to be delivered.
6. **HTML Preservation in Dispatch:** When `lib/email/send.ts` processes a recipient where `recipient.data.__is_html_body === "true"`, it bypasses plain-text template escaping (`compileTemplate`), runs HTML whitespace cleaning and link autolinking (`cleanHtmlWhitespace` + `autoLinkHtml`), and delivers the native HTML directly to Microsoft Graph `POST /me/sendMail` with `body.contentType = "HTML"`.

---

## 6. Expected Success & Error Responses

### Successful Dispatch (`HTTP 201 Created`)
```json
{
  "success": true,
  "campaignId": "ee117c62-69b6-45a1-9566-8067d71ee996",
  "campaignName": "LeadForge Q4 Executive Outreach",
  "status": "sending",
  "totalEmails": 2,
  "sender": "sales.rep@yourcompany.com",
  "createdAt": "2026-09-24T12:00:00.000Z",
  "processor": "Processor started for campaign ee117c62-69b6-45a1-9566-8067d71ee996"
}
```

### Idempotent Duplicate Response (`HTTP 200 OK`)
```json
{
  "success": true,
  "duplicate": true,
  "campaignId": "ee117c62-69b6-45a1-9566-8067d71ee996",
  "campaignName": "LeadForge Q4 Executive Outreach",
  "status": "sending",
  "totalEmails": 2,
  "sender": "sales.rep@yourcompany.com",
  "createdAt": "2026-09-24T12:00:00.000Z",
  "message": "Campaign with this Idempotency-Key already exists and is currently processing."
}
```

### Standard Error Format (`HTTP 4xx / 5xx`)
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human readable explanation",
  "details": null
}
```

### Error Code Reference
| HTTP Status | Error Code | Cause / Remedy |
| :---: | :--- | :--- |
| `401` | `UNAUTHORIZED` | Missing or invalid Bearer token in `Authorization` header. |
| `400` | `INVALID_JSON` | Malformed JSON in request body. |
| `400` | `INVALID_REQUEST` | Missing `campaignName`, empty `subject`, or empty `body`. |
| `400` | `EMPTY_EMAIL_ARRAY` | `emails` array is empty or not provided. |
| `400` | `PAYLOAD_TOO_LARGE` | `emails` array has >250 items, or body exceeds 500 KB. |
| `400` | `INVALID_EMAIL` | Malformed email syntax in `to` or `from`. Details contain index and field. |
| `400` | `HETEROGENEOUS_SENDERS` | Differing `from` addresses in the same request. All items must share the same sender. |
| `422` | `SENDER_NOT_CONNECTED` | Sender has not connected Microsoft 365 Outlook in Mailcraft Settings. |
| `403` | `PROVIDER_AUTH_FAILED` | Microsoft OAuth token is expired or revoked. User must reconnect Outlook. |
| `500` | `CAMPAIGN_CREATION_FAILED` | Database insertion error when creating campaign record. |
| `500` | `DATABASE_ERROR` | Database insertion error when enqueuing recipients (rolled back cleanly). |

---

## 7. API Authentication & API Key Requirements

* **Mechanism:** Machine-to-machine authentication via HTTP `Authorization: Bearer <LEADFORGE_API_KEY>`.
* **Timing-Safe Evaluation:** Token validation strictly utilizes `crypto.timingSafeEqual()` over UTF-8 byte buffers to prevent timing side-channel attacks.
* **Server-Side Security:**
  - Configured in `.env.local` / platform deployment settings as `LEADFORGE_API_KEY`.
  - **NEVER** prefixed with `NEXT_PUBLIC_` (must never leak into client bundles).
  - Stripped from logs; never echoed in error or success payloads.
* **Database Client:** Uses Supabase Service Role admin client (`getAdminClient()`) to perform transactional operations bypassing Row Level Security (RLS) for machine-to-machine requests.

---

## 8. Campaign ID & Status Requirements

* **Campaign ID:** Generated as a Supabase UUID v4 on insertion (`campaigns.id`) and returned in the HTTP 201 response.
* **Initial Status:** Created with status `'sending'`.
* **Lifecycle Status Transitions:**
  - Managed automatically by the background processor:
    `'sending'` → `'done'` (all recipients sent successfully)
    `'sending'` → `'partial'` (one or more recipients failed after 3 retries)
* **Real-time Monitoring:** The campaign appears in the Mailcraft web dashboard (`/campaign/[id]`) with live progress bars, recipient statuses, dispatch timestamps, and error messages.

---

## 9. Sender & From-Address Handling

* **Microsoft 365 Architecture Constraint:** Microsoft Graph delegated permission `Mail.Send` sends strictly from the authenticated mailbox (`/me/sendMail`). Arbitrary sender spoofing is technically impossible.
* **Single Sender per Batch:** All emails within an incoming array must have the identical `from` address. Mixing multiple senders in one array returns `400 HETEROGENEOUS_SENDERS`.
* **Account Verification:**
  - Before sending, the sender user must log into Mailcraft once and connect their Microsoft 365 Outlook account (**Settings** → **Connect Microsoft Account**).
  - The API verifies `microsoft_tokens.microsoft_email` matches `from`.
  - If unlinked, returns `422 SENDER_NOT_CONNECTED`.
* **Pre-flight Token Check:** The API runs `getValidAccessToken()` before accepting the request, verifying that the Microsoft token is valid or refreshable.

---

## 10. Bulk Processing, Rate Limiting, Retries & Existing Subsystem Reuse

The external API does **NOT** reinvent or duplicate any sending logic; it reuses existing Mailcraft engines:

| Subsystem | File / Component | Reused Behavior |
| :--- | :--- | :--- |
| **Campaign Processor** | `lib/campaign/processor.ts` | Detached async worker; processes recipients in batches of 10 (`limit(10)`). |
| **Atomic Claiming** | `UPDATE recipients SET status='sending'` | Atomic row claim prevents double-sending across parallel processors. |
| **Campaign Rate Limiter** | `lib/campaign/rate-limiter.ts` | Sliding 1-minute window quota (default: 20 emails/min; ~3,000ms delay between emails). |
| **Mailbox Micro-Pacing** | `paceMailboxRequest(userId)` | Enforces minimum 150ms delay between socket requests to Microsoft Graph. |
| **Recipient Retries** | `lib/campaign/processor.ts` | Automatic 3-attempt retry loop on temporary failures before setting status to `'failed'`. |
| **Throttling Backoff** | `lib/graph/throttling.ts` | Detects Microsoft Graph HTTP 429/503; applies `Retry-After` cooldowns up to 300s. |
| **Token Refresh Mutex** | `lib/graph/client.ts` | Single-flight promise mutex prevents concurrent token refresh collisions (`invalid_grant`). |
| **Stuck-Job Recovery** | `lib/campaign/processor.ts` | Automatically recovers orphaned `'sending'` records back to `'pending'` on restart. |
| **Inline Image Hosting** | `lib/email/send.ts` | Automatically uploads base64 embedded images to Supabase storage bucket (`mailcraft/email-images/`). |

---

## 11. Security Requirements

1. **Machine-to-Machine Secret Isolation:** `LEADFORGE_API_KEY` stored strictly server-side in environment variables; excluded from version control via `.gitignore`.
2. **Timing Attack Protection:** Constant-time Bearer token comparison (`crypto.timingSafeEqual`).
3. **Anti-Spoofing Sender Guard:** Enforced mapping of `from` to verified tokens in `microsoft_tokens`.
4. **All-or-Nothing Payload Validation:** Immediate rejection of incomplete or malformed batches prevents database corruption.
5. **Denial of Service / Socket Flooding Guard:** Strict limits of 250 emails per request, 500 KB per HTML body, and 4.5 MB overall request body.
6. **Log Sanitization:** Sensitive authorization headers and credentials stripped from all application logs.

---

## 12. What Must NOT Be Changed in Mailcraft

The integration was designed under strict non-disruption rules:
* **NO Database Migrations:** No altering of existing tables (`campaigns`, `recipients`, `microsoft_tokens`), no new tables, and no column modifications.
* **NO UI Wizard Disruptions:** Existing campaign wizard (`components/campaign-wizard/*`), spreadsheet CSV/Excel import, and DOCX list parsing must continue functioning with zero changes.
* **NO Breaking Template Changes:** Standard UI campaigns must continue using `compileTemplate()` for spreadsheet variable interpolation; the external HTML bypass is strictly triggered by `recipient.data.__is_html_body === "true"`.
* **NO UI Route Changes:** Existing session-cookie endpoints (`/api/campaigns/*`) remain untouched.
* **NO Refactoring of Working Logic:** Existing processor loops, Microsoft Graph sending routines, and rate limiters must remain intact.

---

## 13. Phase-Wise Implementation Plan

* **Phase 0: Deep Technical Analysis** *(COMPLETE)*
  - Audited 18 architectural areas across Mailcraft.
  - Confirmed feasibility without database schema changes.
  - Identified HTML template escaping behavior and formulated the additive `__is_html_body` solution.
* **Phase 1: API Design Specification** *(COMPLETE)*
  - Authored comprehensive API design specification (`MAILCRAFT_EXTERNAL_CAMPAIGN_API_PHASE1_DESIGN.md`).
  - Defined REST contracts, payload schemas, error codes, and idempotency mechanisms.
* **Phase 2: Additive Implementation** *(COMPLETE)*
  - Implemented `app/api/external/campaigns/route.ts`.
  - Added additive HTML check in `lib/email/send.ts` (`recipient.data?.__is_html_body === "true"`).
  - Exported `getAdminClient()` helper in `lib/supabase/admin.ts`.
  - Documented `LEADFORGE_API_KEY` in `.env.local.example`.
* **Phase 3: Automated Verification & Integration Testing** *(COMPLETE)*
  - Built and passed 57-test unit suite (`scripts/verify-external-campaign-api.mjs`).
  - Built and passed 12-test integration suite (`scripts/run-phase3-tests.mjs`).
* **Phase 4: Full System Regression Testing** *(COMPLETE)*
  - Verified all 26 core Mailcraft features.
  - Ran master regression suite (12/12 passed), rate limiting suite (5/5 passed), HTML encoding suite (6/6 passed), DOCX list suites (4/4 passed).
* **Phase 5: Production Audit & Handover** *(COMPLETE)*
  - Generated developer handover documentation (`LEADFORGE_API_HANDOVER.md`).
  - Verified Next.js production build (`npm run build`), TypeScript (`tsc --noEmit`), and ESLint (`npm run lint`) with 0 errors and 0 warnings.
  - Confirmed git branch and release readiness (`MAILCRAFT_FINAL_VERIFICATION_REPORT.md`).

---

## 14. Git Repository & Target Branch

* **Repository:** `Tecmotiv-Solutions/mailcraft`
* **Target Branch:** `deploy/v1-docx-list-fix`
* **Status:** Current working branch is `deploy/v1-docx-list-fix`, tracked against `origin/deploy/v1-docx-list-fix`.

---

## 15. Remaining Tasks & Decisions Before Deployment

### Confirmed Requirements
1. **Production Environment Variable:** Set `LEADFORGE_API_KEY` in Vercel Project Settings (Production & Preview environments) and securely share the secret key with the LeadForge team.
2. **Microsoft 365 Account Linking:** Ensure every sales representative whose email will appear in `from` logs in once to `https://mailcraft-smoky.vercel.app` and links their Microsoft account (**Settings** → **Connect Microsoft Account**).
3. **Repository Cleanliness:** Review the unstaged change in `scripts/send-test-campaign.mjs` (revert or stage for testing) before pushing.
4. **Git Push:** Stage files, commit with a semantic commit message, and push to `origin/deploy/v1-docx-list-fix`.
5. **Vercel Deployment Verification:** Verify that Vercel completes the production deployment build without errors.
6. **Live Production Smoke Test:** Execute a live test request with 1 recipient against `https://mailcraft-smoky.vercel.app/api/external/campaigns` using a real connected sender.

### Assumptions & Operational Notes
* **Assumed Batch Cadence:** LeadForge is assumed to submit batches of ≤250 emails at a time. If LeadForge has larger lists (e.g., 1,000 prospects), it must chunk them into 4 separate requests of 250 emails each.
* **Assumed Sending Capacity:** Microsoft 365 Exchange Online enforces 30 messages/minute and 10,000 recipients/day per mailbox. Mailcraft's default rate limit of 20 emails/minute comfortably complies with this threshold.
* **Assumed Network Retries:** LeadForge is assumed to provide the `Idempotency-Key` header on all automated dispatches to ensure network retries do not send duplicate emails.
