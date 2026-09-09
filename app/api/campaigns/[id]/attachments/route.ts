import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (campErr || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.attachments)) {
    return NextResponse.json({ error: "attachments array is required" }, { status: 400 });
  }

  if (body.attachments.length === 0) {
    return NextResponse.json([], { status: 201 });
  }

  const attachments = body.attachments.map((a: { file_path: string; original_name: string; type: string }) => ({
    campaign_id: id,
    file_path: a.file_path,
    original_name: a.original_name,
    type: a.type || "global",
  }));

  const { data, error } = await supabase.from("attachments").insert(attachments).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
