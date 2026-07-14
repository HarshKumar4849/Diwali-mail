"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { parseCSV } from "@/lib/utils";
import type { WizardData } from "@/types";

export function StepSetup({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    updateData({ csvHeaders: parsed.headers, csvRows: parsed.rows, csvFileName: file.name });
    setCsvPreview([parsed.headers, ...parsed.rows.slice(0, 3).map(r => parsed.headers.map(h => r[h]))]);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Campaign Name</label>
        <Input value={data.name || ""} onChange={e => updateData({ name: e.target.value })} placeholder="Welcome Campaign Q3" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Upload CSV</label>
        <Input type="file" accept=".csv" onChange={handleFile} />
      </div>
      {csvPreview.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-2">Preview ({data.csvRows?.length} rows):</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {csvPreview[0].map((h, i) => <th key={i} className="border p-1 text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {csvPreview.slice(1).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => <td key={j} className="border p-1">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
