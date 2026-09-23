# Mailcraft External Campaign API — Phase 1: API Design Specification

**Document Status**: Phase 1 — API Design Specification Only (No Code Implementation)  
**Source of Truth**: [`MAILCRAFT_EXTERNAL_CAMPAIGN_API_PHASE0.md`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/MAILCRAFT_EXTERNAL_CAMPAIGN_API_PHASE0.md)  
**Target Consumer**: LeadForge (Automated Sales / Lead Generation Platform)  
**System Target**: Mailcraft Cold Email & Campaign Engine  

---

## 1. Architectural Overview & Workflow

The External Campaign API enables LeadForge to submit a batch of pre-rendered, personalized HTML emails to Mailcraft. Mailcraft receives the batch, validates it, creates a native campaign record, inserts recipient rows, and triggers the existing Mailcraft background campaign processor.

### Target Execution Sequence

```
LeadForge Application
        │
        │ HTTP POST /api/external/campaigns
        │ Headers:
        │   Authorization: Bearer <LEADFORGE_API_KEY>
        │   Idempotency-Key: <unique-client-uuid>
        │ Payload:
        │   {
        │     "campaignName": "LeadForge Q1 Outreach",
        │     "emails": [
        │       {
        │         "to": "alex@client.com",
        │         "from": "sales@ourcompany.com",
        │         "subject": "Introductory Call",
        │         "body": "<p>Hello Alex,</p><p>We saw your work...</p>"
        │       },
        │       ...
        │     ]
        │   }
        ▼
Mailcraft Route Handler (POST /api/external/campaigns)
  ├─ 1. API Key Authentication (Timing-safe Bearer token evaluation)
  ├─ 2. Idempotency Check (Prevents duplicate campaign creation on network retries)
  ├─ 3. Full Request & Array Validation (All-or-nothing validation)
  ├─ 4. Sender Verification & Tenant Resolution (Maps `from` -> `microsoft_tokens.user_id`)
  ├─ 5. Pre-flight Microsoft 365 OAuth Token Verification
  ├─ 6. Campaign Persistence (`INSERT INTO campaigns`, status: 'sending')
  ├─ 7. Recipients Bulk Persistence (`INSERT INTO recipients`, status: 'pending')
  ├─ 8. Trigger Existing Campaign Processor (`startCampaignProcessor(campaign.id, adminDb)`)
  └─ 9. Synchronous Acceptance Response (HTTP 201 Created with campaign details)
        │
        ▼ (Asynchronous Detached Background Execution)
Existing Mailcraft Campaign Processor (lib/campaign/processor.ts)
  ├─ Fetches pending recipients in batches of 10 (`limit(10)`)
  ├─ Atomic lock on recipient (`status: 'sending'`)
  ├─ Campaign Sliding Rate Limiter (~3,000ms delay at 20 emails/min)
  ├─ Mailbox-Level Micro-Pacer (150ms minimum socket interval)
  ├─ Preserves HTML email body and dispatches via sendEmail()
  └─ Updates recipient status (`sent` or `failed` with retry count up to 3)
        │
        ▼
Existing Microsoft Graph Email Sending (lib/email/send.ts)
  ├─ Single-flight OAuth token refresh if near expiry
  ├─ Graph API: `POST https://graph.microsoft.com/v1.0/me/sendMail`
  └─ Recipient Mailboxes
