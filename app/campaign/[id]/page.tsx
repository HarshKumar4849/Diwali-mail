"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Campaign, Recipient } from "@/types";
import { ProgressBar } from "@/components/progress-bar";
import { RecipientTable } from "@/components/recipient-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const supabase = createClient();

  useEffect(() => {
    fetch(`/api/campaigns/${id}`).then(r => r.json()).then(setCampaign);
    fetch(`/api/campaigns/${id}/recipients`).then(r => r.json()).then(setRecipients);
  }, [id]);

  useEffect(() => {
    const channel = supabase
      .channel(`campaign-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recipients", filter: `campaign_id=eq.${id}` }, (payload) => {
        const newRecord = payload.new as Record<string, any>;
        if (newRecord.id) {
          setRecipients(prev => prev.map(r => r.id === newRecord.id ? newRecord as unknown as Recipient : r));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleSend = async () => {
    await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
    setCampaign(prev => prev ? { ...prev, status: "sending" } : prev);
  };

  const handleRetry = async () => {
    await fetch(`/api/campaigns/${id}/retry`, { method: "POST" });
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
          {campaign.status === "draft" && <Button onClick={handleSend}>Send Now</Button>}
          {campaign.status === "partial" && <Button variant="outline" onClick={handleRetry}>Retry Failed</Button>}
        </div>
      </div>

      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Subject: {campaign.subject_template}</p>
        <ProgressBar sent={sent} total={total} />
      </div>

      <RecipientTable recipients={recipients} />
    </div>
  );
}
