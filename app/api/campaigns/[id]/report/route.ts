import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

/**
 * Phase 3: Campaign performance report.
 * Exports a CSV with per-recipient delivery/reply tracking details.
 * Sent is never treated as delivered: delivered = sent AND not bounced.
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

  const { data: recipients, error } = await supabase
    .from("recipients")
    .select("*")
    .eq("campaign_id", id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Recipient Email", "Status", "Sent At", "Bounced At", "Reply Kind", "Reply At", "Error Message"];
  const lines = [header.map(esc).join(",")];
  for (const r of recipients || []) {
    lines.push(
      [
        r.email || "",
        r.status || "",
        r.sent_at || "",
        r.bounced_at || "",
        r.reply_kind || "",
        r.reply_at || "",
        r.error_message || "",
      ]
        .map(esc)
        .join(",")
    );
  }
  const csv = lines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${(campaign.name || "campaign").replace(/[^a-z0-9]+/gi, "_")}-report.csv"`,
    },
  });
}
