import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

/**
 * Phase 3: Campaign History — list of campaigns with owner, sender, audience, status.
 */
export async function GET() {
  const supabase = await createClient();
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("id, name, status, created_at, updated_at, subject_template, rate_limit, global_cc, global_bcc, user_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tokenRes = await supabase
    .from("microsoft_tokens")
    .select("microsoft_email")
    .eq("user_id", user.id)
    .maybeSingle();
  const senderEmail = (tokenRes.data as { microsoft_email?: string } | null)?.microsoft_email || "";

  const history = [];
  for (const c of campaigns || []) {
    const { count } = await supabase
      .from("recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id);
    history.push({
      id: c.id,
      name: c.name,
      status: c.status,
      created_at: c.created_at,
      subject_template: c.subject_template,
      rate_limit: c.rate_limit,
      sender_email: senderEmail,
      owner_email: user.email,
      audience: count || 0,
      scheduled_time: null,
      sent_at: c.updated_at,
    });
  }

  return NextResponse.json(history);
}
