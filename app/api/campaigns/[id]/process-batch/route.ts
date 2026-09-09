import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startCampaignProcessor, isCampaignRunning } from "@/lib/campaign/processor";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const internalToken = req.headers.get("x-internal-token");
  const isInternal = Boolean(process.env.SUPABASE_SECRET_KEY) && internalToken === process.env.SUPABASE_SECRET_KEY;

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

  // Start or continue the independent campaign processor
  const result = await startCampaignProcessor(id, supabase);

  return NextResponse.json({
    ...result,
    running: isCampaignRunning(id),
  });
}
