import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const returnedState = req.nextUrl.searchParams.get("state");
  const settingsUrl = new URL("/settings", process.env.NEXT_PUBLIC_APP_URL);
  if (!code) {
    settingsUrl.searchParams.set("error", "No authorization code from Microsoft");
    return NextResponse.redirect(settingsUrl);
  }

  const storedState = req.cookies.get("microsoft_oauth_state")?.value;
  if (!returnedState || !storedState || returnedState !== storedState) {
    settingsUrl.searchParams.set("error", "OAuth state mismatch — try again");
    return NextResponse.redirect(settingsUrl);
  }

  const tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    code,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(tokenUrl, { method: "POST", body });
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok) {
    settingsUrl.searchParams.set("error", tokenData.error_description || "Microsoft token exchange failed");
    return NextResponse.redirect(settingsUrl);
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    settingsUrl.searchParams.set("error", "Not signed in — please log in and try again");
    return NextResponse.redirect(settingsUrl);
  }

  let microsoftEmail = "";
  try {
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (meRes.ok) {
      const meData = await meRes.json();
      microsoftEmail = meData.mail || meData.userPrincipalName || "";
    }
  } catch {}

  const { error: upsertError } = await supabase.from("microsoft_tokens").upsert({
    user_id: user.id,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
    microsoft_email: microsoftEmail,
  }, { onConflict: "user_id" });

  if (upsertError) {
    settingsUrl.searchParams.set("error", `Failed to save token: ${upsertError.message}`);
    return NextResponse.redirect(settingsUrl);
  }

  const response = NextResponse.redirect(settingsUrl);
  response.cookies.set("microsoft_oauth_state", "", { maxAge: 0, path: "/api/auth/callback" });
  return response;
}
