import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const internalToken = req.headers.get("x-internal-token");
  const isInternal = internalToken === process.env.SUPABASE_SECRET_KEY;

  if (!isInternal) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { data: campaign } = await supabase.from("campaigns").select("user_id").eq("id", id).single();
    if (!campaign || campaign.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = isInternal ? createAdminClient() : await createClient();

  const { id } = await params;
  const { data: campaign, error: campaignError } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (campaignError || !campaign) {
    console.error(`[process-batch] Campaign ${id}: not found`, campaignError);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (campaign.status === "done") return NextResponse.json({ done: true });

  console.log(`[process-batch] Campaign ${id}: batch processing (status=${campaign.status})`);

  const { data: globalAttachments, error: attError } = await supabase
    .from("attachments")
    .select("*")
    .eq("campaign_id", id)
    .eq("type", "global");

  console.log(`[process-batch] Campaign ${id}: found ${globalAttachments?.length || 0} global attachments` + (attError ? ` (error: ${attError.message})` : ""));

  const { data: pending } = await supabase
    .from("recipients")
    .select("*")
    .eq("campaign_id", id)
    .eq("status", "pending")
    .limit(campaign.rate_limit);

  if (!pending || pending.length === 0) {
    const { count } = await supabase
      .from("recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "failed");

    const newStatus = count && count > 0 ? "partial" : "done";
    await supabase.from("campaigns").update({ status: newStatus }).eq("id", id);
    console.log(`[process-batch] Campaign ${id}: no pending recipients, status → ${newStatus}`);
    return NextResponse.json({ done: true, status: newStatus });
  }

  console.log(`[process-batch] Campaign ${id}: processing ${pending.length} recipients (rate_limit=${campaign.rate_limit})`);

  const delayMs = Math.max(500, Math.floor(60000 / pending.length));
  let sent = 0;
  let failed = 0;

  for (const recipient of pending) {
    const { data: claimed } = await supabase
      .from("recipients")
      .update({ status: "sending" })
      .eq("id", recipient.id)
      .eq("status", "pending")
      .select()
      .single();

    if (!claimed) continue;

    try {
      await sendEmail({ campaign, recipient, globalAttachments: globalAttachments || [], supabase });
      await supabase.from("recipients").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: "",
      }).eq("id", recipient.id);
      sent++;
      console.log(`[process-batch] Campaign ${id}: sent to ${recipient.email}`);
    } catch (err: unknown) {
      const retryCount = (recipient.retry_count || 0) + 1;
      const newStatus = retryCount >= 3 ? "failed" : "pending";
      await supabase.from("recipients").update({
        status: newStatus,
        error_message: err instanceof Error ? err.message : "Unknown error",
        retry_count: retryCount,
      }).eq("id", recipient.id);
      if (newStatus === "failed") {
        failed++;
        console.error(`[process-batch] Campaign ${id}: failed for ${recipient.email}: ${err instanceof Error ? err.message : "Unknown error"}`);
      } else {
        console.log(`[process-batch] Campaign ${id}: retry ${retryCount} for ${recipient.email}`);
      }
    }
    await delay(delayMs);
  }

  console.log(`[process-batch] Campaign ${id}: batch complete — sent=${sent}, failed=${failed}`);

  const { count: remainingCount } = await supabase
    .from("recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("status", "pending");

  const remaining = remainingCount ?? 0;

  if (remaining > 0) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `http://${req.headers.get("host") || "localhost:3000"}`;
    fetch(`${appUrl}/api/campaigns/${id}/process-batch`, {
      method: "POST",
      headers: { "x-internal-token": process.env.SUPABASE_SECRET_KEY || "" },
    }).catch(err => console.error(`[process-batch] Campaign ${id}: next-batch trigger failed:`, err));
    console.log(`[process-batch] Campaign ${id}: scheduled next batch (${remaining} pending remaining)`);
  } else {
    const { count } = await supabase
      .from("recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("status", "failed");
    const newStatus = count && count > 0 ? "partial" : "done";
    await supabase.from("campaigns").update({ status: newStatus }).eq("id", id);
    console.log(`[process-batch] Campaign ${id}: all done, status → ${newStatus}`);
  }

  return NextResponse.json({ processed: pending.length, sent, failed });
}
