# Mailcraft Email Campaign API — Integration Handover Guide

> **For:** LeadForge Development Team  
> **System:** Mailcraft REST API  
> **Version:** 1.0.0  
> **Date:** September 2026  

---

## 1. Overview

Mailcraft exposes a high-throughput REST API that allows **LeadForge** to dispatch email campaigns directly through verified corporate **Microsoft 365 Outlook** accounts.

All emails sent via this endpoint:
- Are delivered directly through real Microsoft 365 mailboxes (`/me/sendMail`).
- Automatically inherit corporate SPF, DKIM, and DMARC reputations.
- Appear in the sender's real Outlook **"Sent Items"** folder.
- Have replies routed directly back to the sender's Outlook inbox.

---

## 2. Base URLs & Endpoint

| Environment | Base URL | Full Endpoint URL |
| :--- | :--- | :--- |
| **Production** | `https://mailcraft-smoky.vercel.app` | `https://mailcraft-smoky.vercel.app/api/external/campaigns` |
| **Local / Dev** | `http://localhost:3000` | `http://localhost:3000/api/external/campaigns` |

- **HTTP Method:** `POST`

---

## 3. Authentication & Headers

Every request must include your secret API key in the standard `Authorization` header:

```http
POST /api/external/campaigns HTTP/1.1
Host: mailcraft-smoky.vercel.app
Authorization: Bearer YOUR_LEADFORGE_API_KEY
Content-Type: application/json
Idempotency-Key: your-unique-job-id-12345
```

### Headers Explained:
- **`Authorization`** *(Required)*: `Bearer <YOUR_API_KEY>`
- **`Content-Type`** *(Required)*: `application/json`
- **`Idempotency-Key`** *(Optional but strongly recommended)*: A unique string (UUID or job ID, max 128 chars) identifying your batch. If a network blip occurs and you retry the exact same request within 24 hours, Mailcraft returns the existing campaign without sending duplicate emails.

---

## 4. Request Payload Schema

```json
{
  "campaignName": "LeadForge Q4 Outreach",
  "emails": [
    {
      "to": "sarah.prospect@targetcompany.com",
      "from": "sales.rep@yourcompany.com",
      "subject": "Quick question regarding your workflow",
      "body": "<p>Hi Sarah,</p><p>I noticed your recent announcement and wanted to reach out regarding our <strong>workflow solution</strong>.</p><p>Check out our <a href='https://example.com/demo'>live demo</a>.</p>"
    },
    {
      "to": "david.prospect@targetcompany.com",
      "from": "sales.rep@yourcompany.com",
      "subject": "Introductory discussion",
      "body": "<p>Hi David,</p><p>Would love to connect regarding your recent updates.</p>"
    }
  ]
}
```

### Field Definitions:

| Field | Type | Required? | Constraints | Description |
| :--- | :---: | :---: | :--- | :--- |
| `campaignName` | `string` | **Yes** | Max 255 chars | The title of the campaign in Mailcraft. |
| `emails` | `array` | **Yes** | 1 to 250 items | List of recipient email objects. |
| `emails[].to` | `string` | **Yes** | Valid email syntax | Recipient email address. |
| `emails[].from` | `string` | **Yes** | Must match verified sender | Sender's Microsoft 365 email. **All emails in a single request must share the same `from` address.** |
| `emails[].subject` | `string` | **Yes** | Max 500 chars | Subject line. |
| `emails[].body` | `string` | **Yes** | Max 500 KB | Raw HTML body of the email. |

---

## 5. Important Rules & Requirements

### 1. Sender Account Verification
Before sending emails from `sales.rep@yourcompany.com`:
- That user must log in to the Mailcraft web app once and connect their Microsoft 365 Outlook account (**Settings** → **Connect Microsoft Account**).
- If an unlinked `from` address is submitted, the API rejects the request with HTTP `422 SENDER_NOT_CONNECTED`.

### 2. HTML Email Bodies
- The `body` property accepts standard HTML tags (`<p>`, `<strong>`, `<em>`, `<a>`, `<ul>`, `<ol>`, `<li>`, `<table>`, `<span>`, inline `style="..."`).
- HTML tags are **never** escaped to plain text (e.g. `<p>` remains `<p>`).
- Full Unicode and emoji characters are supported (e.g. 🚗, 🤝, 1️⃣).

### 3. Batch Limits
- Maximum batch size: **250 emails per request**.
- If you have 1,000 emails, split them into 4 separate requests of 250 each.

---

## 6. Responses

### Successful Dispatch (HTTP 201 Created)
Mailcraft enqueues the campaign and starts the background delivery worker immediately:
```json
{
  "success": true,
  "campaignId": "ee117c62-69b6-45a1-9566-8067d71ee996",
  "campaignName": "LeadForge Q4 Outreach",
  "status": "sending",
  "totalEmails": 2,
  "sender": "sales.rep@yourcompany.com",
  "createdAt": "2026-09-23T18:46:10.326Z",
  "processor": "Processor started for campaign ee117c62-69b6-45a1-9566-8067d71ee996"
}
```

