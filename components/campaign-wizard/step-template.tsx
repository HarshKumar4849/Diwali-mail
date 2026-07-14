"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { renderTemplate } from "@/lib/email/template";
import type { WizardData } from "@/types";

export function StepTemplate({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const sampleData = data.csvHeaders?.reduce((acc: Record<string, string>, h: string) => {
    acc[h] = data.csvRows?.[0]?.[h] || `{{${h}}}`;
    return acc;
  }, {}) || {};

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Subject Line</label>
        <Input value={data.subject_template || ""} onChange={e => updateData({ subject_template: e.target.value })} placeholder="Hello {{first_name}}, welcome!" />
        <p className="text-xs text-muted-foreground mt-1">Use {'{{column_name}}'} placeholders from CSV</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Available Columns</label>
        <div className="flex flex-wrap gap-1">
          {data.csvHeaders?.map((h: string) => (
            <code key={h} className="px-2 py-1 bg-muted rounded text-xs cursor-pointer" onClick={() => {
              const ta = document.getElementById("body-template") as HTMLTextAreaElement;
              if (ta) {
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const text = ta.value;
                const newText = text.slice(0, start) + `{{${h}}}` + text.slice(end);
                updateData({ body_template: newText });
                setTimeout(() => ta.focus(), 0);
              }
            }}>
              {'{{' + h + '}}'}
            </code>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Email Body</label>
        <Textarea id="body-template" value={data.body_template || ""} onChange={e => updateData({ body_template: e.target.value })} rows={10} placeholder="Hi {{first_name}},&#10;&#10;We have a special offer for you..." />
      </div>
      <div className="flex items-center gap-2">
        <button className="text-sm underline" onClick={() => setShowPreview(!showPreview)}>
          {showPreview ? "Hide" : "Show"} Preview
        </button>
      </div>
      {showPreview && (
        <div className="border rounded p-4 bg-muted/30">
          <p className="font-semibold">{renderTemplate(data.subject_template || "", sampleData)}</p>
          <div className="mt-2 whitespace-pre-wrap">{renderTemplate(data.body_template || "", sampleData)}</div>
        </div>
      )}
    </div>
  );
}
