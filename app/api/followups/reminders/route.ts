import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapReminderToView, type FollowupReminderView } from "@/lib/followup/reminders";

export const dynamic = "force-dynamic";

const REMINDER_SELECT = `id, recipient_id, user_id, scheduled_at, status, note, created_at, updated_at, recipients!inner(email, data, campaigns!inner(name))`;

/**
 * Phase: Lead Follow-up reminders.
 * GET  → list reminders (with contact details) for the authenticated user.
 * POST → create a follow-up reminder for a recipient (duplicate pending blocked).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statusFilter = req.nextUrl.searchParams.get("status");

  let query = supabase
    .from("followup_reminders")
    .select(REMINDER_SELECT)
    .eq("user_id", user.id)
    .order("scheduled_at", { ascending: true });

  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "overdue") {
      query = query.eq("status", "pending").lt("scheduled_at", new Date().toISOString());
    } else if (statusFilter === "pending" || statusFilter === "completed") {
      query = query.eq("status", statusFilter);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reminders: FollowupReminderView[] = (data || []).map((r) => mapReminderToView(r));

  return NextResponse.json({ reminders });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const recipientId = body?.recipientId;
  const scheduledAt = body?.scheduledAt;

  if (!recipientId || !scheduledAt) {
    return NextResponse.json({ error: "recipientId and scheduledAt are required" }, { status: 400 });
  }
  const scheduledDate = new Date(scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "Invalid scheduledAt" }, { status: 400 });
  }

  // Verify recipient belongs to this user.
  const { data: recipient, error: rErr } = await supabase
    .from("recipients")
    .select("id, campaigns!inner(user_id)")
    .eq("id", recipientId)
    .eq("campaigns.user_id", user.id)
    .single();
  if (rErr || !recipient) return NextResponse.json({ error: "Recipient not found" }, { status: 404 });

  // Duplicate prevention: only one pending reminder per recipient.
  const { data: existing } = await supabase
    .from("followup_reminders")
    .select("id")
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "A pending reminder already exists for this contact" },
      { status: 409 }
    );
  }

  const { data: created, error: insErr } = await supabase
    .from("followup_reminders")
    .insert({
      recipient_id: recipientId,
      user_id: user.id,
      scheduled_at: scheduledDate.toISOString(),
      status: "pending",
    })
    .select(REMINDER_SELECT)
    .single();

  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message || "Failed to create reminder" }, { status: 500 });
  }

  const reminder = mapReminderToView(created);
  return NextResponse.json({ reminder }, { status: 201 });
}
