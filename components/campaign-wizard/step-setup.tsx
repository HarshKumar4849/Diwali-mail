"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { parseCSV, parseExcel } from "@/lib/utils";
import type { WizardData } from "@/types";

const isExcel = (name: string) => /\.xlsx?$/i.test(name);

export function StepSetup({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = isExcel(file.name)
      ? await parseExcel(file)
      : parseCSV(await file.text());
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
        <label className="block text-sm font-medium mb-1">Upload CSV or Excel</label>
        <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} />
      </div>
      {csvPreview.length > 0 && (
        <div>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Email Column</label>
            <select className="w-full p-2 border rounded" value={data.emailColumn || ""} onChange={e => updateData({ emailColumn: e.target.value })}>
              <option value="">Select a column...</option>
              {data.csvHeaders?.map((h: string) => <option key={h} value={h}>{h}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Which column contains the recipient email addresses?</p>
          </div>
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
