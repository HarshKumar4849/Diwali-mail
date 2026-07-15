import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("microsoft_tokens")
    .select("expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const connected = !!data && new Date(data.expires_at) > new Date();

  return NextResponse.json({
    connected,
    email: user.email || "",
  });
}
