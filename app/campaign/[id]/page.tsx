"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Campaign, Recipient } from "@/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { ProgressBar } from "@/components/progress-bar";
import { RecipientTable } from "@/components/recipient-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
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
  const supabase = createClient();
  const router = useRouter();

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
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start sending");
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

  const handleRetry = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to retry");
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

  const handleDelete = async () => {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Campaign deleted");
      router.push("/");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
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
            onClick={handleDelete}
            className="text-destructive/80 hover:text-destructive hover:bg-destructive/10 gap-1.5"
          >
            <Trash2 className="size-4" />
            <span>Delete</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Left Metrics + Right Recipient Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Progress & Campaign Details */}
        <div className="lg:col-span-1 lg:sticky lg:top-20 space-y-5">
          {/* Progress Card */}
          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs space-y-4">
            <h3 className="font-semibold text-foreground uppercase tracking-wider text-xs">
              Delivery Progress
            </h3>

            <ProgressBar sent={sent} total={total} failed={failed} />

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-center">
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-[11px] text-muted-foreground font-medium">Pending</p>
                <p className="text-base font-bold text-foreground tabular-nums mt-0.5">{pending}</p>
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
        </div>

        {/* Right Column: Recipient Table */}
        <ScrollReveal variant="table" className="lg:col-span-2">
          <RecipientTable recipients={recipients} />
        </ScrollReveal>
      </div>
    </div>
  );
}
