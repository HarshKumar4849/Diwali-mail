# Mailcraft — External Campaign API
## Phase 5 — Production Readiness Audit

**Document Version:** 1.0.0  
**Date:** September 23, 2026  
**Auditor:** Antigravity AI Agent  
**Endpoint:** `POST /api/external/campaigns`  
**Target Consumers:** LeadForge & external integrations  
**Deployment Target Status:** **READY FOR PRODUCTION** (0 P0, 0 P1 blockers)

---

## 1. Executive Summary

A comprehensive production readiness audit was performed across the Mailcraft External Campaign API, covering security, reliability, data protection, build verification, and runtime environments.

| Metric | Result | Status |
| :--- | :--- | :--- |
| **P0 Blockers (Critical / Security)** | **0** | Pass |
| **P1 Blockers (Important Regressions)** | **0** | Pass |
| **P2 Minor Issues** | **0** | Pass |
| **P3 Operational Notes** | **1** (Serverless execution duration advisory) | Info |
| **Credential Exposure / Leakage** | **0 exposed** (verified across Git, logs, responses, env) | Secure |
| **TypeScript Compilation** | **0 errors** (`npx tsc --noEmit`) | Pass |
| **ESLint Verification** | **0 errors** (`npm run lint`) | Pass |
| **Production Build** | **Compiled successfully** (`next build --webpack` exit code 0) | Pass |
| **Existing Mailcraft Regressions** | **0 regressions** (Phase 4 30-point audit verified) | Pass |

---

## 2. Security Audit & Credential Protection

A multi-vector security verification was conducted to ensure zero leakage of confidential data:

### 2.1 Credential Exposure Verification

| Asset | Git Tracked? | Returned in API? | Printed in Logs? | Exposed via `NEXT_PUBLIC_`? | Verdict |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **LeadForge API Key** (`LEADFORGE_API_KEY`) | No | No | No | No | Secure |
| **Microsoft Client Secret** (`MICROSOFT_CLIENT_SECRET`) | No | No | No | No | Secure |
| **OAuth Access / Refresh Tokens** | No | No | No | No | Secure |
| **Supabase Secret Key** (`SUPABASE_SECRET_KEY`) | No | No | No | No | Secure |
| **Seed Password / Database Passwords** | No | No | No | No | Secure |

### 2.2 Proof of Security Controls
- **`.gitignore` Rules**: `*.local` and `.env` are strictly excluded from source control.
- **Git Tree Check**: Only `.env.local.example` (containing dummy placeholder strings) is tracked in Git.
- **Timing-Safe Authentication**: API key authentication in `isAuthorized(req)` uses Node.js `crypto.timingSafeEqual` with strict buffer length checks to eliminate timing attacks.
- **Sanitized Responses**: Error messages return standard error codes (`UNAUTHORIZED`, `INVALID_REQUEST`, `SENDER_NOT_CONNECTED`, `PROVIDER_AUTH_FAILED`, etc.) without echoing back received tokens or stack traces.
- **Zero Logging of Sensitive Data**: `app/api/external/campaigns/route.ts` contains zero `console.log` statements. Logging in `lib/campaign/processor.ts` outputs only operational IDs (campaign ID, recipient email, rate limit) and never authorization headers or email bodies.

---

## 3. Comprehensive 20-Point Audit

### 1. API Authentication
- **Status:** PASS
- **Implementation:** Validates incoming `Authorization: Bearer <token>` against server environment variable `LEADFORGE_API_KEY`.
- **Security:** Timing-safe constant-time comparison via `crypto.timingSafeEqual`. Immediate `401 Unauthorized` on missing or malformed headers.

### 2. API Key Security
- **Status:** PASS
- **Implementation:** Secret stored exclusively on server. Never prefixed with `NEXT_PUBLIC_`. Mismatched token lengths safely return `false` before buffer equality check.

### 3. Environment Variables
- **Status:** PASS
- **Implementation:** Clean separation between public browser variables (`NEXT_PUBLIC_*`) and private server secrets. Documented in `.env.local.example`.

### 4. Production Database
- **Status:** PASS
- **Implementation:** Uses Supabase PostgreSQL. External endpoint utilizes `getAdminClient()` (service role `SUPABASE_SECRET_KEY`) in production to bypass RLS safely on the server.
- **Integrity:** If recipient batch insert fails after campaign creation, manual rollback deletes the campaign record, preventing orphaned data.

### 5. Microsoft OAuth
- **Status:** PASS
- **Implementation:** Existing OAuth flow (`/api/auth/microsoft` and `/api/auth/callback`) is completely untouched. Microsoft account connection remains isolated in Settings.

### 6. Microsoft Token Refresh
- **Status:** PASS
- **Implementation:** Uses existing `getValidAccessToken()` in `lib/graph/client.ts`. Tokens expiring within 5 minutes are automatically refreshed against Microsoft Azure AD token endpoint.
- **Pre-flight Check:** External route verifies token validity upfront, failing fast with `403 PROVIDER_AUTH_FAILED` if Microsoft credentials require reconnection.

