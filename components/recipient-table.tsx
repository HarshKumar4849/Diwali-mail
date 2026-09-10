"use client";

import { useState } from "react";
import { Recipient } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Search,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; badgeClass: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    badgeClass: "bg-muted text-muted-foreground border-border/70",
  },
  sending: {
    label: "Sending",
    icon: Loader2,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 animate-pulse",
  },
  sent: {
    label: "Delivered",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300",
  },
};

export function RecipientTable({ recipients }: { recipients: Recipient[] }) {
  const [search, setSearch] = useState("");

  const filtered = recipients.filter((r) =>
    r.email.toLowerCase().includes(search.toLowerCase()) ||
    (r.error_message && r.error_message.toLowerCase().includes(search.toLowerCase())) ||
    r.status.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-xs space-y-0">
      {/* Table Top Toolbar */}
      <div className="p-3.5 md:p-4 bg-muted/30 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">Delivery Status</h3>
          <span className="text-xs text-muted-foreground">
            ({recipients.filter((r) => r.status === "sent").length} of {recipients.length} sent)
          </span>
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter recipients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-background"
          />
        </div>
      </div>

      {/* Recipient Rows Table */}
      <div className="max-h-96 overflow-y-auto overflow-x-auto divide-y divide-border/30">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-muted/50 text-muted-foreground border-b border-border/50 font-semibold sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-foreground/80">Recipient</th>
              <th className="px-4 py-2.5 font-semibold text-foreground/80">Status</th>
              <th className="px-4 py-2.5 font-semibold text-foreground/80">Dispatched At</th>
              <th className="px-4 py-2.5 font-semibold text-foreground/80">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filtered.length > 0 ? (
              filtered.map((r) => {
                const config = statusConfig[r.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                return (
                  <tr key={r.id} className="hover:bg-muted/40 transition-colors duration-150 group">
                    <td className="px-4 py-2.5 font-medium text-foreground tracking-tight">
                      {r.email}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn("gap-1 px-2 py-0.5 text-[11px] font-medium shrink-0 transition-all duration-200 shadow-2xs", config.badgeClass)}
                      >
                        <StatusIcon className={cn("size-3", r.status === "sending" ? "animate-spin" : "")} />
                        <span>{config.label}</span>
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums">
                      {r.sent_at
                        ? new Date(r.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 max-w-[240px] truncate">
                      {r.error_message ? (
                        <span className="text-rose-600 dark:text-rose-400 font-mono text-[11px] font-medium" title={r.error_message}>
                          {r.error_message}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted-foreground">
                  No matching recipients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
