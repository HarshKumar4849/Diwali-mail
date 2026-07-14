"use client";

import { Campaign } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500",
  sending: "bg-blue-500 animate-pulse",
  done: "bg-green-500",
  partial: "bg-yellow-500",
};

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{campaign.name}</CardTitle>
          <Badge className={statusColors[campaign.status]}>{campaign.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Created: {new Date(campaign.created_at).toLocaleDateString()}
        </p>
        <p className="text-sm text-muted-foreground">
          Subject: {campaign.subject_template}
        </p>
      </CardContent>
    </Card>
  );
}
