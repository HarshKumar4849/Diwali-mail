"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campaign } from "@/types";
import type { Session } from "@supabase/supabase-js";
import { CampaignCard } from "@/components/campaign-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Send, CheckCircle, AlertTriangle } from "lucide-react";

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    fetch("/api/campaigns")
      .then(r => {
        if (!r.ok) throw new Error("Failed to load campaigns");
        return r.json();
      })
      .then(setCampaigns)
      .catch(e => setError(e.message));
  }, [session]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setCampaigns(prev => prev.filter(c => c.id !== id));
      toast.success("Campaign deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!session) return null;

  const totalSent = campaigns.reduce((sum, c) => c.status === "done" ? sum + 1 : sum, 0);
  const totalPartial = campaigns.reduce((sum, c) => c.status === "partial" ? sum + 1 : sum, 0);

  return (
    <div className="container mx-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <Button onClick={() => router.push("/campaign/new")} className="hidden md:inline-flex">
          New Campaign
        </Button>
      </div>

      {error && <p className="text-destructive text-center mb-4">{error}</p>}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
        <div className="border border-border rounded-xl p-3 md:p-4 text-center">
          <Send className="size-5 md:size-6 mx-auto mb-1 text-primary" />
          <div className="text-xl md:text-2xl font-bold text-foreground">{campaigns.length}</div>
          <div className="text-xs md:text-sm text-muted-foreground">Total</div>
        </div>
        <div className="border border-border rounded-xl p-3 md:p-4 text-center">
          <CheckCircle className="size-5 md:size-6 mx-auto mb-1 text-green-600" />
          <div className="text-xl md:text-2xl font-bold text-foreground">{totalSent}</div>
          <div className="text-xs md:text-sm text-muted-foreground">Sent</div>
        </div>
        <div className="border border-border rounded-xl p-3 md:p-4 text-center">
          <AlertTriangle className="size-5 md:size-6 mx-auto mb-1 text-amber-500" />
          <div className="text-xl md:text-2xl font-bold text-foreground">{totalPartial}</div>
          <div className="text-xs md:text-sm text-muted-foreground">Partial</div>
        </div>
      </div>

      {/* Campaign grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map(c => (
          <div
            key={c.id}
            className="cursor-pointer"
            onClick={() => router.push(`/campaign/${c.id}`)}
          >
            <CampaignCard
              campaign={c}
              onEdit={(e) => {
                e.stopPropagation();
                router.push(`/campaign/edit/${c.id}`);
              }}
              onDelete={(e) => handleDelete(e, c.id)}
              onClone={async (e) => {
                e.stopPropagation();
                try {
                  const res = await fetch(`/api/campaigns/${c.id}/clone`, { method: "POST" });
                  if (!res.ok) throw new Error("Failed to clone");
                  const cloned = await res.json();
                  setCampaigns(prev => [...prev, cloned]);
                  toast.success("Campaign cloned");
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Failed to clone");
                }
              }}
            />
          </div>
        ))}
      </div>

      {campaigns.length === 0 && !error && (
        <p className="text-center text-muted-foreground mt-12">
          No campaigns yet. Create your first one!
        </p>
      )}

      {/* Mobile FAB */}
      <Button
        onClick={() => router.push("/campaign/new")}
        className="fixed bottom-20 right-4 md:hidden rounded-full size-14 shadow-lg"
        size="icon"
      >
        <Plus className="size-6" />
      </Button>
    </div>
  );
}
