"use client";

import { Campaign } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Pencil } from "lucide-react";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sending: { label: "Sending", className: "bg-primary text-primary-foreground animate-pulse" },
  done: { label: "Done", className: "bg-green-600 text-white" },
  partial: { label: "Partial", className: "bg-amber-500 text-white" },
};

export function CampaignCard({
  campaign,
  onDelete,
  onClone,
  onEdit,
}: {
  campaign: Campaign;
  onDelete?: (e: React.MouseEvent) => void;
  onClone?: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent) => void;
}) {
  const status = statusConfig[campaign.status] || statusConfig.draft;

  return (
    <Card className="hover:shadow-lg transition-all duration-200 border-t-[3px] border-t-primary border-x border-b">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg truncate">{campaign.name}</CardTitle>
          <Badge className={status.className + " shrink-0"}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Created: {new Date(campaign.created_at).toLocaleDateString()}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          Subject: {campaign.subject_template}
        </p>
        {(onDelete || onClone || onEdit) && (
          <div className="flex items-center gap-1 mt-3 pt-3 border-t">
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit} className="h-8 text-xs gap-1">
                <Pencil className="size-3" />
                Edit
              </Button>
            )}
            {onClone && (
              <Button variant="outline" size="sm" onClick={onClone} className="h-8 text-xs gap-1">
                <Copy className="size-3" />
                Clone
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3" />
                Delete
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
