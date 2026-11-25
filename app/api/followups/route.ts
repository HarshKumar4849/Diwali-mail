import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFollowupContacts, FOLLOWUP_INTERVALS } from "@/lib/followup/contacts";
import { syncFollowupData } from "@/lib/followup/sync";

export const dynamic = "force-dynamic";

const INTERVALS = new Set<number>(FOLLOWUP_INTERVALS);

/**
 * Derives the five follow-up statuses from REAL send/bounce/reply data.
 * Sent is never treated as delivered: a send only stays "No Response" /
 * "Follow-up Due" while no NDR has arrived for it.
 *
 * Note: implementation lives in `lib/followup/contacts.ts` so the export
 * endpoint can reuse the exact same derivation.
 */

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const intervalDays = INTERVALS.has(Number(req.nextUrl.searchParams.get("interval")))
    ? Number(req.nextUrl.searchParams.get("interval"))
    : 7;

  const { contacts, sync, error } = await loadFollowupContacts(user.id, supabase, intervalDays);
  if (error) return NextResponse.json({ error, sync }, { status: 500 });

  return NextResponse.json({ interval: intervalDays, contacts, sync });
}

/** Manual re-sync trigger (also runs automatically on GET). */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sync = await syncFollowupData(user.id, supabase);
  return NextResponse.json({ sync });
}
