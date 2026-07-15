"use client";

import { Campaign } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sending: { label: "Sending", className: "bg-primary text-primary-foreground animate-pulse" },
  done: { label: "Done", className: "bg-green-600 text-white" },
  partial: { label: "Partial", className: "bg-amber-500 text-white" },
};

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const status = statusConfig[campaign.status] || statusConfig.draft;

  return (
    <Card className="cursor-pointer hover:shadow-lg transition-all duration-200 border-t-[3px] border-t-primary border-x border-b">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{campaign.name}</CardTitle>
          <Badge className={status.className}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Created: {new Date(campaign.created_at).toLocaleDateString()}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          Subject: {campaign.subject_template}
        </p>
      </CardContent>
    </Card>
  );
}
