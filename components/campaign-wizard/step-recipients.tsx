"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { WizardData } from "@/types";

export function StepRecipients({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [search, setSearch] = useState("");
  const filtered = (data.csvRows || []).filter((r: Record<string, string>) =>
    r.email?.toLowerCase().includes(search.toLowerCase()) ||
    Object.values(r).some(v => v?.toString().toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {data.csvRows?.length || 0} recipients loaded. Review below.
      </p>
      <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
      <div className="max-h-96 overflow-y-auto border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              {data.csvHeaders?.map((h: string) => <th key={h} className="p-2 text-left">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row: Record<string, string>, i: number) => (
              <tr key={i} className="border-t">
                {data.csvHeaders?.map((h: string) => <td key={h} className="p-2">{row[h]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
