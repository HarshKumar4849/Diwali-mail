import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/graph/client";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("microsoft_tokens")
    .select("expires_at, refresh_token, microsoft_email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data || !data.refresh_token) {
    return NextResponse.json({
      connected: false,
      email: "",
    });
  }

  // If access token is expired or close to expiry, proactively refresh it
  let connected = true;
  const isExpired = new Date(data.expires_at) <= new Date();
  if (isExpired) {
    try {
      await getValidAccessToken(user.id, supabase);
      connected = true;
    } catch {
      // Refresh token was revoked or invalid
      connected = false;
    }
  }

  return NextResponse.json({
    connected,
    email: data.microsoft_email || user.email || "",
  });
}
