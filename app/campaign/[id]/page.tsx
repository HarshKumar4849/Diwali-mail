"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Campaign, Recipient } from "@/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { ProgressBar } from "@/components/progress-bar";
import { RecipientTable } from "@/components/recipient-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { DeleteCampaignDialog } from "@/components/delete-campaign-dialog";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  RotateCcw,
  Trash2,
  Mail,
  CheckCircle2,
  AlertCircle,
  FileText,
  Activity,
  Eye,
  MailCheck,
  Loader2,
  Users,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; badgeClass: string }
> = {
  draft: {
    label: "Draft",
    icon: FileText,
    badgeClass: "bg-muted text-muted-foreground border-border/70",
  },
  sending: {
    label: "Sending in Progress",
    icon: Activity,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 animate-pulse",
  },
  done: {
    label: "Completed",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  partial: {
    label: "Partial Delivery",
    icon: AlertCircle,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300",
  },
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [audienceOverride, setAudienceOverride] = useState<{
    total: number;
    eligible: number;
    duplicateCount: number;
    duplicates: Array<{ email: string; count: number }>;
  } | null>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push("/login");
    });
  }, [router, supabase]);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load campaign");
        return r.json();
      })
      .then(setCampaign)
      .catch((e) => setError(e.message));
    fetch(`/api/campaigns/${id}/recipients`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load recipients");
        return r.json();
      })
      .then(setRecipients)
      .catch((e) => setError(e.message));
  }, [id]);

  // Consume batch-level audience summary returned right after recipients were added
  // (e.g. via the wizard) so duplicate removals are reflected against the original count.
  useEffect(() => {
    const raw = sessionStorage.getItem("mailcraft-audience-summary");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser sessionStorage on mount
      setAudienceOverride({
        total: Number(parsed.total) || 0,
        eligible: Number(parsed.eligible) || 0,
        duplicateCount: Number(parsed.duplicateCount) || 0,
        duplicates: Array.isArray(parsed.duplicates) ? parsed.duplicates : [],
      });
      sessionStorage.removeItem("mailcraft-audience-summary");
    } catch {
      // ignore malformed payload
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`campaign-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recipients",
          filter: `campaign_id=eq.${id}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const newRecord = payload.new as { [key: string]: unknown };
          if (newRecord.id) {
            setRecipients((prev) =>
              prev.map((r) => (r.id === newRecord.id ? (newRecord as unknown as Recipient) : r))
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "campaigns",
          filter: `id=eq.${id}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const newRecord = payload.new as Campaign;
          if (newRecord.status) {
            setCampaign((prev) => (prev ? { ...prev, status: newRecord.status } : prev));
            if (newRecord.status === "done") {
              toast.success("Campaign complete");
            } else if (newRecord.status === "partial") {
              toast.warning("Campaign sent with some failures");
            }
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, supabase]);

  // Resolve sender identity for the pre-send confirmation dialog
  useEffect(() => {
    if (!campaign) return;
    supabase
      .from("microsoft_tokens")
      .select("microsoft_email")
      .eq("user_id", campaign.user_id)
      .maybeSingle()
      .then(({ data }) => {
        setSenderEmail((data as { microsoft_email?: string } | null)?.microsoft_email || "");
      });
  }, [campaign, supabase]);

  // Audience summary: total contacts, eligible recipients, duplicates, excluded contacts
  const audienceSummary = useMemo(() => {
    // Prefer the batch-level summary returned by the recipients API when available
    // (e.g. right after a campaign was created) so duplicate removals are reflected
    // against the original contact count.
    if (audienceOverride) {
      return {
        total: audienceOverride.total,
        eligible: audienceOverride.eligible,
        duplicateCount: audienceOverride.duplicateCount,
        duplicates: audienceOverride.duplicates,
        excluded: [] as Array<{ email: string; reason: string }>,
      };
    }

    const total = recipients.length;

    // Group recipients by normalized email to detect duplicate audience entries.
    const groups = new Map<string, Recipient[]>();
    for (const r of recipients) {
      const key = (r.email || "").toLowerCase();
      if (!key) continue;
      const bucket = groups.get(key);
      if (bucket) bucket.push(r);
      else groups.set(key, [r]);
    }

    const duplicates = [...groups.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([email, rows]) => ({ email, count: rows.length }))
      .sort((a, b) => b.count - a.count);

    const duplicateCount = duplicates.reduce((sum, d) => sum + Math.max(0, d.count - 1), 0);

    const excluded: Array<{ email: string; reason: string }> = [];
    const eligibleEmails = new Set<string>();
    for (const [email, rows] of groups) {
      const actionable = rows.find((r) => r.status === "pending" || r.status === "sending");
      if (actionable) eligibleEmails.add(email);
      for (const r of rows) {
        if (r.status === "failed") excluded.push({ email: r.email, reason: "failed" });
        else if (r.status === "sent") excluded.push({ email: r.email, reason: "already_sent" });
      }
    }

    const eligible = eligibleEmails.size;

    return {
      total,
      eligible,
      duplicateCount,
      duplicates,
      excluded,
    };
  }, [recipients, audienceOverride]);

  const isProcessingBatchRef = useRef(false);
  const isSending = campaign?.status === "sending";

  useEffect(() => {
    if (!isSending) return;
    const interval = setInterval(async () => {
      // Trigger process-batch if not already in flight
      if (!isProcessingBatchRef.current) {
        isProcessingBatchRef.current = true;
        fetch(`/api/campaigns/${id}/process-batch`, { method: "POST" })
          .catch(() => {})
          .finally(() => {
            isProcessingBatchRef.current = false;
          });
      }

      try {
        const [campRes, recRes] = await Promise.all([
          fetch(`/api/campaigns/${id}`),
          fetch(`/api/campaigns/${id}/recipients`),
        ]);
        if (campRes.ok) {
          const updatedCampaign = await campRes.json();
          setCampaign(updatedCampaign);
          if (updatedCampaign.status === "done") {
            toast.success("Campaign complete");
          } else if (updatedCampaign.status === "partial") {
            toast.warning("Campaign sent with some failures");
          }
        }
        if (recRes.ok) {
          setRecipients(await recRes.json());
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [id, isSending]);

  const handleSend = async () => {
    // Phase 2: pre-send confirmation required before starting the campaign send
    setSendDialogOpen(true);
  };

  const confirmSend = async () => {
    setSendDialogOpen(false);
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to start sending");
      }
      setCampaign((prev) => (prev ? { ...prev, status: "sending" } : prev));
      toast.success("Campaign queued for sending");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start sending";
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const openPreview = async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}/preview`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load preview");
      }
      const data = await res.json();
      setPreviewSubject(data.subject || "");
      setPreviewHtml(data.html || "");
      setPreviewOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load preview");
    }
  };

  const sendTestEmail = async () => {
    const target = testEmail.trim();
    if (!target) {
      toast.error("Enter a test email address");
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send test email");
      toast.success(`Test email sent to ${target}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}/report?format=csv`);
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(campaign?.name || "campaign").replace(/[^a-z0-9]+/gi, "_")}-report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Campaign report downloaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate report");
    }
  };

  const handleRetry = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${id}/retry`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to retry");
      }
      const data = await res.json();
      setCampaign((prev) => (prev ? { ...prev, status: data.status } : prev));
      if (data.status === "draft") {
        toast.success("Campaign reset to draft");
      } else {
        toast.success("Retrying failed recipients");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to retry";
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Campaign deleted");
      setDeleteDialogOpen(false);
      router.push("/");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!campaign) {
    return (
      <div className="container mx-auto p-6 md:p-8 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-muted rounded-md animate-pulse" />
            <div className="h-4 w-32 bg-muted/60 rounded-md animate-pulse" />
          </div>
          <div className="h-10 w-28 bg-muted rounded-md animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-muted/40 rounded-xl border border-border/50 animate-pulse" />
          <div className="md:col-span-2 h-96 bg-muted/40 rounded-xl border border-border/50 animate-pulse" />
        </div>
      </div>
    );
  }

  const total = recipients.length;
  const sent = recipients.filter((r) => r.status === "sent").length;
  const failed = recipients.filter((r) => r.status === "failed").length;
  const pending = recipients.filter((r) => r.status === "pending" || r.status === "sending").length;
  const deliveredCount = recipients.filter((r) => r.status === "sent" && !r.bounced_at).length;
  const bouncedCount = recipients.filter((r) => r.bounced_at).length;
  const repliedCount = recipients.filter((r) => r.reply_kind).length;

  const currentStatusConfig = statusConfig[campaign.status] || statusConfig.draft;
  const StatusIcon = currentStatusConfig.icon;

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl pb-24 md:pb-12">
      {/* Breadcrumb */}
      <button
        onClick={() => router.push("/")}
        className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium mb-4 transition-colors cursor-pointer"
      >
        <ArrowLeft className="size-3.5 group-hover:-translate-x-0.5 transition-transform duration-150" />
        <span>Back to Campaigns</span>
      </button>

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-border/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {campaign.name}
            </h1>
            <Badge
              variant="outline"
              className={cn("gap-1.5 px-3 py-1 text-xs font-semibold shrink-0 shadow-2xs transition-colors", currentStatusConfig.badgeClass)}
            >
              <StatusIcon className="size-3.5" />
              <span>{currentStatusConfig.label}</span>
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2">
            <span>Created on {new Date(campaign.created_at).toLocaleDateString(undefined, { dateStyle: "long" })}</span>
            {campaign.rate_limit ? (
              <>
                <span>•</span>
                <span className="tabular-nums">Rate Limit: {campaign.rate_limit} emails/min</span>
              </>
            ) : null}
          </p>
        </div>

        {/* Action Button Group */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="outline" onClick={handleDownloadReport} className="gap-2">
            <Download className="size-4" />
            <span>Download Report</span>
          </Button>
          {campaign.status === "draft" && (
            <Button
              onClick={handleSend}
              disabled={sending}
              className="gap-2 shadow-xs"
            >
              <Send className="size-4" />
              <span>{sending ? "Initiating..." : "Send Campaign"}</span>
            </Button>
          )}

          {campaign.status === "sending" && (
            <Button
              variant="outline"
              onClick={handleRetry}
              disabled={sending}
              className="gap-2"
            >
              <RotateCcw className="size-4" />
              <span>{sending ? "Working..." : "Pause / Reset to Draft"}</span>
            </Button>
          )}

          {campaign.status === "partial" && (
            <Button
              variant="outline"
              onClick={handleRetry}
              disabled={sending}
              className="gap-2 border-amber-300 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50"
            >
              <RotateCcw className="size-4" />
              <span>{sending ? "Working..." : "Retry Failed Recipients"}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive/80 hover:text-destructive hover:bg-destructive/10 gap-1.5"
          >
            <Trash2 className="size-4" />
            <span>Delete</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm flex items-center justify-between shadow-xs">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError("")} className="h-7 text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {/* Main Campaign Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Metrics & Config */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Delivery Progress
            </h2>
            <ProgressBar total={total} sent={sent} failed={failed} />
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">
                <p className="text-[11px] font-medium">Pending</p>
                <p className="text-base font-bold tabular-nums mt-0.5">{pending}</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                <p className="text-[11px] font-medium">Sent</p>
                <p className="text-base font-bold tabular-nums mt-0.5">{sent}</p>
              </div>
              <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                <p className="text-[11px] font-medium">Failed</p>
                <p className="text-base font-bold tabular-nums mt-0.5">{failed}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                <p className="text-[11px] font-medium">Delivered</p>
                <p className="text-base font-bold tabular-nums mt-0.5">{deliveredCount}</p>
              </div>
              <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                <p className="text-[11px] font-medium">Bounced</p>
                <p className="text-base font-bold tabular-nums mt-0.5">{bouncedCount}</p>
              </div>
              <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">
                <p className="text-[11px] font-medium">Replied</p>
                <p className="text-base font-bold tabular-nums mt-0.5">{repliedCount}</p>
              </div>
            </div>
          </div>
          
          {/* Subject Line Card */}
          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              <Mail className="size-3.5 text-primary" />
              <span>Subject Line</span>
            </div>
            <p className="text-sm font-medium text-foreground break-words italic">
              {campaign.subject_template || "No subject set"}
            </p>
          </div>

          {/* Phase 2: Audience Summary */}
          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              <Users className="size-3.5 text-primary" />
              <span>Audience Summary</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">
                <p className="text-[11px] font-medium">Total Contacts</p>
                <p className="text-base font-bold tabular-nums mt-0.5">{audienceSummary.total}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">
                <p className="text-[11px] font-medium">Eligible</p>
                <p className="text-base font-bold tabular-nums mt-0.5 text-primary">{audienceSummary.eligible}</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                <p className="text-[11px] font-medium">Duplicates</p>
                <p className="text-base font-bold tabular-nums mt-0.5">{audienceSummary.duplicateCount}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">
                <p className="text-[11px] font-medium">Excluded</p>
                <p className="text-base font-bold tabular-nums mt-0.5">{audienceSummary.excluded.length}</p>
              </div>
            </div>
            {audienceSummary.duplicates.length > 0 && (
              <div className="text-xs text-amber-700 dark:text-amber-300">
                {audienceSummary.duplicateCount} duplicate contact(s) detected — excluded from sending.
              </div>
            )}
            {audienceSummary.excluded.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exclusion Reasons</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {audienceSummary.excluded.slice(0, 20).map((ex) => (
                    <div key={`${ex.email}-${ex.reason}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-foreground truncate">{ex.email}</span>
                      <span className="text-muted-foreground capitalize shrink-0">{ex.reason.replace(/_/g, " ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phase 2: Test Email & Preview */}
          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              <MailCheck className="size-3.5 text-primary" />
              <span>Test Email & Preview</span>
            </div>
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Test recipient email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="h-10"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={openPreview}
                  disabled={sending}
                >
                  <Eye className="size-3.5" />
                  <span>Preview</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={sendTestEmail}
                  disabled={sendingTest}
                >
                  <Send className="size-3.5" />
                  <span>{sendingTest ? "Sending..." : "Send Test"}</span>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Preview renders the campaign email exactly as it will be sent. Test emails are delivered via the connected mailbox — no real recipients are affected.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Recipient Table */}
        <ScrollReveal variant="table" className="lg:col-span-2">
          <RecipientTable recipients={recipients} />
        </ScrollReveal>
      </div>

      {/* Phase 2: Sender & Schedule Confirmation before final send */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="sm:max-w-[500px] p-6 gap-5">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
              <Send className="size-5" />
            </div>
            <div className="space-y-1.5 pt-0.5 flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground tracking-tight">
                Send campaign?
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                Please review the sending details before final confirmation. The campaign will be dispatched to the selected audience immediately.
              </DialogDescription>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Sender</span>
              <span className="font-medium text-foreground break-all">{senderEmail || "Connected Microsoft account"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Send className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Audience</span>
              <span className="font-medium text-foreground tabular-nums">
                {audienceSummary.eligible} eligible of {audienceSummary.total} total contact(s)
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Schedule</span>
              <span className="font-medium text-foreground tabular-nums">
                Immediate send · {new Date().toLocaleString()}
              </span>
            </div>
          </div>

          <DialogFooter className="mt-2 -mx-6 -mb-6 px-6 py-3.5 bg-muted/30 border-t border-border/60 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setSendDialogOpen(false)} disabled={sending} className="w-full sm:w-auto text-xs sm:text-sm font-medium">
              Cancel
            </Button>
            <Button type="button" onClick={confirmSend} disabled={sending} className="w-full sm:w-auto bg-primary text-white hover:bg-primary/90 focus-visible:ring-primary/30 text-xs sm:text-sm font-medium gap-1.5 shadow-2xs">
              {sending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Initiating...</span>
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  <span>Confirm &amp; Send</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 2: Test Email Preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden gap-0">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <DialogTitle className="text-base font-semibold text-foreground tracking-tight">
              Email Preview
            </DialogTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(false)} className="h-7 text-xs">
              Close
            </Button>
          </div>
          <div className="px-5 pb-5">
            <iframe
              title="Campaign email preview"
              srcDoc={previewHtml}
              className="h-[460px] w-full rounded-lg border border-border/70 bg-white"
            />
            {previewSubject && (
              <p className="mt-2 text-xs text-muted-foreground truncate">
                Subject: {previewSubject}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteCampaignDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        campaignName={campaign.name}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
