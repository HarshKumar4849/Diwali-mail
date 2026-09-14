import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startCampaignProcessor } from "@/lib/campaign/processor";
import { getValidAccessToken } from "@/lib/graph/client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: campaign } = await supabase.from("campaigns").select("user_id").eq("id", id).single();
  if (!campaign || campaign.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify server-side Microsoft authorization before initiating send
  try {
    await getValidAccessToken(user.id, supabase);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Microsoft account connection required before sending email.";
    return NextResponse.json(
      { error: "Microsoft account connection required before sending email.", details: message },
      { status: 403 }
    );
  }

  await supabase.from("campaigns").update({ status: "sending" }).eq("id", id);

  // Start independent background processor for this campaign
  await startCampaignProcessor(id, supabase);

  return NextResponse.json({ status: "sending" });
}