### Idempotent Duplicate Response (HTTP 200 OK)
Returned if the same `Idempotency-Key` is resent within 24 hours:
```json
{
  "success": true,
  "duplicate": true,
  "campaignId": "ee117c62-69b6-45a1-9566-8067d71ee996",
  "campaignName": "LeadForge Q4 Outreach",
  "status": "sending",
  "totalEmails": 2,
  "sender": "sales.rep@yourcompany.com",
  "createdAt": "2026-09-23T18:46:10.326Z",
  "message": "Campaign with this Idempotency-Key already exists and is currently processing."
}
```

---

## 7. Error Codes Reference

All errors return JSON in this format:
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human readable description",
  "details": {}
}
```

| HTTP Status | Error Code | Description / Remedy |
| :---: | :--- | :--- |
| `401` | `UNAUTHORIZED` | Missing or invalid API key in `Authorization` header. |
| `400` | `INVALID_JSON` | Malformed JSON in request body. |
| `400` | `INVALID_REQUEST` | Missing `campaignName`, empty `subject`, or empty `body`. |
| `400` | `EMPTY_EMAIL_ARRAY` | `emails` array is empty. |
| `400` | `PAYLOAD_TOO_LARGE` | `emails` array has >250 items, or body exceeds 500 KB. |
| `400` | `INVALID_EMAIL` | Malformed email syntax. Look at `details.index` and `details.field`. |
| `400` | `HETEROGENEOUS_SENDERS` | Differing `from` addresses in the same array. All must match. |
| `422` | `SENDER_NOT_CONNECTED` | Sender has not connected Microsoft 365 Outlook in Mailcraft Settings. |
| `403` | `PROVIDER_AUTH_FAILED` | Microsoft token expired/revoked. User must reconnect in Mailcraft Settings. |
| `500` | `DATABASE_ERROR` | Database insertion error (safe to retry with same `Idempotency-Key`). |

---

## 8. Integration Code Samples

### cURL
```bash
curl -X POST "https://mailcraft-smoky.vercel.app/api/external/campaigns" \
  -H "Authorization: Bearer YOUR_LEADFORGE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: job-uuid-001" \
  -d '{
    "campaignName": "LeadForge Outreach",
    "emails": [
      {
        "to": "client@example.com",
        "from": "verified.sender@yourcompany.com",
        "subject": "Hello from LeadForge",
        "body": "<h2>Welcome!</h2><p>This email was dispatched via <strong>Mailcraft</strong>.</p>"
      }
    ]
  }'
```

### Node.js / TypeScript (Fetch)
```typescript
async function dispatchCampaign() {
  const API_URL = "https://mailcraft-smoky.vercel.app/api/external/campaigns";
  const API_KEY = process.env.LEADFORGE_API_KEY;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `leadforge-${Date.now()}`,
    },
    body: JSON.stringify({
      campaignName: "LeadForge Product Announcement",
      emails: [
        {
          to: "lead@example.com",
          from: "verified.sender@yourcompany.com",
          subject: "Exclusive Update",
          body: "<p>Hi,</p><p>We are thrilled to share our <strong>latest updates</strong>.</p>",
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Mailcraft Error [${response.status}]: ${data.message} (${data.error})`);
  }

  console.log("Campaign successfully created:", data.campaignId);
  return data;
}
```

### Python (Requests)
```python
import requests
import uuid

API_URL = "https://mailcraft-smoky.vercel.app/api/external/campaigns"
API_KEY = "YOUR_LEADFORGE_API_KEY"

payload = {
    "campaignName": "LeadForge Python Outreach",
    "emails": [
        {
            "to": "client@example.com",
            "from": "verified.sender@yourcompany.com",
            "subject": "Greetings from LeadForge",
            "body": "<p>Hello,</p><p>Sent programmatically via <strong>Mailcraft</strong>.</p>"
        }
    ]
}

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "Idempotency-Key": str(uuid.uuid4())
}

response = requests.post(API_URL, json=payload, headers=headers)
data = response.json()

if response.status_code == 201:
    print(f"Success! Campaign ID: {data['campaignId']}")
else:
    print(f"Failed [{response.status_code}]: {data.get('message')}")
```

---

## 9. Delivery & Monitoring

1. **Throttling & Pacing:** Mailcraft automatically rate-limits sending at **20 emails per minute** with a **150ms micro-delay** to comply with Microsoft Graph sending guidelines and protect mailbox reputation.
2. **Retry Logic:** If Microsoft returns a temporary socket error or 429 throttling response, Mailcraft automatically retries with exponential backoff up to 3 times.
3. **Web Dashboard:** Anyone on your team can log in to Mailcraft at `https://mailcraft-smoky.vercel.app` to see real-time campaign progress, delivery counts, and recipient details.
