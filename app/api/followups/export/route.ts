import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFollowupContacts, FOLLOWUP_INTERVALS } from "@/lib/followup/contacts";
import { buildFollowupExportRows, toFollowupCsv, generateFollowupXlsx } from "@/lib/followup/export";

export const dynamic = "force-dynamic";

const INTERVALS = new Set<number>(FOLLOWUP_INTERVALS);

const EXPORT_STATUSES = new Set(["delivery_failed", "auto_reply", "genuine_reply", "no_response", "followup_due", "all"]);

/**
 * Phase: Export Follow-up contacts to CSV / Excel (.xlsx).
 * Exports only REAL derived follow-up data (same pipeline as /api/followups).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = (req.nextUrl.searchParams.get("format") || "csv").toLowerCase() === "xlsx" ? "xlsx" : "csv";
  const statusParam = req.nextUrl.searchParams.get("status");
  const intervalDays = INTERVALS.has(Number(req.nextUrl.searchParams.get("interval")))
    ? Number(req.nextUrl.searchParams.get("interval"))
    : 7;

  const { contacts, sync, error } = await loadFollowupContacts(user.id, supabase, intervalDays);
  if (error) return NextResponse.json({ error, sync }, { status: 500 });

  // Optional status filter (export reflects the selected follow-up status).
  const status = statusParam && EXPORT_STATUSES.has(statusParam) ? statusParam : "all";
  const filtered = status === "all" ? contacts : contacts.filter((c) => c.status === status);

  const rows = buildFollowupExportRows(filtered, intervalDays);

  const safeStatus = status.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const filename = `mailcraft-followups-${safeStatus || "all"}`;

  if (format === "xlsx") {
    try {
      const content = await generateFollowupXlsx(rows);
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
        },
      });
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to generate Excel export: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 }
      );
    }
  }

  const csv = toFollowupCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
