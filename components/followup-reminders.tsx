"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AlarmClock, Check, Clock, RefreshCw } from "lucide-react";
import type { FollowupContact } from "@/lib/followup/contacts";
import type { FollowupReminderView } from "@/lib/followup/reminders";

const REMINDER_FILTERS = ["all", "pending", "overdue", "completed"] as const;
type ReminderFilter = (typeof REMINDER_FILTERS)[number];

const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  overdue: { label: "Overdue", classes: "bg-destructive/10 text-destructive border-destructive/20" },
  completed: { label: "Completed", classes: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
};

const ACTIONABLE_STATUSES = ["no_response", "followup_due", "delivery_failed"];

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalInputNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

interface Props {
  contacts: FollowupContact[];
}

export function FollowupReminders({ contacts }: Props) {
  const [reminders, setReminders] = useState<FollowupReminderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReminderFilter>("all");
  const [recipientId, setRecipientId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(toLocalInputNow);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/followups/reminders?status=all`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load reminders");
      setReminders(data.reminders || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load reminders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() awaits before any setState
    load();
  }, [load]);

  const eligibleContacts = useMemo(
    () => contacts.filter((c) => ACTIONABLE_STATUSES.includes(c.status)),
    [contacts]
  );

  const visible = useMemo(() => {
    if (filter === "all") return reminders;
    return reminders.filter((r) => r.status === filter);
  }, [reminders, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reminders.length, pending: 0, overdue: 0, completed: 0 };
    for (const r of reminders) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [reminders]);

  const handleCreate = async () => {
    if (!recipientId || !scheduledAt) {
      toast.error("Select a contact and a reminder date");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/followups/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId, scheduledAt: new Date(scheduledAt).toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create reminder");
      toast.success("Follow-up reminder created");
      setRecipientId("");
      setScheduledAt(toLocalInputNow());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create reminder");
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (id: string) => {
    const res = await fetch(`/api/followups/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error || "Failed to complete reminder");
    else {
      toast.success("Reminder completed");
      await load();
    }
  };

  const handleReschedule = async (id: string) => {
    if (!editDate) return;
    const res = await fetch(`/api/followups/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: new Date(editDate).toISOString() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error || "Failed to reschedule reminder");
    else {
      toast.success("Reminder rescheduled");
      setEditingId(null);
      await load();
    }
  };

  const statusIcon = (status: string) =>
    status === "completed" ? Check : status === "overdue" ? Clock : AlarmClock;

  return (
    <section className="rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-5 border-b border-border/70 bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-lg font-bold tracking-tight text-foreground">Follow-up Reminders</h2>
          <p className="text-xs text-muted-foreground">
            Schedule and manage follow-ups for contacts that need outreach.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <AlarmClock className="size-3" />
          {counts.all} total
        </Badge>
      </div>

      {/* Create reminder */}
      <div className="p-4 md:p-5 border-b border-border/60 bg-card space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Select value={recipientId} onValueChange={(v) => setRecipientId(v ?? "")}>
              <SelectTrigger className="h-9 text-sm bg-background">
                <SelectValue placeholder="Select contact to remind..." />
              </SelectTrigger>
              <SelectContent>
                {eligibleContacts.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No follow-up candidates available</div>
                )}
                {eligibleContacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {`${c.name || c.email} — ${c.campaign || c.email}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="h-9 text-sm w-full sm:w-56 bg-background"
          />
          <Button size="sm" className="h-9 gap-1.5" onClick={handleCreate} disabled={saving || !recipientId}>
            {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <AlarmClock className="size-3.5" />}
            <span>Create Reminder</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 md:px-5 py-3 flex items-center gap-2 border-b border-border/60 bg-muted/20 flex-wrap">
        {REMINDER_FILTERS.map((key) => {
          const meta = key === "all" ? { label: "All" } : STATUS_STYLES[key];
          const Icon = key === "all" ? Clock : statusIcon(key);
          const count = counts[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all duration-150 cursor-pointer",
                filter === key
                  ? key === "all"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background text-foreground border-border/70"
                  : "bg-transparent text-muted-foreground border-border/60 hover:bg-muted/50"
              )}
            >
              <Icon className="size-3.5" />
              {key === "all" ? "All" : meta.label}
              <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading reminders...</div>
      ) : visible.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-muted/40 text-left">
                <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Campaign</th>
                <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Reminder Date</th>
                <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const meta = STATUS_STYLES[r.status] || STATUS_STYLES.pending;
                const Icon = statusIcon(r.status);
                const isEditing = editingId === r.id;
                const isDone = r.status === "completed";
                return (
                  <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {r.recipient_name || "—"}
                      {r.recipient_company && <span className="block text-xs text-muted-foreground">{r.recipient_company}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{r.recipient_email}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">{r.recipient_campaign || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="datetime-local"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="h-7 text-xs w-[180px] bg-background"
                          />
                          <Button size="xs" className="h-7" onClick={() => handleReschedule(r.id)} disabled={!editDate}>Save</Button>
                          <Button size="xs" variant="outline" className="h-7" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        fmtDate(r.scheduled_at)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn("gap-1.5 px-2 py-0.5 text-xs font-medium", meta.classes)}>
                        <Icon className="size-3" />
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isDone ? null : (
                          <Button size="xs" variant="outline" className="h-7" onClick={() => { setEditingId(r.id); setEditDate(toLocalInputValue(r.scheduled_at)); }}>
                            Reschedule
                          </Button>
                        )}
                        {r.status !== "completed" && (
                          <Button size="xs" variant="outline" className={cn("h-7", !isDone && "text-emerald-600")} onClick={() => handleComplete(r.id)}>
                            <Check className="size-3" />
                            <span>Complete</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 border-t border-border/60 bg-card">
          <AlarmClock className="size-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No reminders found</p>
          <p className="text-xs text-muted-foreground mt-1">Create a reminder above to schedule a follow-up.</p>
        </div>
      )}
    </section>
  );
}
