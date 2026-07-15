"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Campaign, Recipient } from "@/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { ProgressBar } from "@/components/progress-bar";
import { RecipientTable } from "@/components/recipient-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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
      .then(r => {
        if (!r.ok) throw new Error("Failed to load campaign");
        return r.json();
      })
      .then(setCampaign)
      .catch(e => setError(e.message));
    fetch(`/api/campaigns/${id}/recipients`)
      .then(r => {
        if (!r.ok) throw new Error("Failed to load recipients");
        return r.json();
      })
      .then(setRecipients)
      .catch(e => setError(e.message));
  }, [id]);

  useEffect(() => {
    const channel = supabase
      .channel(`campaign-${id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "recipients",
        filter: `campaign_id=eq.${id}`
      }, (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
        const newRecord = payload.new as { [key: string]: unknown };
        if (newRecord.id) {
          setRecipients(prev => prev.map(r => r.id === newRecord.id ? newRecord as unknown as Recipient : r));
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "campaigns",
        filter: `id=eq.${id}`
      }, (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
        const newRecord = payload.new as Campaign;
        if (newRecord.status) {
          setCampaign(prev => prev ? { ...prev, status: newRecord.status } : prev);
          if (newRecord.status === "done") {
            toast.success("Campaign complete");
          } else if (newRecord.status === "partial") {
            toast.warning("Campaign sent with some failures");
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, supabase]);

  useEffect(() => {
    if (!campaign || campaign.status !== "sending") return;
    const interval = setInterval(async () => {
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
  }, [id, campaign?.status]);

  const handleSend = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start sending");
      setCampaign(prev => prev ? { ...prev, status: "sending" } : prev);
      toast.success("Campaign queued for sending");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start sending";
      setError(msg);
      toast.error(msg);
    }
    setSending(false);
  };

  const handleRetry = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to retry");
      const data = await res.json();
      setCampaign(prev => prev ? { ...prev, status: data.status } : prev);
      if (data.status === "draft") {
        toast.success("Campaign reset to draft");
      } else {
        toast.success("Retrying failed recipients");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to retry";
      setError(msg);
      toast.error(msg);
    }
    setSending(false);
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

  if (!campaign) return (
    <div className="container mx-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted rounded animate-pulse" />
          <div className="h-5 w-16 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-8 w-24 bg-muted rounded animate-pulse" />
      </div>
      <div className="mb-6">
        <div className="h-4 w-96 bg-muted rounded animate-pulse mb-3" />
        <div className="h-4 w-full bg-muted rounded animate-pulse" />
      </div>
      <div className="space-y-2">
        {[1,2,3].map(i => <div key={i} className="h-10 w-full bg-muted rounded animate-pulse" />)}
      </div>
    </div>
  );

  const total = recipients.length;
  const sent = recipients.filter(r => r.status === "sent").length;

  return (
    <div className="container mx-auto p-4 md:p-6 pb-20 md:pb-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{campaign.name}</h1>
          <Badge className={
            campaign.status === "draft" ? "bg-muted text-muted-foreground" :
            campaign.status === "sending" ? "bg-primary text-primary-foreground animate-pulse" :
            campaign.status === "done" ? "bg-green-600 text-white" :
            "bg-amber-500 text-white"
          }>{campaign.status}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          {campaign.status === "draft" && <Button onClick={handleSend} disabled={sending}>{sending ? "Sending..." : "Send Now"}</Button>}
          {campaign.status === "sending" && <Button variant="outline" onClick={handleRetry} disabled={sending}>{sending ? "Working..." : "Reset to Draft"}</Button>}
          {campaign.status === "partial" && <Button variant="outline" onClick={handleRetry} disabled={sending}>{sending ? "Working..." : "Retry Failed"}</Button>}
          <Button variant="destructive" onClick={handleDelete}>Delete</Button>
        </div>
      </div>

      {error && <p className="text-destructive mb-4">{error}</p>}

      {/* Two-column layout: left info + progress, right recipients */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: campaign info */}
        <div className="md:col-span-1 space-y-4">
          <div className="border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Subject</p>
            <p className="text-sm font-medium break-words">{campaign.subject_template}</p>
          </div>
          <div className="border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-2">Progress</p>
            <ProgressBar sent={sent} total={total} />
          </div>
        </div>

        {/* Right column: recipient table */}
        <div className="md:col-span-2">
          <RecipientTable recipients={recipients} />
        </div>
      </div>
    </div>
  );
}
