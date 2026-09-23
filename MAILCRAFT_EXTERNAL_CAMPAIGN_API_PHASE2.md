# Mailcraft External Campaign API — Phase 2: Implementation & Verification Report

**Status**: Phase 2 Complete (Implementation & Automated Verification Verified)  
**Endpoint**: `POST /api/external/campaigns`  
**Target Consumer**: LeadForge (Sales Outreach Automation Platform)  

---

## 1. Executive Summary

The **External Campaign API** has been successfully implemented into the Mailcraft project as an additive integration. The endpoint enables LeadForge to submit batches of personalized HTML emails, validates them atomically, creates native Mailcraft campaign and recipient records, and initiates the existing Mailcraft background campaign processor for delivery via Microsoft Graph.

All changes strictly adhered to the preservation rules:
* **Zero regressions**: All existing UI campaign creation, DOCX parsing, rate limiting, and dispatch behavior remain 100% intact.
* **Zero database migrations**: Reused existing `campaigns`, `recipients`, and `microsoft_tokens` tables.
* **Zero duplicate worker logic**: Reused existing `startCampaignProcessor()`, sliding rate limiters, retries, and token refresh.

---

## 2. Files Created & Modified

### Files Created
1. **[`app/api/external/campaigns/route.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/app/api/external/campaigns/route.ts)**
   * Standalone Next.js Route Handler for `POST /api/external/campaigns`.
   * Enforces timing-safe Bearer API key authentication.
   * Implements 24-hour idempotency protection via `Idempotency-Key` header.
   * Performs all-or-nothing payload validation (bounds, email formats, heterogeneous sender prevention).
   * Resolves sender `from` address against connected accounts in `microsoft_tokens`.
   * Inserts campaign and recipient rows into Supabase.
   * Triggers background execution via `startCampaignProcessor(campaign.id, adminDb)`.
   * Returns fast synchronous response (`HTTP 201 Created` or `HTTP 200 OK` for duplicates).

2. **[`scripts/verify-external-campaign-api.mjs`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/scripts/verify-external-campaign-api.mjs)**
   * End-to-end automated test suite covering authentication, payload validation, all-or-nothing policy, sender resolution, campaign creation, idempotency, and HTML preservation.

3. **[`MAILCRAFT_EXTERNAL_CAMPAIGN_API_PHASE2.md`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/MAILCRAFT_EXTERNAL_CAMPAIGN_API_PHASE2.md)**
   * This implementation and verification report.

### Files Modified
1. **[`lib/email/send.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts)**
   * **Change**: Added 4-line check for `recipient.data?.__is_html_body === "true"`.
   * **Purpose**: If true, bypasses plain-text template escaping (`compileTemplate`) and delivers raw HTML (`cleanHtmlWhitespace` + `autoLinkHtml`) directly to Microsoft Graph. For standard UI campaigns (`__is_html_body` undefined), existing behavior is 100% preserved.

