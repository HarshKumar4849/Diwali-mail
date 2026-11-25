"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { FollowupReminders } from "@/components/followup-reminders";
import { toast } from "sonner";
import type { FollowupStatus } from "@/types";
import {
  Timer,
  RefreshCw,
  MailWarning,
  Bot,
  UserCheck,
  Clock,
  AlarmClock,
  Inbox,
  Download,
  FileSpreadsheet,
} from "lucide-react";

interface FollowupContact {
  id: string;
  email: string;
  name: string;
  company: string;
  campaign: string;
  sentAt: string;
  status: FollowupStatus;
  replyAt?: string;
  replyCategory?: string;
}

interface SyncInfo {
  inboxScanned: number;
  sentItemsScanned: number;
  bouncesDetected: number;
  autoRepliesDetected: number;
  genuineRepliesDetected: number;
  trackingColumnsAvailable: boolean;
  errors: string[];
}

const INTERVALS = [3, 5, 7, 10] as const;

const STATUS_META: Record<FollowupStatus | "all", { label: string; icon: React.ElementType; classes: string }> = {
  all: { label: "All", icon: Inbox, classes: "" },
  followup_due: { label: "Follow-up Due", icon: AlarmClock, classes: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  no_response: { label: "No Response", icon: Clock, classes: "bg-muted text-muted-foreground border-border/60" },
  auto_reply: { label: "Automated Reply", icon: Bot, classes: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  genuine_reply: { label: "Genuine Reply", icon: UserCheck, classes: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  delivery_failed: { label: "Delivery Failed", icon: MailWarning, classes: "bg-destructive/10 text-destructive border-destructive/20" },
};

// Default view: only contacts that still need attention.
const DEFAULT_FILTERS: (FollowupStatus | "all")[] = ["followup_due", "no_response", "auto_reply"];

export default function FollowupsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [contacts, setContacts] = useState<FollowupContact[]>([]);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [interval, setIntervalDays] = useState<number>(7);
  const [activeFilter, setActiveFilter] = useState<FollowupStatus | "all">("followup_due");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push("/login");
      const saved = Number(localStorage.getItem("followup_interval"));
      if (INTERVALS.includes(saved as 3 | 5 | 7 | 10)) setIntervalDays(saved);
    });
  }, [router]);

  const load = useCallback(async (days: number) => {
    try {
      const res = await fetch(`/api/followups?interval=${days}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load follow-ups");
      setContacts(data.contacts || []);
      setSync(data.sync || null);
      const blocking = (data.sync?.errors || []).filter((m: string) => !/Tracking columns not found/.test(m));
      if (blocking.length) toast.warning(blocking[0]);
      const genuineReplies = (data.contacts || []).filter((c: { status: string }) => c.status === "genuine_reply");
      if (genuineReplies.length > 0) {
        toast.success(`${genuineReplies.length} genuine reply/reply(s) detected — owner notified for follow-up review`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load follow-ups");
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() awaits before any setState
    load(interval);
  }, [interval, load]);

  const handleSync = () => {
    setSyncing(true);
    load(interval);
  };

  const changeInterval = (days: number) => {
    setIntervalDays(days);
    localStorage.setItem("followup_interval", String(days));
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      const params = new URLSearchParams({ format, interval: String(interval) });
      if (activeFilter !== "all") params.set("status", activeFilter);
      const res = await fetch(`/api/followups/export?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to generate export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mailcraft-followups-${activeFilter === "all" ? "all" : activeFilter}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Follow-up list exported as ${format.toUpperCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate export");
    }
  };

  // Follow-up list default: excludes Delivery Failed and Genuine Reply.
  const visible = useMemo(() => {
    const filters = activeFilter === "all" ? DEFAULT_FILTERS : [activeFilter];
    return contacts.filter(c => filters.includes(c.status));
  }, [contacts, activeFilter]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  if (loading) {
    return (
      <div className="container mx-auto p-6 md:p-8 max-w-7xl">
        <div className="h-8 w-56 bg-muted rounded-md animate-pulse mb-3" />
        <div className="h-10 w-full bg-muted/60 rounded-xl animate-pulse mb-6" />
        <div className="h-64 bg-muted/40 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl pb-24 md:pb-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Follow-ups</h1>
          <p className="text-sm text-muted-foreground">
            Contacts from your campaigns that need attention, based on real delivery and reply tracking.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => handleExport("csv")}>
            <Download className="size-3.5" />
            <span>Export CSV</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => handleExport("xlsx")}>
            <FileSpreadsheet className="size-3.5" />
            <span>Export XLSX</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 shrink-0" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "Syncing..." : "Sync"}</span>
          </Button>
        </div>
      </div>

      {/* Follow-up interval selector */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Timer className="size-4" />
          Follow-up interval
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg border border-border/70 bg-muted/40">
          {INTERVALS.map(d => (
            <button
              key={d}
              onClick={() => changeInterval(d)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
                interval === d
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {(["followup_due", "no_response", "auto_reply", "genuine_reply", "delivery_failed", "all"] as const).map(key => {
          const meta = STATUS_META[key];
          const Icon = meta.icon;
          const count = key === "all"
            ? visible.length
            : contacts.filter(c => c.status === key).length;
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all duration-150 cursor-pointer ${
                activeFilter === key
                  ? key === "all"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : meta.classes
                  : "bg-transparent text-muted-foreground border-border/60 hover:bg-muted/50"
              }`}
            >
              <Icon className="size-3.5" />
              {meta.label}
              <span className="opacity-70">{key === "all" ? `(${contacts.filter(c => DEFAULT_FILTERS.includes(c.status)).length})` : `(${count})`}</span>
            </button>
          );
        })}
      </div>

      {/* Contact list */}
      {visible.length > 0 ? (
        <ScrollReveal variant="section">
          <div className="rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/40 text-left">
                    <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Company</th>
                    <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Campaign</th>
                    <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Sent</th>
                    <th className="px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                    {visible.map(c => {
                    const meta = STATUS_META[c.status];
                    const Icon = meta.icon;
                    return (
                      <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{c.name || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.company || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate">{c.email}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">{c.campaign || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(c.sentAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${meta.classes}`}>
                            <Icon className="size-3" />
                            {c.status === "genuine_reply" && c.replyCategory ? `Genuine Reply · ${c.replyCategory}` : meta.label}
                          </span>
                          {c.status === "genuine_reply" && c.replyCategory && (
                            <p className="text-[11px] text-muted-foreground mt-1">Reply received {c.replyAt ? fmtDate(c.replyAt) : ""}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </ScrollReveal>
      ) : (
        <div className="text-center py-16 border border-dashed border-border/60 rounded-xl bg-muted/10">
          <Inbox className="size-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No contacts in this view</p>
          <p className="text-xs text-muted-foreground mt-1">
            Send a campaign first, or switch filters to see other statuses.
          </p>
        </div>
      )}

      {/* Sync diagnostics — real data only */}
      {sync && (
        <p className="mt-4 text-[11px] text-muted-foreground">
          Last sync: scanned {sync.inboxScanned} inbox / {sync.sentItemsScanned} sent messages ·
          {" "}{sync.bouncesDetected} bounce(s), {sync.autoRepliesDetected} automated, {sync.genuineRepliesDetected} genuine reply(ies) detected
          {!sync.trackingColumnsAvailable && " · DB tracking columns not applied yet — statuses computed live"}
        </p>
      )}

      {/* Follow-up reminders management */}
      <div className="mt-8">
        <FollowupReminders contacts={contacts} />
      </div>
    </div>
  );
}
