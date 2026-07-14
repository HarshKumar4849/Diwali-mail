import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: campaign } = await supabase.from("campaigns").select("user_id").eq("id", id).single();
  if (!campaign || campaign.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.from("recipients").update({
    status: "pending",
    error_message: "",
    retry_count: 0,
  }).eq("campaign_id", id).eq("status", "failed");

  await supabase.from("campaigns").update({ status: "sending" }).eq("id", id);

  return NextResponse.json({ status: "sending" });
}