```

---

## 2. API Endpoint & HTTP Method

### Canonical Endpoint
```http
POST /api/external/campaigns
```

* **HTTP Method**: `POST`
* **Content-Type**: `application/json`
* **Route File Location**: `app/api/external/campaigns/route.ts`
* **Convention Rationale**:
  * Mailcraft's existing web routes live under `/api/campaigns/...` and rely on browser cookie sessions (`@supabase/ssr`).
  * Placing machine-to-machine integrations under `/api/external/...` clearly isolates API-key-authenticated server endpoints from user-session UI endpoints, preventing CSRF or session-bleed issues while remaining fully compliant with Next.js App Router conventions.

---

## 3. Server-to-Server Authentication

### Specification
Authentication uses a secret Bearer API token supplied in the HTTP `Authorization` header:

```http
Authorization: Bearer <LEADFORGE_API_KEY>
```

### Security Constraints & Storage Rules
1. **Server-Side Only**: The key is stored in the host environment / `.env.local` as `LEADFORGE_API_KEY`.
2. **No `NEXT_PUBLIC_` Prefix**: Never exposed to browser bundles or client code.
3. **No Hardcoding**: Never committed to version control.
4. **Timing-Safe Comparison**:
   * Standard string equality (`===`) is vulnerable to character-by-character timing analysis.
   * Authentication checks must validate key length first, then execute a constant-time comparison:
     ```typescript
     import crypto from "crypto";

     function verifyApiKey(authHeader: string | null): boolean {
       const expectedKey = process.env.LEADFORGE_API_KEY;
       if (!expectedKey || !authHeader) return false;

       const match = authHeader.match(/^Bearer\s+(.+)$/i);
       if (!match) return false;

       const providedKey = match[1].trim();
       const expectedBuffer = Buffer.from(expectedKey, "utf-8");
       const providedBuffer = Buffer.from(providedKey, "utf-8");

       if (expectedBuffer.length !== providedBuffer.length) return false;
       return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
     }
     ```
5. **Log Sanitation**: The `Authorization` header must be stripped from application and access logs.
6. **No Key in Responses**: Error responses and success payloads must never echo or hint at token content.

---

## 4. Request Schema & Field Specifications

### JSON Request Payload

```json
{
  "campaignName": "LeadForge Q1 Cold Outreach",
  "emails": [
    {
      "to": "person1@example.com",
      "from": "sender@ourdomain.com",
      "subject": "Partnership inquiry for Q1",
      "body": "<p>Hello Person 1,</p><p>We noticed your team's expansion in <strong>distributed systems</strong>.</p><ul><li>Benefit 1</li><li>Benefit 2</li></ul>"
    },
    {
      "to": "person2@example.com",
      "from": "sender@ourdomain.com",
      "subject": "Quick intro ahead of the summit",
      "body": "<p>Hello Person 2,</p><p>Are you attending the conference next week?</p>"
    }
  ]
}
```

### Field Definitions

| Field Name | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `campaignName` | `string` | **Yes** | 1 – 255 characters after trim | Descriptive name for the campaign, displayed in Mailcraft UI dashboard. |
| `emails` | `array` | **Yes** | 1 – 250 items | Array of personalized email objects to be queued. |
| `emails[].to` | `string` | **Yes** | Valid email regex, max 320 chars | Recipient destination email address. |
| `emails[].from` | `string` | **Yes** | Valid email regex; **must match connected Microsoft 365 account** | Sender email address. Must be identical across all emails in the array. |
| `emails[].subject` | `string` | **Yes** | 1 – 500 characters after trim | Email subject line for this recipient. |
| `emails[].body` | `string` | **Yes** | Valid non-empty HTML string, max 500 KB | Complete, styled HTML email body for this recipient. |

---

## 5. Request Validation & Partial Failure Policy

### Partial Validation Policy: Reject the Entire Campaign (Option A)

**Decision**: **All-or-Nothing Transactional Validation**. If any email in the array is invalid (e.g. malformed `to`, missing `subject`, or empty `body`), the entire request is rejected with `HTTP 400 Bad Request` and no database rows are created.

#### Rationale:
1. **Idempotency & Re-delivery Cleanliness**: If Mailcraft accepted 49 valid emails out of 50, LeadForge would face high operational complexity to identify the single rejected email, prune its local state, and avoid duplicate sends when retrying.
2. **Campaign Integrity**: A marketing campaign is conceptually an atomic batch. Partial batches result in fragmented analytics, orphaned drafts, and broken reporting.
3. **Deterministic Error Reporting**: Returning an exact path and reason (e.g. `emails[12].to is invalid`) allows LeadForge to fix the data and re-submit the entire batch cleanly.

### Field Validation Rules

```
┌─────────────────┬────────────────────────────────────────────────────────────┐
│ Validation Step │ Verification Rule                                          │
├─────────────────┼────────────────────────────────────────────────────────────┤
│ 1. Content-Type │ Must be `application/json`.                                │
│ 2. campaignName │ Non-empty string, length 1–255.                            │
│ 3. emails Array │ Array exists, length >= 1 and length <= 250.               │
│ 4. From Address │ Valid email format; all emails must share the identical    │
│                 │ `from` address.                                            │
│ 5. Sender Auth  │ `from` address exists in `microsoft_tokens.microsoft_email`│
│                 │ with active Microsoft 365 OAuth credentials.               │
│ 6. Recipient To │ Each `to` matches standard email regex.                    │
│ 7. Subject      │ Non-empty string, length 1–500.                            │
│ 8. HTML Body    │ Non-empty string, contains valid HTML content.             │
└─────────────────┴────────────────────────────────────────────────────────────┘
```

---

## 6. Sender Handling & Spoofing Protection

### Existing Microsoft Account Architecture
* In Mailcraft, all email dispatch occurs through Microsoft Graph API `POST /me/sendMail`.
* The authenticated sender is determined by the connected Microsoft 365 account stored in the `microsoft_tokens` table.
* Microsoft Graph delegated permission `Mail.Send` **does not allow arbitrary sender spoofing**. Emails can only be dispatched from the actual connected Microsoft mailbox.

### Validation & Account Mapping Flow
1. **Extract `from` Address**: Obtain `from` from `emails[0].from` (and verify all other items match).
2. **Query Database for Connected Account**:
   ```typescript
   const { data: tokenRow } = await adminDb
     .from("microsoft_tokens")
     .select("user_id, microsoft_email, expires_at")
     .ilike("microsoft_email", fromAddress)
     .maybeSingle();
   ```
3. **Enforce Sender Authorization**:
   * If `tokenRow` is not found: return `HTTP 422 Unprocessable Entity`:
     ```json
     {
       "success": false,
       "error": "SENDER_NOT_CONNECTED",
       "message": "The sender 'sales@ourcompany.com' has not linked their Microsoft 365 Outlook account in Mailcraft Settings."
     }
     ```
4. **Pre-flight Token Health Check**:
   * Verify token validity before accepting the campaign:
     ```typescript
     await getValidAccessToken(tokenRow.user_id, adminDb);
     ```
   * If token refresh fails (e.g. password changed or grant revoked), return `HTTP 403 Forbidden` (`PROVIDER_AUTH_FAILED`).
5. **Assign Ownership**: Assign the resolved `tokenRow.user_id` as `campaign.user_id`.

---

## 7. HTML Email Body Preservation — Detailed Mapping

### Architectural Problem & Solution Trace

The Phase 0 analysis identified that Mailcraft's existing template compilation pipeline (`compileTemplate()` in [`lib/email/template.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/template.ts#L514)) was designed for UI campaigns where `campaign.body_template` is the master document, and `recipient.data` contains plain-text spreadsheet variables (e.g. `{ Company: "AT&T" }`). 