### 7. Microsoft Graph Permissions
- **Status:** PASS
- **Implementation:** Requires delegated permissions (`Mail.Send`, `User.Read`, `offline_access`). Mail delivery uses `/me/sendMail` on behalf of the verified connected user.

### 8. Sender Validation
- **Status:** PASS
- **Implementation:** Checks `emails[].from` against `microsoft_tokens.microsoft_email`.
- **Anti-Spoofing:** Rejects unauthenticated senders with `422 Unprocessable Entity` (`SENDER_NOT_CONNECTED`). Enforces uniform `from` across all emails in a campaign (`HETEROGENEOUS_SENDERS`).

### 9. Request-Size Limits
- **Status:** PASS
- **Limits Enforced:**
  - Campaign Name: Max 255 characters.
  - Subject: Max 500 characters.
  - Email Body: Max 500 KB per email (`MAX_BODY_BYTES = 500 * 1024`).
  - Next.js HTTP parser protects against payload exhaustion attacks.

### 10. Email-Array Limits
- **Status:** PASS
- **Limits Enforced:**
  - Minimum: 1 email (empty array rejected with `400 EMPTY_EMAIL_ARRAY`).
  - Maximum: 250 emails per request (exceeding rejected with `400 PAYLOAD_TOO_LARGE`).

### 11. Rate Limiting
- **Status:** PASS
- **Implementation:** Employs token-bucket rate limiter (`rate_limit: 20` emails/min default).
- **Mailbox Pacing:** `MIN_MAILBOX_REQUEST_INTERVAL_MS = 150` micro-pacer protects Microsoft Graph endpoints from socket floods when concurrent campaigns share a mailbox.

### 12. Idempotency
- **Status:** PASS
- **Implementation:** Supports `Idempotency-Key` header (truncated safely to 128 characters).
- **TTL:** 24-hour deduplication window. Existing matching campaigns return `200 OK` with `{ duplicate: true, campaignId }` without duplicating rows or re-sending emails.

### 13. Error Handling
- **Status:** PASS
- **Implementation:** Strict HTTP status code mapping (400, 401, 403, 422, 500). Standardized JSON structure: `{ success: false, error: CODE, message: string, details?: any }`.

### 14. Logging
- **Status:** PASS
- **Implementation:** No sensitive credentials or user bodies logged. Errors in background loop log operational error messages without exposing private keys.

### 15. Sensitive-Data Protection
- **Status:** PASS
- **Implementation:** Verified that zero secrets are exposed in Git history, build bundles, logs, or API responses.

### 16. Vercel / Serverless Compatibility
- **Status:** PASS (with operational consideration)
- **Implementation:** `POST /api/external/campaigns` returns immediately (HTTP 201) after enqueuing rows and invoking `startCampaignProcessor(campaignId)`.
- **Runtime Note:** In long-running Node.js environments (VPS, Docker, Railway, Render), the processor completes all 250 emails smoothly. On Vercel Serverless Functions, maximum function execution timeout (Hobby: 10s–60s; Pro: 15s–300s) can pause asynchronous background promises after HTTP termination.
- **Recommended Operational Strategy:** For Vercel deployments, either configure Vercel Cron to invoke `/api/campaigns/[id]/process-batch` with `x-internal-token`, or host the Mailcraft backend on a persistent Node.js runtime.

### 17. Build
- **Status:** PASS
- **Verification:** `npm run build` completed with exit code 0. Generated 20 static and dynamic routes including `/api/external/campaigns`.

### 18. TypeScript
- **Status:** PASS
- **Verification:** `npx tsc --noEmit` completed with 0 errors.

### 19. ESLint
- **Status:** PASS
- **Verification:** `npm run lint` completed with 0 errors.

### 20. Existing Mailcraft Functionality
- **Status:** PASS
- **Verification:** Phase 4 regression audit confirmed 100% of existing functionality intact (UI campaign creation, DOCX import, templates, OAuth, settings, manual sending).

---

## 4. Blockers & Risks

### Blockers (P0 / P1)
- **None.** There are zero P0 or P1 blockers.

### Risks & Mitigations (P2 / P3)

| Risk ID | Severity | Description | Mitigation Strategy |
| :--- | :---: | :--- | :--- |
| **RISK-01** | P3 | **Serverless Function Duration Limits**<br>If hosted on Vercel without a persistent runner, a 250-email campaign at 20 emails/min takes ~12.5 minutes, exceeding the default 60s/300s serverless execution timeout. | **Mitigation:** Run Mailcraft on a persistent Node runtime (Docker / Railway / VPS / VM) OR use scheduled cron / QStash triggers against `/api/campaigns/[id]/process-batch` with `x-internal-token: SUPABASE_SECRET_KEY`. |
| **RISK-02** | P3 | **Microsoft Graph Mailbox Throttling**<br>Sending large volumes from a single Outlook 365 mailbox can trigger Microsoft Graph HTTP 429 throttling. | **Mitigation:** The built-in adaptive delay and `paceMailboxRequest(userId)` enforce rate limits and retry with exponential backoff on 429 responses. |

