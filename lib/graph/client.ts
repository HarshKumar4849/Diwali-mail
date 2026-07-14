import { Client } from "@microsoft/microsoft-graph-client";
import { createClient } from "@/lib/supabase/server";

async function getAccessToken(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data: token } = await supabase
    .from("microsoft_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!token) throw new Error("No Microsoft token found");

  if (new Date(token.expires_at) < new Date()) {
    const refreshUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const body = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    });
    const res = await fetch(refreshUrl, { method: "POST", body });
    const data = await res.json();
    await supabase.from("microsoft_tokens").update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || token.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    }).eq("user_id", userId);
    return data.access_token;
  }

  return token.access_token;
}

export async function createGraphClient(userId: string) {
  const accessToken = await getAccessToken(userId);
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken,
    },
  });
}
