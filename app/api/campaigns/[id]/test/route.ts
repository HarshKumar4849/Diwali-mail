import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { sendEmail } from "@/lib/email/send";
import type { Campaign, Recipient } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Sends a pre-send test email to a specified address using the campaign's actual
 * content. Does NOT touch the recipients/campaign sending state.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (campErr || !campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const testEmail = typeof body?.email === "string" ? body.email.trim() : "";
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(testEmail)) return NextResponse.json({ error: "Invalid test email address" }, { status: 400 });

  try {
    await sendEmail({
      campaign: campaign as Campaign,
      recipient: {
        id: "test",
        campaign_id: campaign.id,
        email: testEmail,
        data: {},
        attachment_path: "",
        status: "pending",
        error_message: "",
        retry_count: 0,
        sent_at: null,
        created_at: new Date().toISOString(),
      } as Recipient,
      globalAttachments: [],
      supabase,
    });

    return NextResponse.json({ success: true, sentTo: testEmail });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send test email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