---

## 5. Required Production Environment Variables

Configure these variables in your production environment (e.g. Vercel Project Settings, Railway Variables, or Docker `.env`):

```bash
# ==============================================================================
# REQUIRED PRODUCTION ENVIRONMENT VARIABLES (BY NAME ONLY)
# ==============================================================================

# 1. External API Authentication
LEADFORGE_API_KEY

# 2. Supabase Infrastructure
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY

# 3. Application Base URL
NEXT_PUBLIC_APP_URL

# 4. Microsoft 365 Outlook OAuth & Graph API
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_TENANT_ID

# 5. Local Fallback / Seed Account (Optional in Production)
SEED_EMAIL
SEED_PASSWORD
```

> [!IMPORTANT]
> - `LEADFORGE_API_KEY` must be a high-entropy cryptographically secure string (e.g., generated with `openssl rand -hex 32`).
> - `SUPABASE_SECRET_KEY` is required in production so `getAdminClient()` can execute server-side administrative queries bypassing RLS.

---

## 6. Pre-Deployment Checklist

Before deploying this release to production:

- [x] **Code Validation**: `npm run lint` passes with 0 errors.
- [x] **Type Check**: `npx tsc --noEmit` passes with 0 errors.
- [x] **Build Verification**: `npm run build` succeeds cleanly with exit code 0.
- [x] **Regression Suite**: Phase 4 30-point regression audit completed with 0 regressions.
- [x] **Security Check**: No credentials, private tokens, or secrets committed to Git.
- [ ] **Production Env Setup**: Add `LEADFORGE_API_KEY` to production hosting environment variables.
- [ ] **Production Env Setup**: Verify `SUPABASE_SECRET_KEY` is configured in production.
- [ ] **Microsoft App Registration**: Verify Azure AD redirect URI matches `https://<your-production-domain>/api/auth/microsoft/callback`.
- [ ] **Sender Connection**: Ensure the target sender account logs in to Mailcraft and connects their Microsoft 365 Outlook mailbox via Settings prior to LeadForge campaign dispatches.

---

## 7. Deployment Checklist

Follow these steps during deployment:

1. **Deploy Build**: Deploy branch `deploy/v1-docx-list-fix` to the production environment.
2. **Verify Health**: Visit `https://<production-domain>/login` to confirm web application availability.
3. **Smoke Test External API Authentication**:
   ```bash
   curl -i -X POST "https://<production-domain>/api/external/campaigns" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   *Expected Response:* `HTTP 401 Unauthorized` (`{"success":false,"error":"UNAUTHORIZED",...}`)
4. **Smoke Test Authorized Empty Payload**:
   ```bash
   curl -i -X POST "https://<production-domain>/api/external/campaigns" \
     -H "Authorization: Bearer <LEADFORGE_API_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"campaignName":"Smoke Test","emails":[]}'
   ```
   *Expected Response:* `HTTP 400 Bad Request` (`{"success":false,"error":"EMPTY_EMAIL_ARRAY",...}`)
5. **Verify UI Campaign Functionality**: Ensure existing UI wizard and campaign list load as expected.

---

## 8. Rollback Considerations

In the event of an unexpected runtime failure in production:

1. **Isolation Guarantee**: The external campaign API is fully isolated within `app/api/external/campaigns/route.ts`. No shared database tables, existing route signatures, or UI workflows were modified.
2. **Instant External Kill-Switch**: To instantly disable the external API without redeploying code, invalidate or remove `LEADFORGE_API_KEY` from the production environment settings. All external requests will immediately receive `401 Unauthorized`.
3. **Code Rollback**:
   - Revert commit or redeploy previous production release tag.
   - The minimal changes in `lib/email/send.ts` (HTML handling) and `lib/supabase/admin.ts` (`getAdminClient`) are strictly backward-compatible and will not harm earlier states if left intact.
4. **Data Integrity on Rollback**: Any campaigns created by LeadForge exist as standard rows in the `campaigns` and `recipients` tables. They can be inspected, paused, or deleted from the Mailcraft dashboard at any time.

---

## 9. Conclusion & Sign-Off

The External Campaign API meets all production criteria:
- **Security:** Verified zero credential leakage, timing-safe authentication, and sender spoofing protection.
- **Stability:** 100% build, TypeScript, and lint verification.
- **Compatibility:** Complete non-breaking coexistence with existing Mailcraft UI, campaign processor, and Microsoft Graph integration.

**Production Deployment Decision: APPROVED FOR PRODUCTION DEPLOYMENT**
