/**
 * Automated Verification Suite for External Campaign API (Phase 2)
 * Tests:
 * 1. Authentication (missing, invalid, valid token)
 * 2. Request payload validation (missing/invalid fields, empty array, > 250 limit)
 * 3. Email item validation & all-or-nothing failure policy
 * 4. Heterogeneous sender rejection
 * 5. Sender verification against connected Microsoft accounts (422 SENDER_NOT_CONNECTED)
 * 6. Successful campaign creation with connected sender (201 Created)
 * 7. Idempotency duplicate protection (200 OK with duplicate: true)
 * 8. HTML preservation verification in database and email dispatch logic
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load environment variables from .env.local
const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
const env = {};
envFile.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[match[1].trim()] = val;
  }
});

const BASE_URL = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const API_KEY = env.LEADFORGE_API_KEY || "leadforge_sec_k9x2m4p8q1w3v7y5";
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SECRET_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: "public" } });

if (env.SEED_EMAIL && env.SEED_PASSWORD) {
  await supabase.auth.signInWithPassword({
    email: env.SEED_EMAIL,
    password: env.SEED_PASSWORD,
  });
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  passedTests++;
  console.log(`✅ PASSED: ${message}`);
}

console.log("=================================================================");
console.log("=== RUNNING EXTERNAL CAMPAIGN API AUTOMATED TEST SUITE (PHASE 2) ===");
console.log("=================================================================\n");

async function runTests() {
  const endpoint = `${BASE_URL}/api/external/campaigns`;

  // --- SECTION 1: AUTHENTICATION TESTS ---
  console.log("--- SECTION 1: Authentication Tests ---");
  {
    // 1.1 Missing Authorization Header
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignName: "Test", emails: [] }),
    });
    const data = await res.json();
    assert(res.status === 401, "Missing Authorization header returns 401 Unauthorized");
    assert(data.error === "UNAUTHORIZED", "Error code is UNAUTHORIZED");
    assert(data.success === false, "success is false");

    // 1.2 Invalid Bearer Token
    const res2 = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid_secret_key_12345",
      },
      body: JSON.stringify({ campaignName: "Test", emails: [] }),
    });
    const data2 = await res2.json();
    assert(res2.status === 401, "Invalid Bearer token returns 401 Unauthorized");
    assert(data2.error === "UNAUTHORIZED", "Error code is UNAUTHORIZED");

    // 1.3 Wrong scheme (Basic auth)
    const res3 = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic dXNlcjpwYXNz",
      },
      body: JSON.stringify({ campaignName: "Test", emails: [] }),
    });
    assert(res3.status === 401, "Non-Bearer auth scheme returns 401 Unauthorized");
  }

  // --- SECTION 2: REQUEST PAYLOAD VALIDATION ---
  console.log("\n--- SECTION 2: Request Payload Validation ---");
  {
    // 2.1 Invalid JSON body
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: "invalid-json-content",
    });
    const data = await res.json();
    assert(res.status === 400, "Malformed JSON returns 400 Bad Request");
    assert(data.error === "INVALID_JSON", "Error code is INVALID_JSON");

    // 2.2 Missing campaignName
    const res2 = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ emails: [] }),
    });
    const data2 = await res2.json();
    assert(res2.status === 400, "Missing campaignName returns 400 Bad Request");
    assert(data2.error === "INVALID_REQUEST", "Error code is INVALID_REQUEST");

    // 2.3 Empty emails array
    const res3 = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ campaignName: "Valid Name", emails: [] }),
    });
    const data3 = await res3.json();
    assert(res3.status === 400, "Empty emails array returns 400 Bad Request");
    assert(data3.error === "EMPTY_EMAIL_ARRAY", "Error code is EMPTY_EMAIL_ARRAY");

    // 2.4 Oversized array (> 250 items)
    const oversizedEmails = Array.from({ length: 251 }, (_, i) => ({
      to: `user${i}@example.com`,
      from: "sender@example.com",
      subject: "Test",
      body: "<p>Hello</p>",
    }));
    const res4 = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ campaignName: "Oversized Campaign", emails: oversizedEmails }),
    });
    const data4 = await res4.json();
    assert(res4.status === 400, "Array > 250 emails returns 400 Bad Request");
    assert(data4.error === "PAYLOAD_TOO_LARGE", "Error code is PAYLOAD_TOO_LARGE");
  }

  // --- SECTION 3: EMAIL ITEM VALIDATION & ALL-OR-NOTHING POLICY ---
  console.log("\n--- SECTION 3: Item Validation & All-or-Nothing Policy ---");
  {
    // 3.1 Invalid 'to' email
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Test Campaign",
        emails: [
          { to: "valid@example.com", from: "sender@example.com", subject: "Sub", body: "<p>Body</p>" },
          { to: "invalid-email-address", from: "sender@example.com", subject: "Sub", body: "<p>Body</p>" },
        ],
      }),
    });
    const data = await res.json();
    assert(res.status === 400, "Invalid recipient 'to' email returns 400 Bad Request");
    assert(data.error === "INVALID_EMAIL", "Error code is INVALID_EMAIL");
    assert(data.details?.index === 1, "Error details points to exact failing index (1)");
    assert(data.details?.field === "to", "Error details specifies 'to' field");

    // 3.2 Heterogeneous senders in single array
    const res2 = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Multi-Sender Test",
        emails: [
          { to: "alex@example.com", from: "sender1@example.com", subject: "S1", body: "<p>B1</p>" },
          { to: "bob@example.com", from: "sender2@example.com", subject: "S2", body: "<p>B2</p>" },
        ],
      }),
    });
    const data2 = await res2.json();
    assert(res2.status === 400, "Heterogeneous sender addresses return 400 Bad Request");
    assert(data2.error === "HETEROGENEOUS_SENDERS", "Error code is HETEROGENEOUS_SENDERS");
    assert(data2.details?.expected === "sender1@example.com", "Details specify expected sender");
    assert(data2.details?.found === "sender2@example.com", "Details specify conflicting sender");

    // 3.3 Missing HTML body
    const res3 = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Missing Body Test",
        emails: [
          { to: "alex@example.com", from: "sender@example.com", subject: "Subject", body: "" },
        ],
      }),
    });
    const data3 = await res3.json();
    assert(res3.status === 400, "Empty HTML body returns 400 Bad Request");
    assert(data3.error === "INVALID_REQUEST", "Error code is INVALID_REQUEST");
  }

  // --- SECTION 4: SENDER VERIFICATION AGAINST CONNECTED MICROSOFT TOKENS ---
  console.log("\n--- SECTION 4: Sender Verification Against Microsoft Tokens ---");
  {
    // 4.1 Sender not connected in microsoft_tokens
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Unconnected Sender Test",
        emails: [
          {
            to: "client@example.com",
            from: "nonexistent.sender@external.com",
            subject: "Cold Email",
            body: "<p>Hello</p>",
          },
        ],
      }),
    });
    const data = await res.json();
    assert(res.status === 422, "Unconnected sender returns 422 Unprocessable Entity");
    assert(data.error === "SENDER_NOT_CONNECTED", "Error code is SENDER_NOT_CONNECTED");
    assert(data.message.includes("nonexistent.sender@external.com"), "Message mentions the unlinked email address");
  }

  // --- SECTION 5: SUCCESSFUL CAMPAIGN CREATION WITH CONNECTED SENDER ---
  console.log("\n--- SECTION 5: Campaign Creation & Database Persistence ---");
  let testSenderEmail = "";
  let testUserId = "";

  // Query database to find or set up an active Microsoft token for testing
  const { data: existingToken } = await supabase
    .from("microsoft_tokens")
    .select("user_id, microsoft_email")
    .not("microsoft_email", "is", null)
    .neq("microsoft_email", "")
    .limit(1)
    .maybeSingle();

  if (existingToken && existingToken.microsoft_email) {
    testSenderEmail = existingToken.microsoft_email;
    testUserId = existingToken.user_id;
    console.log(`ℹ️ Found existing Microsoft token in DB for sender: '${testSenderEmail}'`);
  } else {
    // If no token exists, look up seed user and insert a mock token for verification
    const { data: seedUser } = await supabase
      .from("campaigns")
      .select("user_id")
      .limit(1)
      .maybeSingle();

    testUserId = seedUser?.user_id || "00000000-0000-0000-0000-000000000001";
    testSenderEmail = "verified.sender@mailcraft.app";

    await supabase.from("microsoft_tokens").upsert({
      user_id: testUserId,
      access_token: "mock_test_token_for_verification",
      refresh_token: "mock_test_refresh_token",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      microsoft_email: testSenderEmail,
    }, { onConflict: "user_id" });
    console.log(`ℹ️ Provisioned test Microsoft token in DB for sender: '${testSenderEmail}'`);
  }

  const testIdempotencyKey = `idemp-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  let createdCampaignId = "";

  {
    const richHtmlBody1 = `<p>Hello Alex,</p><p>We noticed your expansion into <strong>distributed databases</strong>.</p><table border="1"><tr><td>Metric</td><td>Value</td></tr><tr><td>Uptime</td><td>99.99%</td></tr></table><p><a href="https://example.com/demo">Book a Demo</a></p>`;
    const richHtmlBody2 = `<p>Hello Jordan,</p><p>Great meeting you at the <em>AI Summit</em>.</p><ul><li>Followup item 1</li><li>Followup item 2</li></ul>`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "Idempotency-Key": testIdempotencyKey,
      },
      body: JSON.stringify({
        campaignName: "LeadForge Automated Outreach",
        emails: [
          {
            to: "alex.prospect@clientdomain.com",
            from: testSenderEmail,
            subject: "Partnership opportunity for Q1",
            body: richHtmlBody1,
          },
          {
            to: "jordan.prospect@clientdomain.com",
            from: testSenderEmail,
            subject: "Follow up from AI Summit",
            body: richHtmlBody2,
          },
        ],
      }),
    });

    const data = await res.json();
    if (res.status !== 201) {
      console.error("Section 5 unexpected status:", res.status, "data:", data);
    }
    assert(res.status === 201, "Valid campaign creation returns 201 Created");
    assert(data.success === true, "success is true in response");
    assert(typeof data.campaignId === "string" && data.campaignId.length > 0, "campaignId is returned");
    assert(data.status === "sending", "Initial campaign status is 'sending'");
    assert(data.totalEmails === 2, "totalEmails is 2");
    assert(data.sender === testSenderEmail.toLowerCase(), "Sender is reported accurately");
    assert(data.campaignName === "LeadForge Automated Outreach", "Clean campaignName is returned");

    createdCampaignId = data.campaignId;

    // Verify campaign record in database
    const { data: dbCampaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", createdCampaignId)
      .single();

    assert(Boolean(dbCampaign), "Campaign record exists in Supabase 'campaigns' table");
    assert(dbCampaign.status === "sending", "Database campaign status is 'sending'");
    assert(dbCampaign.rate_limit === 20, "Default rate limit is 20");
    assert(dbCampaign.subject_template === "{{subject}}", "subject_template is '{{subject}}'");
    assert(dbCampaign.body_template === "{{body}}", "body_template is '{{body}}'");

    // Verify recipient records in database
    const { data: dbRecipients } = await supabase
      .from("recipients")
      .select("*")
      .eq("campaign_id", createdCampaignId)
      .order("created_at", { ascending: true });

    assert(dbRecipients && dbRecipients.length === 2, "Exactly 2 recipient records inserted");
    assert(dbRecipients[0].email === "alex.prospect@clientdomain.com", "First recipient email is correct");
    assert(dbRecipients[1].email === "jordan.prospect@clientdomain.com", "Second recipient email is correct");
    assert(dbRecipients[0].status === "pending" || dbRecipients[0].status === "sending", "Recipient status initialized as pending/sending");
    assert(dbRecipients[0].data.__is_html_body === "true", "data.__is_html_body flag is true");
    assert(dbRecipients[0].data.body === richHtmlBody1, "Rich HTML body stored verbatim without tag stripping or &lt;p&gt; escaping");
    assert(dbRecipients[0].data.subject === "Partnership opportunity for Q1", "Recipient subject stored in data dictionary");
  }

  // --- SECTION 6: IDEMPOTENCY / DUPLICATE PROTECTION ---
  console.log("\n--- SECTION 6: Idempotency Protection ---");
  {
    // Re-submit the exact same payload with the identical Idempotency-Key
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "Idempotency-Key": testIdempotencyKey,
      },
      body: JSON.stringify({
        campaignName: "LeadForge Automated Outreach",
        emails: [
          {
            to: "alex.prospect@clientdomain.com",
            from: testSenderEmail,
            subject: "Partnership opportunity for Q1",
            body: "<p>Duplicate body attempt</p>",
          },
          {
            to: "jordan.prospect@clientdomain.com",
            from: testSenderEmail,
            subject: "Follow up from AI Summit",
            body: "<p>Duplicate body attempt 2</p>",
          },
        ],
      }),
    });

    const data = await res.json();
    assert(res.status === 200, "Duplicate request with same Idempotency-Key returns 200 OK");
    assert(data.success === true, "success is true");
    assert(data.duplicate === true, "duplicate flag is true");
    assert(data.campaignId === createdCampaignId, "Returns identical existing campaignId");
    assert(data.message.includes("already exists"), "Friendly duplicate message returned");

    // Verify in database that NO second campaign was created
    const { count: campaignCount } = await supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .ilike("name", `%[idempotency:${testIdempotencyKey}]%`);

    assert(campaignCount === 1, "Database contains exactly ONE campaign for this idempotency key (no duplicate)");
  }

  // --- SECTION 7: HTML PRESERVATION DISPATCH LOGIC ---
  console.log("\n--- SECTION 7: HTML Preservation Dispatch Unit Verification ---");
  {
    const { cleanHtmlWhitespace, autoLinkHtml } = await import("../lib/email/template.ts");

    const sampleHtml = `<p>Hello <strong>World</strong>,</p><p>Check <a href="https://example.com">this link</a>.</p>`;
    const processedHtml = autoLinkHtml(cleanHtmlWhitespace(sampleHtml));

    assert(!processedHtml.includes("&lt;p&gt;"), "Processed HTML does not escape <p> tags into &lt;p&gt;");
    assert(!processedHtml.includes("&lt;strong&gt;"), "Processed HTML does not escape <strong> tags");
    assert(processedHtml.includes("<p>"), "Native <p> tag preserved");
    assert(processedHtml.includes("<strong>"), "Native <strong> tag preserved");
    assert(processedHtml.includes("href=\"https://example.com\""), "Link href preserved");
  }

  console.log("\n=================================================================");
  console.log(`✨ ALL ${passedTests} EXTERNAL CAMPAIGN API TESTS PASSED PERFECTLY! (${passedTests}/${totalTests})`);
  console.log("=================================================================");
}

runTests().catch((err) => {
  console.error("FATAL ERROR in test execution:", err);
  process.exit(1);
});
