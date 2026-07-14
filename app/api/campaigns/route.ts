import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.subject_template || typeof body.subject_template !== "string") {
    return NextResponse.json({ error: "subject_template is required" }, { status: 400 });
  }

  const rateLimit = body.rate_limit ? Number(body.rate_limit) : 10;
  if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 100) {
    return NextResponse.json({ error: "rate_limit must be an integer between 1 and 100" }, { status: 400 });
  }

  const { data, error } = await supabase.from("campaigns").insert({
    user_id: user.id,
    name: body.name.trim(),
    subject_template: body.subject_template,
    body_template: body.body_template || "",
    global_bcc: body.global_bcc || "",
    global_cc: body.global_cc || "",
    rate_limit: rateLimit,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
