"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { WizardData } from "@/types";
import { Search, Users, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function StepRecipients({ data }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [search, setSearch] = useState("");
  const emailCol = data.emailColumn;
  const rows = data.csvRows || [];

  const filtered = rows.filter((r: Record<string, string>) =>
    (emailCol && r[emailCol]?.toLowerCase().includes(search.toLowerCase())) ||
    Object.values(r).some((v) => v?.toString().toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Search and Counts Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Contact List</span>
          <Badge variant="secondary" className="text-xs">
            {rows.length} total
          </Badge>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search recipients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs bg-background"
          />
        </div>
      </div>

      {/* Recipient Table */}
      <div className="rounded-xl border border-border/70 overflow-hidden bg-card shadow-2xs">
        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-muted/60 text-muted-foreground border-b border-border/60 font-semibold sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="px-3.5 py-2.5 w-12 text-center text-muted-foreground/70">#</th>
                {data.csvHeaders?.map((h: string) => (
                  <th key={h} className="px-3.5 py-2.5 whitespace-nowrap">
                    <span className={h === emailCol ? "text-primary font-bold flex items-center gap-1" : ""}>
                      {h === emailCol && <Mail className="size-3" />}
                      {h}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.length > 0 ? (
                filtered.map((row: Record<string, string>, i: number) => (
                  <tr key={i} className="hover:bg-muted/40 transition-colors duration-150">
                    <td className="px-3.5 py-2 text-center text-muted-foreground/70 font-mono text-[11px] tabular-nums">
                      {i + 1}
                    </td>
                    {data.csvHeaders?.map((h: string) => (
                      <td key={h} className="px-3.5 py-2 text-foreground truncate max-w-[200px]">
                        {h === emailCol ? (
                          <span className="font-medium text-foreground">{row[h] || "-"}</span>
                        ) : (
                          row[h] || "-"
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={(data.csvHeaders?.length || 0) + 1} className="py-12 text-center text-muted-foreground">
                    No matching contacts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} contacts
      </p>
    </div>
  );
}
