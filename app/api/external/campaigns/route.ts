import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminClient } from "@/lib/supabase/admin";
import { startCampaignProcessor } from "@/lib/campaign/processor";
import { getValidAccessToken } from "@/lib/graph/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS_PER_REQUEST = 250;
const MAX_BODY_BYTES = 500 * 1024; // 500 KB per email body
const IDEMPOTENCY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface IncomingEmailItem {
  to?: unknown;
  from?: unknown;
  subject?: unknown;
  body?: unknown;
}

interface IncomingPayload {
  campaignName?: unknown;
  emails?: unknown;
}

/**
 * Validates Bearer API token using timing-safe comparison.
 */
function isAuthorized(req: NextRequest): boolean {
  const expectedKey = process.env.LEADFORGE_API_KEY;
  if (!expectedKey) return false;

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const providedKey = match[1].trim();
  const expectedBuffer = Buffer.from(expectedKey, "utf-8");
  const providedBuffer = Buffer.from(providedKey, "utf-8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Extracts clean campaign name and idempotency tag.
 */
function cleanName(rawName: string): string {
  return rawName.replace(/\s*\[idempotency:[^\]]+\]\s*/g, "").trim();
}

export async function POST(req: NextRequest) {
  // 1. Authenticate the external caller
  if (!isAuthorized(req)) {
    return NextResponse.json(
      {
        success: false,
        error: "UNAUTHORIZED",
        message: "Missing or invalid API key.",
      },
      { status: 401 }
    );
  }

  // 2. Parse request JSON body safely
  let payload: IncomingPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_JSON",
        message: "Request body must be a valid JSON object.",
      },
      { status: 400 }
    );
  }

  const { campaignName, emails } = payload;

  // 3. Validate campaignName
  if (!campaignName || typeof campaignName !== "string" || campaignName.trim().length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_REQUEST",
        message: "'campaignName' is required and must be a non-empty string.",
      },
      { status: 400 }
    );
  }

  const trimmedCampaignName = campaignName.trim();
  if (trimmedCampaignName.length > 255) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_REQUEST",
        message: "'campaignName' exceeds maximum length of 255 characters.",
      },
      { status: 400 }
    );
  }

  // 4. Validate emails array
  if (!Array.isArray(emails)) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_REQUEST",
        message: "'emails' must be an array of email objects.",
      },
      { status: 400 }
    );
  }

  if (emails.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "EMPTY_EMAIL_ARRAY",
        message: "'emails' array must contain at least 1 email.",
      },
      { status: 400 }
    );
  }

  if (emails.length > MAX_EMAILS_PER_REQUEST) {
    return NextResponse.json(
      {
        success: false,
        error: "PAYLOAD_TOO_LARGE",
        message: `'emails' array exceeds maximum batch limit of ${MAX_EMAILS_PER_REQUEST} emails.`,
      },
      { status: 400 }
    );
  }

  // 5. Validate individual email objects (All-or-Nothing policy)
  let commonFrom = "";

  for (let i = 0; i < emails.length; i++) {
    const item = emails[i] as IncomingEmailItem;

    if (!item || typeof item !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_REQUEST",
          message: `Email item at index ${i} must be an object.`,
          details: { index: i },
        },
        { status: 400 }
      );
    }

    // Validate 'to'
    if (!item.to || typeof item.to !== "string" || !EMAIL_RE.test(item.to.trim())) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_EMAIL",
          message: `Invalid recipient 'to' email address at index ${i}: '${item.to}'.`,
          details: { index: i, field: "to", value: item.to },
        },
        { status: 400 }
      );
    }

    // Validate 'from'
    if (!item.from || typeof item.from !== "string" || !EMAIL_RE.test(item.from.trim())) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_EMAIL",
          message: `Invalid sender 'from' email address at index ${i}: '${item.from}'.`,
          details: { index: i, field: "from", value: item.from },
        },
        { status: 400 }
      );
    }

    const currentFrom = item.from.trim().toLowerCase();
    if (i === 0) {
      commonFrom = currentFrom;
    } else if (currentFrom !== commonFrom) {
      return NextResponse.json(
        {
          success: false,
          error: "HETEROGENEOUS_SENDERS",
          message: `All emails in a single campaign must share the same 'from' address. Found '${currentFrom}' at index ${i}, expected '${commonFrom}'.`,
          details: { index: i, field: "from", expected: commonFrom, found: currentFrom },
        },
        { status: 400 }
      );
    }

    // Validate 'subject'
    if (!item.subject || typeof item.subject !== "string" || item.subject.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_REQUEST",
          message: `Subject is required and cannot be empty at index ${i}.`,
          details: { index: i, field: "subject" },
        },
        { status: 400 }
      );
    }

    if (item.subject.trim().length > 500) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_REQUEST",
          message: `Subject exceeds maximum length of 500 characters at index ${i}.`,
          details: { index: i, field: "subject" },
        },
        { status: 400 }
      );
    }

    // Validate 'body' (HTML string)
    if (!item.body || typeof item.body !== "string" || item.body.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_REQUEST",
          message: `HTML body is required and cannot be empty at index ${i}.`,
          details: { index: i, field: "body" },
        },
        { status: 400 }
      );
    }

    if (Buffer.byteLength(item.body, "utf-8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: "PAYLOAD_TOO_LARGE",
          message: `HTML body at index ${i} exceeds maximum limit of 500 KB.`,
          details: { index: i, field: "body" },
        },
        { status: 400 }
      );
    }
  }

  const adminDb = await getAdminClient();

  // 6. Sender Handling: Validate sender against connected Microsoft 365 tokens
  const { data: tokenRow, error: tokenErr } = await adminDb
    .from("microsoft_tokens")
    .select("user_id, microsoft_email")
    .ilike("microsoft_email", commonFrom)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return NextResponse.json(
      {
        success: false,
        error: "SENDER_NOT_CONNECTED",
        message: `The sender '${commonFrom}' has not connected their Microsoft 365 Outlook account in Mailcraft Settings.`,
      },
      { status: 422 }
    );
  }

  // Pre-flight check: verify Microsoft token is valid / refreshable
  try {
    await getValidAccessToken(tokenRow.user_id, adminDb);
  } catch (authErr: unknown) {
    const errorDetails = authErr instanceof Error ? authErr.message : "Unknown token error";
    return NextResponse.json(
      {
        success: false,
        error: "PROVIDER_AUTH_FAILED",
        message: "Microsoft account connection required before sending email.",
        details: errorDetails,
      },
      { status: 403 }
    );
  }

  // 7. Idempotency Check
  const rawIdempotencyKey = req.headers.get("idempotency-key");
  const idempotencyKey = rawIdempotencyKey ? rawIdempotencyKey.trim().slice(0, 128) : null;

  if (idempotencyKey) {
    const idempotencyTag = `[idempotency:${idempotencyKey}]`;
    const cutoffTime = new Date(Date.now() - IDEMPOTENCY_EXPIRY_MS).toISOString();

    const { data: existingCampaign } = await adminDb
      .from("campaigns")
      .select("id, name, status, created_at, user_id")
      .eq("user_id", tokenRow.user_id)
      .ilike("name", `%${idempotencyTag}%`)
      .gte("created_at", cutoffTime)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingCampaign) {
      const { count: existingRecCount } = await adminDb
        .from("recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", existingCampaign.id);

      return NextResponse.json(
        {
          success: true,
          duplicate: true,
          campaignId: existingCampaign.id,
          campaignName: cleanName(existingCampaign.name),
          status: existingCampaign.status,
          totalEmails: existingRecCount || emails.length,
          sender: commonFrom,
          createdAt: existingCampaign.created_at,
          message: "Campaign with this Idempotency-Key already exists and is currently processing.",
        },
        { status: 200 }
      );
    }
  }

  // 8. Create Mailcraft campaign using existing schema
  const storedCampaignName = idempotencyKey
    ? `${trimmedCampaignName} [idempotency:${idempotencyKey}]`
    : trimmedCampaignName;

  const { data: campaign, error: campErr } = await adminDb
    .from("campaigns")
    .insert({
      user_id: tokenRow.user_id,
      name: storedCampaignName,
      subject_template: "{{subject}}",
      body_template: "{{body}}",
      rate_limit: 20,
      status: "sending",
    })
    .select()
    .single();

  if (campErr || !campaign) {
    return NextResponse.json(
      {
        success: false,
        error: "CAMPAIGN_CREATION_FAILED",
        message: campErr?.message || "Failed to create campaign record in database.",
      },
      { status: 500 }
    );
  }

  // 9. Store recipient data using existing schema
  const recipientRecords = emails.map((item) => {
    const e = item as { to: string; from: string; subject: string; body: string };
    return {
      campaign_id: campaign.id,
      email: e.to.trim().toLowerCase(),
      data: {
        subject: e.subject.trim(),
        body: e.body,
        from: e.from.trim().toLowerCase(),
        __is_html_body: "true",
      },
      attachment_path: "",
      status: "pending",
      retry_count: 0,
    };
  });

  const { error: recErr } = await adminDb.from("recipients").insert(recipientRecords);

  if (recErr) {
    // Rollback campaign record if recipient insert fails
    await adminDb.from("campaigns").delete().eq("id", campaign.id);
    return NextResponse.json(
      {
        success: false,
        error: "DATABASE_ERROR",
        message: `Failed to enqueue recipients: ${recErr.message}`,
      },
      { status: 500 }
    );
  }

  // 10. Start the EXISTING Mailcraft campaign processor
  const processorResult = await startCampaignProcessor(campaign.id, adminDb);

  // 11. Return created campaign ID and initial campaign status immediately
  return NextResponse.json(
    {
      success: true,
      campaignId: campaign.id,
      campaignName: trimmedCampaignName,
      status: "sending",
      totalEmails: emails.length,
      sender: commonFrom,
      createdAt: campaign.created_at,
      processor: processorResult.message,
    },
    { status: 201 }
  );
}
