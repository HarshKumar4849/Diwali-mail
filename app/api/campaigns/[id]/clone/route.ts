import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: original, error: fetchError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (fetchError || !original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: clone, error: insertError } = await supabase
    .from("campaigns")
    .insert({
      user_id: user.id,
      name: `${original.name} (copy)`,
      subject_template: original.subject_template,
      body_template: original.body_template,
      global_bcc: original.global_bcc,
      global_cc: original.global_cc,
      rate_limit: original.rate_limit,
      status: "draft",
    })
    .select()
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json(clone);
}