2. **[`lib/supabase/admin.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/supabase/admin.ts)**
   * **Change**: Exported `getAdminClient()` helper.
   * **Purpose**: Uses `SUPABASE_SECRET_KEY` in production; provides automatic fallback to authenticated seed user session in local development when service role secret is omitted from `.env.local`.

3. **[`.env.local.example`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/.env.local.example)**
   * **Change**: Documented `LEADFORGE_API_KEY=your_leadforge_api_key`.

---

## 3. API Contract & Specification

### Endpoint
```http
POST /api/external/campaigns
Content-Type: application/json
Authorization: Bearer <LEADFORGE_API_KEY>
Idempotency-Key: <unique-uuid>  (Optional, recommended)
```

### Authentication
* **Header**: `Authorization: Bearer <LEADFORGE_API_KEY>`
* **Implementation**: Validated using `crypto.timingSafeEqual()` in constant time.
* **Security**: The secret key is loaded strictly server-side from `process.env.LEADFORGE_API_KEY`. It is never exposed in client bundles, logs, or error responses.

### Request Payload Example
```json
{
  "campaignName": "LeadForge Q1 Cold Outreach",
  "emails": [
    {
      "to": "alex.prospect@clientdomain.com",
      "from": "yogeshumbarkar@tecmotivsolutions.com",
      "subject": "Partnership opportunity for Q1",
      "body": "<p>Hello Alex,</p><p>We noticed your expansion into <strong>distributed databases</strong>.</p><table border=\"1\"><tr><td>Metric</td><td>Value</td></tr><tr><td>Uptime</td><td>99.99%</td></tr></table><p><a href=\"https://example.com/demo\">Book a Demo</a></p>"
    },
    {
      "to": "jordan.prospect@clientdomain.com",
      "from": "yogeshumbarkar@tecmotivsolutions.com",
      "subject": "Follow up from AI Summit",
      "body": "<p>Hello Jordan,</p><p>Great meeting you at the <em>AI Summit</em>.</p><ul><li>Followup item 1</li><li>Followup item 2</li></ul>"
    }
  ]
}
```

### Validation Rules (All-or-Nothing Transactional Policy)
1. `campaignName`: Required string, 1–255 characters after trim.
2. `emails`: Required array, length 1–250 items.
3. `emails[].to`: Required valid email address.
4. `emails[].from`: Required valid email address.
5. **Heterogeneous Senders Guard**: All items in `emails` must specify the **identical `from` address**.
6. **Sender Connection Verification**: `from` must match an active Microsoft 365 connected account in `microsoft_tokens.microsoft_email`.
7. `emails[].subject`: Required string, 1–500 characters.
8. `emails[].body`: Required non-empty HTML string, max 500 KB per email.
9. **All-or-Nothing**: If any email in the array fails validation, the entire request fails immediately with `400 Bad Request` or `422 Unprocessable Entity` and exact index/field details.

### Response Schemas

#### Successful Creation (`HTTP 201 Created`)
```json
{
  "success": true,
  "campaignId": "0e64b8bb-124b-4b2a-a92c-564ddc3ec27b",
  "campaignName": "LeadForge Q1 Cold Outreach",
  "status": "sending",
  "totalEmails": 2,
  "sender": "yogeshumbarkar@tecmotivsolutions.com",
  "createdAt": "2026-09-23T18:07:00.000Z",
  "processor": "Processor started for campaign 0e64b8bb-124b-4b2a-a92c-564ddc3ec27b"
}
```

#### Idempotent Duplicate Request (`HTTP 200 OK`)
```json
{
  "success": true,
  "duplicate": true,
  "campaignId": "0e64b8bb-124b-4b2a-a92c-564ddc3ec27b",
  "campaignName": "LeadForge Q1 Cold Outreach",
  "status": "sending",
  "totalEmails": 2,
  "sender": "yogeshumbarkar@tecmotivsolutions.com",
  "createdAt": "2026-09-23T18:07:00.000Z",
  "message": "Campaign with this Idempotency-Key already exists and is currently processing."
}
```

#### Standard Error Response
```json
{
  "success": false,
  "error": "INVALID_EMAIL",
  "message": "Invalid recipient 'to' email address at index 1: 'bad-email@'.",
  "details": {
    "index": 1,
    "field": "to",
    "value": "bad-email@"
  }
}
```

---

## 4. Reuse of Existing Mailcraft Subsystems

The implementation reuses the following core systems:

| Subsystem | Existing File / Symbol | Reused Functionality |
|---|---|---|
| **Background Processing** | [`lib/campaign/processor.ts:startCampaignProcessor`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts#L50) | Detached asynchronous campaign execution, batch claiming (10 at a time), terminal status transition (`done` / `partial`). |
| **Pacing & Rate Limiting** | [`lib/campaign/rate-limiter.ts:CampaignRateLimiter`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/rate-limiter.ts#L18) | Sliding 1-minute window, ~3,000ms delay between emails at 20 emails/min. |
| **Mailbox Micro-Pacing** | [`lib/campaign/processor.ts:paceMailboxRequest`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts#L21) | Enforces 150ms minimum interval between Graph API socket requests. |
| **Atomic Claiming** | `UPDATE recipients SET status='sending' WHERE id=:id AND status='pending'` | Prevents duplicate sends across parallel processes. |
| **Stuck-Job Recovery** | [`lib/campaign/processor.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts#L164-L174) | Automatically reclaims stuck `sending` records back to `pending`. |
| **Retries** | [`lib/campaign/processor.ts`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/campaign/processor.ts#L237-L245) | Automatic 3-attempt recipient retry before marking `failed`. |
| **OAuth Token Refresh** | [`lib/graph/client.ts:getValidAccessToken`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/client.ts#L30) | Single-flight mutex token refresh avoiding invalid_grant collisions. |
| **Microsoft Graph Send** | [`lib/email/send.ts:sendEmail`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/email/send.ts#L64) | Dispatches via `POST /me/sendMail` with inline image hosting. |
| **Throttling Handling** | [`lib/graph/throttling.ts:isGraphThrottled`](file:///c:/Users/hkp12/OneDrive/Desktop/TecMotiv/mailCraft/lib/graph/throttling.ts#L46) | Evaluates HTTP 429/503 and enforces `Retry-After` cooldowns. |

---

## 5. Verification Results

All automated verification and regression test suites executed and passed:

### 1. External Campaign API Integration Suite (`scripts/verify-external-campaign-api.mjs`)
* **Total Assertions**: **57 / 57 PASSED (100%)**
  * Section 1: Authentication tests (missing header, invalid key, wrong scheme -> 401)
  * Section 2: Request validation (malformed JSON, missing campaignName, empty emails, >250 limit -> 400)
  * Section 3: Item validation & all-or-nothing policy (invalid email, missing subject/body, heterogeneous senders -> 400)
  * Section 4: Sender verification (unconnected Microsoft sender -> 422 `SENDER_NOT_CONNECTED`)
  * Section 5: Campaign creation & database persistence (valid submission -> 201 Created; database rows in `campaigns` and `recipients` verified)
  * Section 6: Idempotency protection (repeated request with same key -> 200 OK duplicate, exact same campaign ID, zero duplicate rows in DB)
  * Section 7: HTML preservation dispatch unit verification (native `<p>`, `<strong>`, `<a>`, `<table>` preserved without `&lt;p&gt;` escaping)

### 2. Static Analysis & Type Checking
* **ESLint (`npm run lint`)**: Passed cleanly with **0 errors**.
* **TypeScript Compiler (`npx tsc --noEmit`)**: Passed cleanly with **0 errors**.

### 3. Existing Master Regression Suite (`scripts/master-regression.mjs`)
* **Total Tests**: **12 / 12 PASSED (100%)**
  * Tests 1–4: Batch limit bypass & scaling (5, 14, 15, and 50 recipients).
  * Test 5: Multiple concurrent campaigns (A=20, B=20, C=20) with zero duplicates.
  * Test 6: Special characters (`&`, `R&D`, `AT&T`, `Johnson & Johnson`).
  * Test 7: Whitespace normalization (Paragraphs, lists, tables).
  * Test 8: Microsoft token endurance (past 4–5 emails).
  * Test 9: Single-flight token refresh mutex.
  * Test 10: Failure isolation.
  * Test 11: Retry failed recipient.
  * Test 12: Recovery from interrupted campaign.

### 4. Independent Rate Limiting Suite (`scripts/verify-independent-rate-limiting.mjs`)
* **Total Tests**: **5 / 5 PASSED (100%)**
  * Single campaign rate limit verification (20 emails/min).
  * 2 concurrent campaigns independence.
  * 3 concurrent campaigns with failure isolation.
  * 20 concurrent campaigns (400 emails total) with zero duplicate sends.
  * Microsoft Graph 429 throttling & mailbox cooldown isolation.

### 5. HTML Encoding Suite (`scripts/verify-html-encoding.mjs`)
* **Total Tests**: **6 / 6 PASSED (100%)**
  * Entity escaping & idempotency.
  * Plain text templates.
  * Spreadsheet placeholder values in HTML templates.
  * Subject line preservation.
  * DOCX OpenXML conversion.
  * Preview vs Graph sendMail parity.

---

## 6. Conclusion

Phase 2 implementation is complete and verified. The External Campaign API is operational, secure, and fully aligned with the architectural specifications established in Phase 0 and Phase 1.
