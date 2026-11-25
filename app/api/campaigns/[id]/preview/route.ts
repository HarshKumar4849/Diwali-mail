import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { renderTemplate, compileTemplate } from "@/lib/email/template";

export const dynamic = "force-dynamic";

/**
 * Pre-send preview: renders the campaign email (subject + HTML body) for QA/testing.
 * No actual send happens here — used by the Test Email & Preview feature.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (campErr || !campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: sampleList } = await supabase
    .from("recipients")
    .select("data")
    .eq("campaign_id", id)
    .order("created_at")
    .limit(1);
  const data = ((sampleList && sampleList[0] ? (sampleList[0] as { data?: Record<string, string> }).data : undefined) || {}) as Record<string, string>;

  const subject = renderTemplate(campaign.subject_template, data);
  const html = compileTemplate(campaign.body_template, data);

  return NextResponse.json({ subject, html });
}
