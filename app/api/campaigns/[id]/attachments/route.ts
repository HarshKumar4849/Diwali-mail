import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
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
