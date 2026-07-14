"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Campaign, Recipient } from "@/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { ProgressBar } from "@/components/progress-bar";
import { RecipientTable } from "@/components/recipient-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const supabase = createClient();

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
      .on("postgres_changes", { event: "*", schema: "public", table: "recipients", filter: `campaign_id=eq.${id}` }, (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
        const newRecord = payload.new as { [key: string]: unknown };
        if (newRecord.id) {
          setRecipients(prev => prev.map(r => r.id === newRecord.id ? newRecord as unknown as Recipient : r));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleSend = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start sending");
      setCampaign(prev => prev ? { ...prev, status: "sending" } : prev);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start sending");
    }
    setSending(false);
  };

  const handleRetry = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to retry");
      setCampaign(prev => prev ? { ...prev, status: "sending" } : prev);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to retry");
    }
    setSending(false);
  };

  if (!campaign) return <div className="p-8 text-center">Loading...</div>;

  const total = recipients.length;
  const sent = recipients.filter(r => r.status === "sent").length;

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{campaign.name}</h1>
          <Badge>{campaign.status}</Badge>
        </div>
        <div className="flex gap-2">
          {campaign.status === "draft" && <Button onClick={handleSend} disabled={sending}>{sending ? "Sending..." : "Send Now"}</Button>}
          {campaign.status === "partial" && <Button variant="outline" onClick={handleRetry} disabled={sending}>{sending ? "Sending..." : "Retry Failed"}</Button>}
        </div>
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Subject: {campaign.subject_template}</p>
        <ProgressBar sent={sent} total={total} />
      </div>

      <RecipientTable recipients={recipients} />
    </div>
  );
}
