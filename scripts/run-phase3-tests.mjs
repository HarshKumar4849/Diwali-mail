/**
 * Phase 3 Automated Test Suite
 * Tests 1 through 12 for POST /api/external/campaigns
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

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

const testResults = [];

function recordResult(testName, expected, actual, passed, details = "") {
  testResults.push({
    test: testName,
    expected,
    actual,
    result: passed ? "PASSED" : "FAILED",
    details,
  });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} [${passed ? "PASSED" : "FAILED"}] ${testName}`);
  console.log(`   Expected: ${expected}`);
  console.log(`   Actual:   ${actual}`);
  if (details) console.log(`   Details:  ${details}`);
  console.log("");
}

async function runPhase3() {
  const endpoint = `${BASE_URL}/api/external/campaigns`;

  // Resolve active connected Microsoft sender
  const { data: tokenRow } = await supabase
    .from("microsoft_tokens")
    .select("user_id, microsoft_email")
    .not("microsoft_email", "is", null)
    .neq("microsoft_email", "")
    .limit(1)
    .maybeSingle();

  const validSender = tokenRow?.microsoft_email || "yogeshumbarkar@tecmotivsolutions.com";
  console.log(`Using connected sender for valid tests: ${validSender}\n`);

  // =========================================================================
  // TEST 1 — Small Campaign (3 emails)
  // =========================================================================
  {
    const testName = "TEST 1 — Small campaign (3 emails)";
    const reqBody = {
      campaignName: "Phase3 Test 1 Small Campaign",
      emails: [
        { to: "lead1@enterprise.com", from: validSender, subject: "Welcome Lead 1", body: "<p>Hello Lead 1</p>" },
        { to: "lead2@enterprise.com", from: validSender, subject: "Welcome Lead 2", body: "<p>Hello Lead 2</p>" },
        { to: "lead3@enterprise.com", from: validSender, subject: "Welcome Lead 3", body: "<p>Hello Lead 3</p>" },
      ],
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(reqBody),
    });

    const data = await res.json();
    let passed = false;
    let actualMsg = "";

    if (res.status === 201 && data.success && data.campaignId) {
      // Check database persistence
      const { data: camp } = await supabase.from("campaigns").select("*").eq("id", data.campaignId).single();
      const { data: recs } = await supabase.from("recipients").select("*").eq("campaign_id", data.campaignId).order("email");

      const campValid = camp && camp.status === "sending" && camp.subject_template === "{{subject}}";
      const recsValid = recs && recs.length === 3 && recs[0].data.subject === "Welcome Lead 1";
      const htmlPreserved = recs && recs[0].data.body === "<p>Hello Lead 1</p>";

      passed = campValid && recsValid && htmlPreserved;
      actualMsg = `HTTP 201, campaignId: ${data.campaignId}, status: ${data.status}, totalEmails: ${data.totalEmails}, recipientsStored: ${recs?.length}, HTMLPreserved: ${htmlPreserved}`;
    } else {
      actualMsg = `HTTP ${res.status}: ${JSON.stringify(data)}`;
    }

    recordResult(
      testName,
      "HTTP 201 Created, campaign status 'sending', 3 recipients stored with correct subjects and HTML preserved",
      actualMsg,
      passed
    );
  }

  // =========================================================================
  // TEST 2 — HTML Preservation (Paragraphs, Bold, Links, Lists, Special Chars, Ampersands, Unicode)
  // =========================================================================
  {
    const testName = "TEST 2 — HTML Preservation (paragraphs, bold, links, lists, special chars, ampersands, Unicode)";
    const richHtml = `<p>Dear <strong>Valued Partner</strong> &amp; Colleague,</p><p>We are thrilled to announce our Q1 expansion: &quot;Project Horizon&quot; (5 &lt; 10 &gt; 2)!</p><ul><li>Feature A: High Availability (99.99%)</li><li>Feature B: Integrated CRM &amp; Analytics</li></ul><ol><li>Step 1: Onboarding</li><li>Step 2: Go-Live</li></ol><p>Visit our portal: <a href="https://tecmotiv.com/portal?ref=outreach&amp;client=Acme%20Corp">Partner Portal</a></p><p>Special Symbols: © 2026 TecMotiv™ | All Rights Reserved | Currency: €100 / ¥10,000 / £50 | Emoji: 🚀🌟🔥</p><p>Multi-lingual: Bonjour, مرحبا, こんにちは, Привет</p>`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Phase3 Test 2 HTML Preservation",
        emails: [
          {
            to: "html.lead@enterprise.com",
            from: validSender,
            subject: "Rich HTML & Unicode Test",
            body: richHtml,
          },
        ],
      }),
    });

    const data = await res.json();
    let passed = false;
    let actualMsg = "";

    if (res.status === 201 && data.campaignId) {
      const { data: recs } = await supabase.from("recipients").select("*").eq("campaign_id", data.campaignId);
      const storedBody = recs?.[0]?.data?.body || "";

      const containsParagraphs = storedBody.includes("<p>") && storedBody.includes("</p>");
      const containsBold = storedBody.includes("<strong>Valued Partner</strong>");
      const containsLink = storedBody.includes('<a href="https://tecmotiv.com/portal?ref=outreach&amp;client=Acme%20Corp">');
      const containsUl = storedBody.includes("<ul>") && storedBody.includes("<li>Feature A");
      const containsOl = storedBody.includes("<ol>") && storedBody.includes("<li>Step 1");
      const containsSpecialChars = storedBody.includes("&quot;Project Horizon&quot;") && storedBody.includes("5 &lt; 10 &gt; 2");
      const containsAmpersands = storedBody.includes("&amp;");
      const containsUnicode = storedBody.includes("🚀🌟🔥") && storedBody.includes("© 2026 TecMotiv™") && storedBody.includes("こんにちは");
      const noEscapedP = !storedBody.includes("&lt;p&gt;");

      passed = containsParagraphs && containsBold && containsLink && containsUl && containsOl &&
               containsSpecialChars && containsAmpersands && containsUnicode && noEscapedP;

      actualMsg = `HTTP 201, HTML stored verbatim. paragraphs=${containsParagraphs}, bold=${containsBold}, links=${containsLink}, lists=${containsUl && containsOl}, specialChars=${containsSpecialChars}, ampersands=${containsAmpersands}, unicode=${containsUnicode}, noEscapedP=${noEscapedP}`;
    } else {
      actualMsg = `HTTP ${res.status}: ${JSON.stringify(data)}`;
    }

    recordResult(
      testName,
      "HTTP 201 Created, rich HTML preserved without tag stripping, entity re-escaping, or &lt;p&gt; artifacts",
      actualMsg,
      passed
    );
  }

  // =========================================================================
  // TEST 3 — Invalid API Key
  // =========================================================================
  {
    const testName = "TEST 3 — Invalid API key";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer completely_bogus_api_key_xyz",
      },
      body: JSON.stringify({
        campaignName: "Test 3",
        emails: [{ to: "a@b.com", from: validSender, subject: "S", body: "<p>B</p>" }],
      }),
    });
    const data = await res.json();
    const passed = res.status === 401 && data.error === "UNAUTHORIZED";
    recordResult(
      testName,
      "HTTP 401 Unauthorized, error code UNAUTHORIZED",
      `HTTP ${res.status}, error: ${data.error}`,
      passed
    );
  }

  // =========================================================================
  // TEST 4 — Missing API Key
  // =========================================================================
  {
    const testName = "TEST 4 — Missing API key";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignName: "Test 4",
        emails: [{ to: "a@b.com", from: validSender, subject: "S", body: "<p>B</p>" }],
      }),
    });
    const data = await res.json();
    const passed = res.status === 401 && data.error === "UNAUTHORIZED";
    recordResult(
      testName,
      "HTTP 401 Unauthorized, error code UNAUTHORIZED",
      `HTTP ${res.status}, error: ${data.error}`,
      passed
    );
  }

  // =========================================================================
  // TEST 5 — Empty Email Array
  // =========================================================================
  {
    const testName = "TEST 5 — Empty email array";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Test 5",
        emails: [],
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === "EMPTY_EMAIL_ARRAY";
    recordResult(
      testName,
      "HTTP 400 Bad Request, error code EMPTY_EMAIL_ARRAY",
      `HTTP ${res.status}, error: ${data.error}`,
      passed
    );
  }

  // =========================================================================
  // TEST 6 — Missing Recipient ('to' omitted or empty)
  // =========================================================================
  {
    const testName = "TEST 6 — Missing recipient ('to' field empty)";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Test 6",
        emails: [
          { to: "", from: validSender, subject: "S", body: "<p>B</p>" },
        ],
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === "INVALID_EMAIL";
    recordResult(
      testName,
      "HTTP 400 Bad Request, error code INVALID_EMAIL",
      `HTTP ${res.status}, error: ${data.error}, details: ${JSON.stringify(data.details)}`,
      passed
    );
  }

  // =========================================================================
  // TEST 7 — Invalid Email Syntax
  // =========================================================================
  {
    const testName = "TEST 7 — Invalid email syntax ('to' format malformed)";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Test 7",
        emails: [
          { to: "alex.prospect@notadomain", from: validSender, subject: "S", body: "<p>B</p>" },
        ],
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === "INVALID_EMAIL";
    recordResult(
      testName,
      "HTTP 400 Bad Request, error code INVALID_EMAIL",
      `HTTP ${res.status}, error: ${data.error}, details: ${JSON.stringify(data.details)}`,
      passed
    );
  }

  // =========================================================================
  // TEST 8 — Missing Subject
  // =========================================================================
  {
    const testName = "TEST 8 — Missing subject";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Test 8",
        emails: [
          { to: "valid.lead@example.com", from: validSender, subject: "   ", body: "<p>B</p>" },
        ],
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === "INVALID_REQUEST";
    recordResult(
      testName,
      "HTTP 400 Bad Request, error code INVALID_REQUEST",
      `HTTP ${res.status}, error: ${data.error}, message: ${data.message}`,
      passed
    );
  }

  // =========================================================================
  // TEST 9 — Missing Body
  // =========================================================================
  {
    const testName = "TEST 9 — Missing body";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Test 9",
        emails: [
          { to: "valid.lead@example.com", from: validSender, subject: "Valid Subject", body: "" },
        ],
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === "INVALID_REQUEST";
    recordResult(
      testName,
      "HTTP 400 Bad Request, error code INVALID_REQUEST",
      `HTTP ${res.status}, error: ${data.error}, message: ${data.message}`,
      passed
    );
  }

  // =========================================================================
  // TEST 10 — Invalid Sender (Unauthorized From address)
  // =========================================================================
  {
    const testName = "TEST 10 — Invalid sender (unauthorized / unconnected From address)";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Test 10 Spoofed Sender",
        emails: [
          {
            to: "client@example.com",
            from: "ceo@unauthorized-spoofed-domain.com",
            subject: "Important update",
            body: "<p>Content</p>",
          },
        ],
      }),
    });
    const data = await res.json();
    const passed = res.status === 422 && data.error === "SENDER_NOT_CONNECTED";
    recordResult(
      testName,
      "HTTP 422 Unprocessable Entity, error code SENDER_NOT_CONNECTED",
      `HTTP ${res.status}, error: ${data.error}, message: ${data.message}`,
      passed
    );
  }

  // =========================================================================
  // TEST 11 — Duplicate Request (Idempotency Protection)
  // =========================================================================
  {
    const testName = "TEST 11 — Duplicate request idempotency protection";
    const uniqueIdempKey = `phase3-idemp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const payload = {
      campaignName: "Phase3 Idempotency Test Campaign",
      emails: [
        { to: "dup1@client.com", from: validSender, subject: "Sub 1", body: "<p>Body 1</p>" },
        { to: "dup2@client.com", from: validSender, subject: "Sub 2", body: "<p>Body 2</p>" },
      ],
    };

    // First request
    const res1 = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "Idempotency-Key": uniqueIdempKey,
      },
      body: JSON.stringify(payload),
    });
    const data1 = await res1.json();
    const campaignId1 = data1.campaignId;

    // Second request (identical)
    const res2 = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "Idempotency-Key": uniqueIdempKey,
      },
      body: JSON.stringify(payload),
    });
    const data2 = await res2.json();

    // Verify database count for this idempotency key
    const { count: dbCount } = await supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .ilike("name", `%[idempotency:${uniqueIdempKey}]%`);

    const passed = res1.status === 201 &&
                   res2.status === 200 &&
                   data2.duplicate === true &&
                   data2.campaignId === campaignId1 &&
                   dbCount === 1;

    recordResult(
      testName,
      "First call returns 201 Created; second call returns 200 OK with duplicate: true and same campaignId; exactly 1 campaign created in DB",
      `Call 1 HTTP ${res1.status} (ID: ${campaignId1}), Call 2 HTTP ${res2.status} (duplicate: ${data2.duplicate}, ID: ${data2.campaignId}), DB Campaign Count: ${dbCount}`,
      passed
    );
  }

  // =========================================================================
  // TEST 12 — Larger Campaign (15 emails safe dataset)
  // =========================================================================
  {
    const testName = "TEST 12 — Larger campaign (15 emails batch)";
    const emailCount = 15;
    const largeBatchEmails = Array.from({ length: emailCount }, (_, i) => ({
      to: `batch.lead.${i + 1}@acme-testing.com`,
      from: validSender,
      subject: `Batch Outreach Notice #${i + 1}`,
      body: `<p>Hello Partner ${i + 1},</p><p>This is a batch delivery test email.</p>`,
    }));

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        campaignName: "Phase3 Test 12 Larger Batch Campaign",
        emails: largeBatchEmails,
      }),
    });

    const data = await res.json();
    let passed = false;
    let actualMsg = "";

    if (res.status === 201 && data.campaignId) {
      const { data: camp } = await supabase.from("campaigns").select("*").eq("id", data.campaignId).single();
      const { count: recCount } = await supabase
        .from("recipients")
        .select("*", { count: "exact" })
        .eq("campaign_id", data.campaignId);

      const dbInserted = recCount === emailCount;
      const initialStatus = camp?.status === "sending";
      const processorStarted = typeof data.processor === "string" && data.processor.includes("started");

      passed = dbInserted && initialStatus && processorStarted;
      actualMsg = `HTTP 201, campaignId: ${data.campaignId}, totalEmails: ${data.totalEmails}, DB Recipients Count: ${recCount}/${emailCount}, Campaign Status: ${camp?.status}, Processor: ${data.processor}`;
    } else {
      actualMsg = `HTTP ${res.status}: ${JSON.stringify(data)}`;
    }

    recordResult(
      testName,
      `HTTP 201 Created, all ${emailCount} recipients inserted cleanly into DB, campaign status 'sending', processor started without crashes`,
      actualMsg,
      passed
    );
  }

  console.log("=================================================================");
  const allPassed = testResults.every((r) => r.result === "PASSED");
  console.log(`SUMMARY: ${testResults.filter((r) => r.result === "PASSED").length} / ${testResults.length} TESTS PASSED`);
  console.log("=================================================================");

  return { testResults, allPassed };
}

runPhase3().catch((err) => {
  console.error("Fatal error during Phase 3 test execution:", err);
  process.exit(1);
});
