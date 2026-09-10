"use client";

import { Campaign } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Pencil, Mail, Calendar, Clock, CheckCircle2, AlertCircle, Send, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; badgeClass: string }
> = {
  draft: {
    label: "Draft",
    icon: FileText,
    badgeClass: "bg-muted text-muted-foreground border-border/60",
  },
  sending: {
    label: "Sending",
    icon: Send,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 animate-pulse",
  },
  done: {
    label: "Completed",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  },
  partial: {
    label: "Needs Attention",
    icon: AlertCircle,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
  },
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
  const config = statusConfig[campaign.status] || statusConfig.draft;
  const StatusIcon = config.icon;

  return (
    <div className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 ease-out">
      <div>
        {/* Header: Name + Status */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <h3 className="font-semibold text-sm sm:text-base text-foreground tracking-tight group-hover:text-primary transition-colors line-clamp-1">
            {campaign.name}
          </h3>
          <Badge
            variant="outline"
            className={cn("gap-1.5 px-2.5 py-0.5 text-xs font-medium shrink-0 shadow-2xs transition-colors", config.badgeClass)}
          >
            <StatusIcon className="size-3" />
            <span>{config.label}</span>
          </Badge>
        </div>

        {/* Subject preview */}
        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground mb-4">
          <Mail className="size-3.5 shrink-0 text-muted-foreground/70" />
          <span className="truncate italic">
            {campaign.subject_template || "No subject set"}
          </span>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground/80 mb-4 pt-2.5 border-t border-border/40">
          <div className="flex items-center gap-1.5 tabular-nums">
            <Calendar className="size-3" />
            <span>{new Date(campaign.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
          {campaign.rate_limit ? (
            <div className="flex items-center gap-1.5 tabular-nums">
              <Clock className="size-3" />
              <span>{campaign.rate_limit}/min</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Action buttons */}
      {(onDelete || onClone || onEdit) && (
        <div className="flex items-center justify-end gap-1.5 pt-3 border-t border-border/50">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <Pencil className="size-3.5" />
              <span>Edit</span>
            </Button>
          )}
          {onClone && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClone}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <Copy className="size-3.5" />
              <span>Clone</span>
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-8 px-2.5 text-xs text-destructive/80 hover:text-destructive hover:bg-destructive/10 gap-1.5"
            >
              <Trash2 className="size-3.5" />
              <span>Delete</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
