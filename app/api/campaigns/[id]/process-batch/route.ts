import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startCampaignProcessor, isCampaignRunning } from "@/lib/campaign/processor";
import { getValidAccessToken } from "@/lib/graph/client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const internalToken = req.headers.get("x-internal-token");
  const isInternal = Boolean(process.env.SUPABASE_SECRET_KEY) && internalToken === process.env.SUPABASE_SECRET_KEY;
  const { id } = await params;

  let ownerUserId: string;

  if (!isInternal) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: campaign } = await supabase.from("campaigns").select("user_id").eq("id", id).single();
    if (!campaign || campaign.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    ownerUserId = user.id;
  } else {
    const adminDb = createAdminClient();
    const { data: campaign } = await adminDb.from("campaigns").select("user_id").eq("id", id).single();
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
    ownerUserId = campaign.user_id;
  }

  const supabase = isInternal ? createAdminClient() : await createClient();

  // Verify server-side Microsoft authorization before processing
  try {
    await getValidAccessToken(ownerUserId, supabase);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Microsoft account connection required before sending email.";
    return NextResponse.json(
      { error: "Microsoft account connection required before sending email.", details: message },
      { status: 403 }
    );
  }

  // Start or continue the independent campaign processor
  const result = await startCampaignProcessor(id, supabase);

  return NextResponse.json({
    ...result,
    running: isCampaignRunning(id),
  });
}

