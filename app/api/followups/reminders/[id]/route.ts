import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapReminderToView, type FollowupReminderView } from "@/lib/followup/reminders";

export const dynamic = "force-dynamic";

const REMINDER_SELECT = `id, recipient_id, user_id, scheduled_at, status, note, created_at, updated_at, recipients!inner(email, data, campaigns!inner(name))`;

/**
 * Phase: Reschedule / complete a follow-up reminder.
 * PATCH { scheduledAt?, status? } — scheduledAt reschedules (reopens if completed), status completes.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates: { scheduled_at?: string; status?: string; updated_at?: string } = { updated_at: new Date().toISOString() };

  if (body.scheduledAt) {
    const scheduledDate = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt" }, { status: 400 });
    }
    updates.scheduled_at = scheduledDate.toISOString();
    // Rescheduling a completed reminder reopens it as pending.
    if (body.status !== "completed") updates.status = "pending";
  }

  if (body.status) {
    if (body.status !== "pending" && body.status !== "completed") {
      return NextResponse.json({ error: "status must be pending or completed" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (!updates.scheduled_at && !updates.status) {
    return NextResponse.json({ error: "scheduledAt or status is required" }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("followup_reminders")
    .select(REMINDER_SELECT)
    .eq("id", id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }

  const { data: updated, error: updErr } = await supabase
    .from("followup_reminders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message || "Failed to update reminder" }, { status: 500 });
  }

  const reminder: FollowupReminderView = mapReminderToView({
    ...updated,
    recipients: existing.recipients,
  });
  return NextResponse.json({ reminder });
}
