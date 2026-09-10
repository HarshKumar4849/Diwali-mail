"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campaign } from "@/types";
import type { Session } from "@supabase/supabase-js";
import { CampaignCard } from "@/components/campaign-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { DeleteCampaignDialog } from "@/components/delete-campaign-dialog";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Send,
  AlertCircle,
  Inbox,
  Search,
  MailCheck,
  Layers,
} from "lucide-react";

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session) router.push("/login");
    });
  }, [router]);

  const hasActiveCampaigns = campaigns.some((c) => c.status === "sending");

  useEffect(() => {
    if (!session) return;

    const loadCampaigns = () => {
      fetch("/api/campaigns")
        .then((r) => {
          if (!r.ok) throw new Error("Failed to load campaigns");
          return r.json();
        })
        .then(setCampaigns)
        .catch((e) => setError(e.message));
    };

    loadCampaigns();

    // Auto-refresh when any campaign is currently sending
    if (hasActiveCampaigns) {
      const interval = setInterval(loadCampaigns, 3000);
      return () => clearInterval(interval);
    }
  }, [session, hasActiveCampaigns]);

  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent, campaign: Campaign) => {
    e.stopPropagation();
    setCampaignToDelete(campaign);
  };

  const confirmDelete = async () => {
    if (!campaignToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignToDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setCampaigns((prev) => prev.filter((c) => c.id !== campaignToDelete.id));
      toast.success("Campaign deleted");
      setCampaignToDelete(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCampaigns = useMemo(() => {
    if (!searchQuery.trim()) return campaigns;
    const q = searchQuery.toLowerCase();
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.subject_template && c.subject_template.toLowerCase().includes(q))
    );
  }, [campaigns, searchQuery]);

  if (loading) {
    return (
      <div className="container mx-auto p-6 md:p-8 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted rounded-md animate-pulse" />
            <div className="h-4 w-72 bg-muted/60 rounded-md animate-pulse" />
          </div>
          <div className="h-10 w-36 bg-muted rounded-md animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted/50 rounded-xl border border-border/50 animate-pulse" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-muted/40 rounded-xl border border-border/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) return null;

  const totalSending = campaigns.reduce((sum, c) => (c.status === "sending" ? sum + 1 : sum), 0);
  const totalSent = campaigns.reduce((sum, c) => (c.status === "done" ? sum + 1 : sum), 0);
  const totalPartial = campaigns.reduce((sum, c) => (c.status === "partial" ? sum + 1 : sum), 0);

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl pb-24 md:pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Campaigns
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build, schedule, and dispatch personalized bulk email campaigns.
          </p>
        </div>
        <Button
          onClick={() => router.push("/campaign/new")}
          className="shadow-xs gap-2 shrink-0 hidden md:inline-flex"
        >
          <Plus className="size-4" />
          <span>New Campaign</span>
        </Button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 mb-8">
        {/* Total Campaigns */}
        <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs hover:border-border hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 ease-out flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Campaigns</p>
            <p className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight tabular-nums mt-1">{campaigns.length}</p>
          </div>
          <div className="size-10 sm:size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Layers className="size-5" />
          </div>
        </div>

        {/* Active Sending */}
        <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 ease-out flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sending Now</span>
              {totalSending > 0 && (
                <span className="size-2 rounded-full bg-blue-500 animate-ping" />
              )}
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 tracking-tight tabular-nums mt-1">{totalSending}</p>
          </div>
          <div className="size-10 sm:size-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Send className="size-5" />
          </div>
        </div>

        {/* Completed */}
        <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 ease-out flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Delivered</p>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums mt-1">{totalSent}</p>
          </div>
          <div className="size-10 sm:size-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <MailCheck className="size-5" />
          </div>
        </div>

        {/* Needs Attention */}
        <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 shadow-xs hover:border-amber-200 dark:hover:border-amber-800 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 ease-out flex items-center justify-between">
          <div>
            <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Needs Attention</p>
            <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400 tracking-tight tabular-nums mt-1">{totalPartial}</p>
          </div>
          <div className="size-10 sm:size-11 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertCircle className="size-5" />
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      {campaigns.length > 0 && (
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="relative w-full max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search campaigns..."
              className="pl-9 h-10 bg-card text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground hidden sm:inline">
            Showing {filteredCampaigns.length} of {campaigns.length}
          </p>
        </div>
      )}

      {/* Campaign Grid */}
      {filteredCampaigns.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCampaigns.map((c, index) => {
            // First 3 cards (first row on desktop) render immediately without delay.
            // Cards further down reveal smoothly as they enter the viewport upon scrolling.
            const isFirstRow = index < 3;
            const staggerDelay = (index % 3) * 60; // 0ms, 60ms, 120ms
            return (
              <ScrollReveal
                key={c.id}
                immediate={isFirstRow}
                delay={staggerDelay}
                variant="card"
                className="h-full"
              >
                <div
                  className="cursor-pointer h-full"
                  onClick={() => router.push(`/campaign/${c.id}`)}
                >
                  <CampaignCard
                    campaign={c}
                    onEdit={(e) => {
                      e.stopPropagation();
                      router.push(`/campaign/edit/${c.id}`);
                    }}
                    onDelete={(e) => handleDeleteClick(e, c)}
                    onClone={async (e) => {
                      e.stopPropagation();
                      try {
                        const res = await fetch(`/api/campaigns/${c.id}/clone`, { method: "POST" });
                        if (!res.ok) throw new Error("Failed to clone");
                        const cloned = await res.json();
                        setCampaigns((prev) => [...prev, cloned]);
                        toast.success("Campaign cloned");
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : "Failed to clone");
                      }
                    }}
                  />
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      ) : campaigns.length > 0 ? (
        <ScrollReveal variant="fade" className="text-center py-16 border border-dashed border-border/80 rounded-2xl bg-card/50">
          <Search className="size-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No matching campaigns found</p>
          <p className="text-xs text-muted-foreground mt-1">Try adjusting your search keywords</p>
        </ScrollReveal>
      ) : (
        /* Empty State */
        <ScrollReveal variant="fade" className="text-center py-20 px-4 border border-dashed border-border/80 rounded-2xl bg-card/60 max-w-2xl mx-auto shadow-xs">
          <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 shadow-xs">
            <Inbox className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-foreground">No email campaigns yet</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Upload your contacts, compose personalized templates with placeholders, and send reliably via your connected Outlook account.
          </p>
          <Button
            onClick={() => router.push("/campaign/new")}
            className="mt-6 gap-2 shadow-sm"
          >
            <Plus className="size-4" />
            <span>Create Your First Campaign</span>
          </Button>
        </ScrollReveal>
      )}

      {/* Mobile Floating Action Button */}
      <Button
        onClick={() => router.push("/campaign/new")}
        className="fixed bottom-20 right-4 md:hidden rounded-full size-14 shadow-xl shadow-primary/30 z-40"
        size="icon"
      >
        <Plus className="size-6" />
      </Button>

      <DeleteCampaignDialog
        open={campaignToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setCampaignToDelete(null);
        }}
        campaignName={campaignToDelete?.name}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
