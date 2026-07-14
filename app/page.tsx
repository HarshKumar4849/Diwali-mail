"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Campaign } from "@/types";
import { CampaignCard } from "@/components/campaign-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session) router.push("/login");
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    fetch("/api/campaigns").then(r => r.json()).then(setCampaigns);
  }, [session]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!session) return null;

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Mailcraft</h1>
        <Button onClick={() => router.push("/campaign/new")}>
          New Campaign
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map(c => (
          <div key={c.id} onClick={() => router.push(`/campaign/${c.id}`)}>
            <CampaignCard campaign={c} />
          </div>
        ))}
      </div>
      {campaigns.length === 0 && (
        <p className="text-center text-muted-foreground mt-12">
          No campaigns yet. Create your first one!
        </p>
      )}
    </div>
  );
}
