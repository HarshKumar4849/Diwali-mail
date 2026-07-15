"use client";

import { useState } from "react";
import { renderTemplate } from "@/lib/email/template";
import type { WizardData } from "@/types";
import { PlaceholderAutocomplete } from "@/components/placeholder-autocomplete";

function highlightPlaceholders(text: string): string {
  return text.replace(
    /\{\{(\w+)\}\}/g,
    '<span class="bg-primary/20 text-primary rounded px-1 font-medium">{{$1}}</span>'
  );
}

export function StepTemplate({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const sampleData = data.csvHeaders?.reduce((acc: Record<string, string>, h: string) => {
    acc[h] = data.csvRows?.[0]?.[h] || `{{${h}}}`;
    return acc;
  }, {}) || {};
  const columns = data.csvHeaders || [];

  return (
    <div className="space-y-4">
      <PlaceholderAutocomplete
        label="Subject Line"
        value={data.subject_template || ""}
        onChange={(val) => updateData({ subject_template: val })}
        columns={columns}
        placeholder="Hello {{first_name}}, welcome!"
        id="subject-template"
      />

      <div>
        <label className="block text-sm font-medium mb-1">Available Columns</label>
        <div className="flex flex-wrap gap-1">
          {columns.map((h: string) => (
            <code
              key={h}
              className="px-2 py-1 bg-muted rounded text-xs cursor-pointer hover:bg-muted/80 transition-colors"
              onClick={() => {
                const current = data.body_template || "";
                updateData({ body_template: current + `{{${h}}}` });
              }}
            >
              {'{{' + h + '}}'}
            </code>
          ))}
        </div>
      </div>

      <PlaceholderAutocomplete
        label="Email Body"
        value={data.body_template || ""}
        onChange={(val) => updateData({ body_template: val })}
        columns={columns}
        placeholder="Hi {{first_name}},&#10;&#10;We have a special offer for you..."
        rows={10}
        id="body-template"
        multiline
      />

      <div className="flex items-center gap-2">
        <button className="text-sm underline text-muted-foreground hover:text-foreground" onClick={() => setShowPreview(!showPreview)}>
          {showPreview ? "Hide" : "Show"} Preview
        </button>
      </div>

      {showPreview && (
        <div className="border rounded p-4 bg-muted/30 space-y-3">
          <div>
            <span className="text-xs text-muted-foreground font-medium">Subject:</span>
            <p className="font-semibold mt-0.5" dangerouslySetInnerHTML={{ __html: highlightPlaceholders(renderTemplate(data.subject_template || "", sampleData)) }} />
          </div>
          <div>
            <span className="text-xs text-muted-foreground font-medium">Body:</span>
            <div className="mt-0.5 whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: highlightPlaceholders(renderTemplate(data.body_template || "", sampleData)) }} />
          </div>
        </div>
      )}
    </div>
  );
}
