import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (!campaign || campaign.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status === "done") return NextResponse.json({ done: true });

  const { data: globalAttachments } = await supabase
    .from("attachments")
    .select("*")
    .eq("campaign_id", id)
    .eq("type", "global");

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
    return NextResponse.json({ done: true, status: newStatus });
  }

  const delayMs = Math.max(500, Math.floor(60000 / pending.length));
  let sent = 0;

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
      await sendEmail({ campaign, recipient, globalAttachments: globalAttachments || [] });
      await supabase.from("recipients").update({
        status: "sent",
        sent_at: new Date().toISOString(),
      }).eq("id", recipient.id);
      sent++;
    } catch (err: any) {
      const retryCount = (recipient.retry_count || 0) + 1;
      const newStatus = retryCount >= 3 ? "failed" : "pending";
      await supabase.from("recipients").update({
        status: newStatus,
        error_message: err.message,
        retry_count: retryCount,
      }).eq("id", recipient.id);
    }
    await delay(delayMs);
  }

  return NextResponse.json({ processed: pending.length, sent });
}
