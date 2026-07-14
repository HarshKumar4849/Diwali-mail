import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipients").select("*").eq("campaign_id", id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await req.json();
  const recipients = body.recipients.map((r: { email: string; data: Record<string, string>; attachment_path?: string }) => ({
    campaign_id: id,
    email: r.email,
    data: r.data,
    attachment_path: r.attachment_path || "",
  }));
  const { data, error } = await supabase.from("recipients").insert(recipients).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
