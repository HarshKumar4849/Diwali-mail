import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("recipients")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (!Array.isArray(body.recipients)) {
    return NextResponse.json({ error: "recipients must be an array" }, { status: 400 });
  }

  for (const r of body.recipients) {
    if (!r.email || !EMAIL_RE.test(r.email)) {
      return NextResponse.json({ error: `Invalid email: ${r.email}` }, { status: 400 });
    }
  }

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
