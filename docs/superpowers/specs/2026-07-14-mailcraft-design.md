# Mailcraft — Design Doc

## Overview

Mailcraft is a PWA for sending personalized bulk emails via Microsoft Outlook (Graph API). Users upload a CSV of recipients, write a template with `{{placeholder}}` syntax mapped to CSV columns, attach documents (global and per-recipient), configure BCC/CC, and send with rate-limited queuing.

## Architecture

```
Browser (PWA)  ←→  Next.js App (API + Server Pages)
                        ↕
                    Supabase
                 ├── Postgres (campaigns, recipients, send logs)
                 ├── Auth (Microsoft OAuth)
                 ├── Storage (uploaded attachments)
                 └── Realtime (send progress to UI)
                        ↕
              Microsoft Graph API → Outlook
```

- **Frontend**: Next.js PWA with React, installable, works offline for composing
- **Backend**: Next.js API routes handle OAuth, campaign management, email queue
- **Supabase**: Postgres DB, Auth (Microsoft OAuth), Storage (attachments), Realtime (progress)
- **Email sending**: Microsoft Graph API via `@microsoft/microsoft-graph-client`, queued server-side with rate limits

## Data Model

### Campaign
- `id`, `name`, `status` (draft/sending/done/partial)
- `subject_template`, `body_template` — with `{{placeholder}}` syntax
- `global_bcc`, `global_cc` — comma-separated emails
- `rate_limit` — emails per minute
- `created_at`, `updated_at`

### Recipient
- `id`, `campaign_id`
- `email`
- `data` — JSON blob of all CSV columns for this row
- `attachment_path` — optional, per-recipient file reference
- `status` — pending/sent/failed
- `error_message`, `sent_at`, `retry_count`

### SendLog
- `id`, `campaign_id`, `recipient_id`
- `status` — sent/failed
- `error_message`
- `created_at`

### Attachment
- `id`, `campaign_id`
- `file_path` — Supabase Storage path
- `original_name`
- `type` — global / per-recipient
- `csv_column` — if per-recipient, which CSV column maps to it

## UI Flow

### Pages
1. **Dashboard** — list campaigns with status, create new campaign button
2. **Campaign Editor** (multi-step wizard):
   - Step 1: Setup — name, upload CSV, preview parsed columns
   - Step 2: Template — subject + body with `{{column}}` placeholders, live preview using first CSV row
   - Step 3: Attachments — upload global files, optionally map a CSV column for per-recipient files
   - Step 4: Recipients — view parsed list, filter, exclude individuals
   - Step 5: Send Config — global BCC/CC, rate limit, schedule (optional)
   - Step 6: Review & Send — summary, confirm, queue
3. **Campaign Detail** — real-time progress (via Supabase Realtime), per-recipient status table, retry failed button
4. **Settings** — Microsoft OAuth connect/disconnect, linked account info

### Key UX details
- Placeholder autocomplete while typing in the template editor
- CSV preview with column detection on upload
- Template preview rendered with first CSV row's data
- Real-time "X of Y sent" counter with progress bar
- Individual recipient status colors (green/orange/red)

## Sending Pipeline

1. **Queue**: User hits "Send" → all recipients get `status=pending` in the DB
2. **Worker**: A Next.js API endpoint (`/api/campaigns/[id]/process-batch`) picks up pending recipients in batches, respecting `rate_limit`. Triggered by an external cron service (e.g., cron-job.org pinging every minute) or an internal `setInterval` if the app runs persistently.
3. **Per-email loop**:
   - Resolve `{{placeholders}}` from recipient's `data` JSON
   - Attach global files from Supabase Storage
   - Attach per-recipient file if specified (from URL or Storage)
   - Send via Microsoft Graph API `sendMail`
   - Update status → `sent` or `failed` with error message
4. **Retry**: Up to 3 retries for failed sends with exponential backoff
5. **Realtime**: Supabase Realtime pushes status changes to the UI

### Error handling
- **429 rate limit**: Exponential backoff, respect `Retry-After` header
- **Invalid email**: Skip, mark as `failed` with reason
- **OAuth token expiry**: Auto-refresh via Supabase Auth or MSAL refresh flow
- **Network failure**: Retry with backoff, mark `failed` after 3 attempts

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js (App Router, TypeScript) |
| PWA | `@serwist/next` or `next-pwa` |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase Postgres |
| Auth | Supabase Auth + Microsoft OAuth |
| Storage | Supabase Storage |
| Realtime | Supabase Realtime |
| Graph API | `@microsoft/microsoft-graph-client` |
| Queue | In-process (Next.js API route called via cron-job.org or similar; or Bull + Redis for larger scale) |
| Deployment | Docker / Vercel / any Node host |