Consequently, `compileTemplate()` passes `recipient.data` placeholders through `escapeHtml()`. If raw HTML from LeadForge (`<p>Hello</p>`) were passed into `recipient.data.body` under a standard `{{body}}` template, the HTML tags would be escaped into visible text (`&lt;p&gt;Hello&lt;/p&gt;`).

### The Mapping Strategy (Zero UI Regression)

To preserve complete HTML fidelity for LeadForge without altering the behavior of UI campaigns:

#### 1. Database Storage Mapping
* **`campaigns.body_template`**: Stored as `"{{{body}}}"` (or `"{{body}}"`) at the campaign level.
* **`campaigns.subject_template`**: Stored as `"{{subject}}"`.
* **`recipients.email`**: Stores `to`.
* **`recipients.data`**: Stored as JSONB:
  ```json
  {
    "subject": "Introductory Call",
    "body": "<p>Hello Alex,</p><p>We noticed your team's expansion...</p>",
    "from": "sales@ourcompany.com",
    "__is_html_body": "true"
  }
  ```

#### 2. Pipeline Preservation in `sendEmail()`
In [`lib/email/send.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts#L67-L68):
```typescript
const subject = renderTemplate(campaign.subject_template, recipient.data);
let body: string;

if (recipient.data?.__is_html_body === "true" && recipient.data.body) {
  // External HTML Email: bypass plain-text escaping, clean whitespace and auto-link anchors
  body = autoLinkHtml(cleanHtmlWhitespace(recipient.data.body));
} else {
  // Standard Mailcraft UI Campaign: execute existing template compilation exactly as before
  body = compileTemplate(campaign.body_template, recipient.data);
}
```

#### 3. Verification of Preservation
* **No Markdown Conversion**: Content is never parsed as Markdown.
* **No Plain-Text Stripping**: HTML tags are not stripped.
* **No Entity Escaping of Tags**: `<p>`, `<strong>`, `<a>`, `<table>`, `<ul>`, `<ol>`, `<li>`, headings, and inline styles remain raw HTML elements.
* **Graph API Dispatch**: Dispatched to Microsoft Graph as:
  ```json
  {
    "message": {
      "subject": subject,
      "body": {
        "contentType": "HTML",
        "content": body
      },
      "toRecipients": [{ "emailAddress": { "address": recipient.email } }]
    },
    "saveToSentItems": true
  }
  ```
* **UI Backward Compatibility**: For any campaign created via the Mailcraft wizard UI, `recipient.data.__is_html_body` is undefined, executing the original `compileTemplate()` path with zero change in behavior.

---

## 8. Campaign Creation & Storage Architecture

The External Campaign API reuses the existing Mailcraft data model without database modifications.

```
Incoming Request Payload
        │
        ├─> campaigns table
        │     id: UUID (generated)
        │     user_id: resolved sender user_id
        │     name: payload.campaignName
        │     subject_template: "{{subject}}"
        │     body_template: "{{body}}"
        │     rate_limit: 20 (or payload override)
        │     status: "sending"
        │     global_bcc: ""
        │     global_cc: ""
        │
        └─> recipients table (batch insert)
              id: UUID (generated)
              campaign_id: campaign.id
              email: emailItem.to
              data: { subject, body, from, __is_html_body: "true" }
              status: "pending"
              retry_count: 0
              error_message: ""
```

### Database Operations (via `createAdminClient()`)
1. **Insert Campaign**:
   ```typescript
   const { data: campaign, error: campErr } = await adminDb
     .from("campaigns")
     .insert({
       user_id: tokenRow.user_id,
       name: body.campaignName.trim(),
       subject_template: "{{subject}}",
       body_template: "{{body}}",
       rate_limit: 20,
       status: "sending",
     })
     .select()
     .single();
   ```
2. **Bulk Insert Recipients**:
   ```typescript
   const recipientRecords = body.emails.map((item) => ({
     campaign_id: campaign.id,
     email: item.to.trim().toLowerCase(),
     data: {
       subject: item.subject.trim(),
       body: item.body,
       from: item.from.trim().toLowerCase(),
       __is_html_body: "true",
     },
     attachment_path: "",
     status: "pending",
     retry_count: 0,
   }));

   const { error: recErr } = await adminDb
     .from("recipients")
     .insert(recipientRecords);
   ```

---

## 9. Campaign Starting & Background Execution

### Reuse of Existing Campaign Processor
Immediately following successful database insertion, the API starts the campaign processor:

```typescript
import { startCampaignProcessor } from "@/lib/campaign/processor";

// Trigger background worker using admin database client
const processorResult = await startCampaignProcessor(campaign.id, adminDb);
```

### Preserved Subsystems (Zero Duplication)
* **Background Worker**: `startCampaignProcessor()` spawns an unawaited asynchronous worker (`runCampaignLoop`) and returns immediately.
* **Worker Idempotency**: If a worker is already running for the campaign ID, it will not spawn a duplicate.
* **Atomic Claiming**: Pending recipients are locked using `UPDATE recipients SET status = 'sending' WHERE id = :id AND status = 'pending'`.
* **Rate Limiting**: Uses existing `CampaignRateLimiter` (sliding 1-minute window, ~3,000ms delay at 20 emails/min).
* **Mailbox Micro-Pacing**: `paceMailboxRequest(userId)` enforces 150ms minimum spacing between requests to Microsoft Graph.
* **Automatic Retries**: Failed sends are retried up to 3 times before transitioning to `'failed'`.
* **Stuck-Job Recovery**: Automatically reclaims `'sending'` records if a worker aborts.
* **Completion Transition**: Campaign status automatically transitions to `'done'` (or `'partial'` if failures occurred).

---

## 10. Duplicate Protection & Idempotency Design

### The Problem
If LeadForge encounters a network interruption or timeout after sending the HTTP request, it may retry the request. Without idempotency protection, Mailcraft would create duplicate campaigns and send duplicate emails to recipients.

### Idempotency Mechanism

1. **Header Specification**:
   LeadForge submits a unique client-generated UUID in the `Idempotency-Key` header:
   ```http
   Idempotency-Key: e4b2c1a8-7f39-4d62-a5e1-8899aabbccdd
   ```
2. **Deterministic Lookup (No Schema Changes)**:
   * To support idempotency without adding new database tables or columns:
   * We record the idempotency key in the `campaigns.name` or query existing campaigns created by this user within the last 24 hours.
   * **Recommended Strategy**: Store a deterministic lookup tag in `campaigns.name`:
     ```
     LeadForge Q1 Outreach [idempotency:e4b2c1a8-7f39-4d62-a5e1-8899aabbccdd]
     ```
   * Or compute a SHA-256 fingerprint of `user_id` + `campaignName` + `emails.length` + `emails[0].to` + `emails[emails.length - 1].to`.
3. **Evaluation Logic**:
   * Prior to insertion, query `campaigns` for a campaign matching the idempotency key or fingerprint created within the past 24 hours.
   * **If a match is found**:
     * Do NOT create a new campaign.
     * Do NOT insert duplicate recipients.
     * Return `HTTP 200 OK` with the existing `campaignId` and current processing `status`.
   * **If no match is found**:
     * Proceed with campaign creation.

---

## 11. Array Limits & Payload Bounds

| Parameter | Limit | Technical Rationale |
|---|---|---|
| **Minimum Emails** | `1` | An empty email array is invalid (`400 Bad Request`). |
| **Recommended Max** | `250` | Balances network payload size with fast database transaction time. |
| **Hard Upper Limit** | `500` | Exceeding 500 emails risks exceeding Vercel 4.5 MB request body limits and serverless execution timeouts. |
| **Max Payload Size** | `4.5 MB` | Standard Next.js serverless payload limit (`HTTP 413 Payload Too Large`). |
| **Max HTML Body Size** | `500 KB / email` | Ample for rich corporate newsletters; prevents memory exhaustion. |
| **Dispatch Time (at 20/min)** | ~12.5 min for 250 | Handled entirely by background processor; API returns in < 500 ms. |

---

## 12. Response Schemas

### Success Response (`HTTP 201 Created`)
Returned immediately upon campaign creation and processor invocation:

```json
{
  "success": true,
  "campaignId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "campaignName": "LeadForge Q1 Cold Outreach",
  "status": "sending",
  "totalEmails": 2,
  "sender": "sales@ourcompany.com",
  "createdAt": "2026-09-23T18:00:00.000Z"
}
```

### Duplicate Request Response (`HTTP 200 OK`)
Returned when an identical `Idempotency-Key` is re-submitted:

```json
{
  "success": true,
  "duplicate": true,
  "campaignId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "campaignName": "LeadForge Q1 Cold Outreach",
  "status": "sending",
  "totalEmails": 2,
  "sender": "sales@ourcompany.com",
  "message": "Campaign with this Idempotency-Key already exists and is currently processing."
}
```

---

## 13. Comprehensive Error Response Specifications

All error responses share a standard JSON schema:

```json
{
  "success": false,
  "error": "STRING_ERROR_CODE",
  "message": "Human-readable explanation of failure",
  "details": null
}
```

### Detailed Error Scenarios

| HTTP Status | Error Code | Trigger Condition | Example Response Body |
|---|---|---|---|
| **401 Unauthorized** | `UNAUTHORIZED` | Missing or invalid `Authorization: Bearer <API_KEY>` header. | `{"success": false, "error": "UNAUTHORIZED", "message": "Missing or invalid API key."}` |
| **400 Bad Request** | `EMPTY_EMAIL_ARRAY` | `emails` array is missing or empty. | `{"success": false, "error": "EMPTY_EMAIL_ARRAY", "message": "'emails' must be an array containing between 1 and 250 items."}` |
| **400 Bad Request** | `PAYLOAD_TOO_LARGE` | `emails` array contains more than 250 items. | `{"success": false, "error": "PAYLOAD_TOO_LARGE", "message": "Batch size exceeds maximum limit of 250 emails per campaign."}` |
| **400 Bad Request** | `INVALID_EMAIL` | One or more `to` addresses fails email regex. | `{"success": false, "error": "INVALID_EMAIL", "message": "Invalid recipient email address at index 3: 'bad-email@'", "details": {"index": 3, "field": "to", "value": "bad-email@"}}` |
| **400 Bad Request** | `HETEROGENEOUS_SENDERS` | Items in `emails` have different `from` addresses. | `{"success": false, "error": "HETEROGENEOUS_SENDERS", "message": "All emails in a single campaign must share the same 'from' sender address."}` |
| **400 Bad Request** | `INVALID_REQUEST` | Missing `campaignName`, `subject`, or `body`. | `{"success": false, "error": "INVALID_REQUEST", "message": "'campaignName' is required and must be a string."}` |
| **422 Unprocessable** | `SENDER_NOT_CONNECTED` | `from` address does not exist in `microsoft_tokens`. | `{"success": false, "error": "SENDER_NOT_CONNECTED", "message": "Sender 'sales@unknown.com' does not have a connected Microsoft 365 account in Mailcraft."}` |
| **403 Forbidden** | `PROVIDER_AUTH_FAILED` | Microsoft token refresh failed (revoked or expired). | `{"success": false, "error": "PROVIDER_AUTH_FAILED", "message": "Microsoft 365 authorization expired. Please reconnect Outlook in Mailcraft Settings."}` |
| **500 Server Error** | `CAMPAIGN_CREATION_FAILED`| Database insert error during campaign row creation. | `{"success": false, "error": "CAMPAIGN_CREATION_FAILED", "message": "Failed to create campaign record in database."}` |
| **500 Server Error** | `CAMPAIGN_START_FAILED` | Failed to trigger `startCampaignProcessor()`. | `{"success": false, "error": "CAMPAIGN_START_FAILED", "message": "Campaign record created, but background processor failed to start."}` |
| **500 Server Error** | `DATABASE_ERROR` | Supabase connection or query error during recipient insert. | `{"success": false, "error": "DATABASE_ERROR", "message": "Database query failure while enqueuing recipients."}` |

---

## 14. Testing & Verification Plan (Phase 2 Preparation)

The implementation must be validated using automated integration scripts conforming to Mailcraft's `.mjs` test runner conventions in [`scripts/`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/scripts):

### Proposed Test File: `scripts/verify-external-campaign-api.mjs`

```
Test Cases to Execute:
├─ 1. Authentication Tests
│   ├─ Rejects missing Authorization header (401)
│   ├─ Rejects invalid Bearer token (401)
│   └─ Accepts valid Bearer token
├─ 2. Request Validation Tests
│   ├─ Rejects empty body (400)
│   ├─ Rejects missing campaignName (400)
│   ├─ Rejects empty emails array (400)
│   ├─ Rejects array with > 250 items (400)
│   ├─ Rejects invalid email syntax in `to` (400)
│   └─ Rejects heterogeneous `from` addresses in single array (400)
├─ 3. Sender Verification Tests
│   ├─ Rejects unrecognized sender not in microsoft_tokens (422)
│   └─ Resolves valid connected Microsoft sender to correct user_id
├─ 4. Idempotency Tests
│   ├─ First submission creates campaign and returns 201
│   └─ Immediate second submission with same Idempotency-Key returns 200 with same campaignId
├─ 5. HTML Body Preservation Tests
│   ├─ Submits rich HTML body with <p>, <strong>, <a>, <table>, <ul>, inline styles
│   ├─ Inspects stored recipient.data to ensure HTML was not escaped to &lt;p&gt;
│   └─ Verifies compile/send logic preserves HTML format for Microsoft Graph
├─ 6. Processor Execution Tests
│   ├─ Verifies startCampaignProcessor is triggered
│   ├─ Verifies campaign status transitions to "sending"
│   └─ Verifies rate limiter spaces sends according to configured rate limit
└─ 7. UI Non-Regression Verification
    ├─ Verifies existing wizard campaigns continue working untouched
    └─ Verifies master-regression suite passes completely (npm run seed && node scripts/master-regression.mjs)
```

---

## 15. Summary & Sign-Off

* **Phase 1 Status**: API Design Specification complete.
* **Preservation Compliance**: 
  * No existing files have been modified.
  * No existing database schemas have been altered.
  * No existing UI, campaign wizard, or Microsoft Graph integration has been impacted.
  * Ready for user review before proceeding to Phase 2 (Implementation).
