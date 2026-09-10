import { Client } from "@microsoft/microsoft-graph-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Proactively refresh the access token if it expires within 5 minutes.
// This prevents tokens from running out mid-batch while multiple emails are being sent.
const TOKEN_REFRESH_BUFFER_SECONDS = 300;

// Mutex map for concurrent token refreshes: ensures that if multiple concurrent campaigns
// or requests for the same user need a token refresh, only ONE refresh request is sent
// to Microsoft, preventing token rotation collisions and invalid_grant errors.
const activeRefreshes = new Map<string, Promise<string>>();

export {
  isGraph401,
  isGraphThrottled,
  extractRetryAfterSeconds,
  setMailboxThrottledUntil,
  getMailboxThrottledUntil,
} from "./throttling";

/**
 * Obtains a valid, unexpired Microsoft Graph access token for the given user.
 * - Reuses valid tokens if current token has more than 5 minutes remaining.
 * - Single-flight refresh prevents concurrent workers from clobbering rotated refresh tokens.
 * - Automatically falls back to admin client if user client has no active session in background workers.
 * - If forceRefresh is true (e.g. on 401), bypasses the expiration check and immediately refreshes.
 */
export async function getValidAccessToken(
  userId: string,
  supabase?: SupabaseClient,
  forceRefresh = false
): Promise<string> {
  // If a refresh for this user is already in-flight, await and share the result
  if (activeRefreshes.has(userId)) {
    return await activeRefreshes.get(userId)!;
  }

  // Resolve database client: prefer provided client, then SSR client, fall back to admin client
  let db: SupabaseClient;
  if (supabase) {
    db = supabase;
  } else {
    try {
      db = await createClient();
    } catch {
      db = createAdminClient();
    }
  }

  // Fetch token from DB
  let { data: token } = await db
    .from("microsoft_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  // If token not found with current client, try independent admin client
  if (!token) {
    try {
      const adminDb = createAdminClient();
      const adminRes = await adminDb
        .from("microsoft_tokens")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (adminRes.data) {
        token = adminRes.data;
        db = adminDb;
      }
    } catch {}
  }

  if (!token) {
    throw new Error("No Microsoft token found. Please connect Outlook in Settings.");
  }

  const expiresAt = new Date(token.expires_at).getTime();
  const needsRefresh = forceRefresh || expiresAt < Date.now() + TOKEN_REFRESH_BUFFER_SECONDS * 1000;

  if (!needsRefresh) {
    return token.access_token;
  }

  // Execute single-flight refresh under mutex
  const refreshPromise = (async () => {
    try {
      const refreshUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
      const body = new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: token.refresh_token,
        grant_type: "refresh_token",
      });

      const res = await fetch(refreshUrl, { method: "POST", body });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(
          `Microsoft token refresh failed: ${data.error_description || data.error || `HTTP ${res.status}`}. Please reconnect Outlook in Settings.`
        );
      }

      if (!data.access_token) {
        throw new Error("Microsoft token refresh returned no access token. Please reconnect Outlook in Settings.");
      }

      const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
      const newRefreshToken = data.refresh_token || token.refresh_token;

      // Persist refreshed token to database using the authenticated client
      const { error: updateError } = await db.from("microsoft_tokens").update({
        access_token: data.access_token,
        refresh_token: newRefreshToken,
        expires_at: newExpiresAt,
      }).eq("user_id", userId);

      if (updateError) {
        console.error("[getValidAccessToken] Warning: failed to persist token:", updateError.message);
      }

      return data.access_token;
    } finally {
      activeRefreshes.delete(userId);
    }
  })();

  activeRefreshes.set(userId, refreshPromise);
  return await refreshPromise;
}

/**
 * Creates a Microsoft Graph client with dynamic authentication middleware.
 * Fetches an unexpired token on demand for each request.
 */
export function createGraphClient(userId: string, supabase?: SupabaseClient) {
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        return await getValidAccessToken(userId, supabase);
      },
    },
  });
}
