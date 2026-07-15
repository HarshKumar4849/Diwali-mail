"use client";

import { useState, useRef } from "react";
import { renderTemplate } from "@/lib/email/template";
import type { WizardData } from "@/types";
import { PlaceholderAutocomplete } from "@/components/placeholder-autocomplete";
import { docxToHtml } from "@/lib/docx-to-html";
import { ErrorBoundary } from "@/components/error-boundary";

function highlightPlaceholders(text: string): string {
  return text.replace(
    /\{\{(.+?)\}\}/g,
    '<span class="bg-primary/20 text-primary rounded px-1 font-medium">{{$1}}</span>'
  );
}

export function StepTemplate({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const [converting, setConverting] = useState(false);
  const docxRef = useRef<HTMLInputElement>(null);
  const sampleData = data.csvHeaders?.reduce((acc: Record<string, string>, h: string) => {
    acc[h] = data.csvRows?.[0]?.[h] || `{{${h}}}`;
    return acc;
  }, {}) || {};
  const columns = data.csvHeaders || [];

  const handleDocx = async (file: File) => {
    setConverting(true);
    try {
      const html = await docxToHtml(file);
      updateData({ body_template: html });
    } catch (err) {
      console.error("Failed to convert .docx:", err);
      alert("Failed to convert the Word document. Make sure it's a valid .docx file.");
    }
    setConverting(false);
  };

  const bodyIsHtml = data.body_template?.trim().startsWith("<");

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
        <div className="flex flex-wrap gap-1 mb-3">
          {columns.map((h: string) => (
            <code
              key={h}
              className="px-2 py-1 bg-muted rounded text-xs cursor-pointer hover:bg-muted/80 transition-colors"
              onClick={() => {
                const current = data.body_template || "";
                const insert = `{{${h}}}`;
                updateData({ body_template: bodyIsHtml ? current + insert : current + insert });
              }}
            >
              {'{{' + h + '}}'}
            </code>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground">Import from Word:</label>
          <input
            ref={docxRef}
            type="file"
            accept=".docx"
            className="text-xs"
            onChange={e => e.target.files?.[0] && handleDocx(e.target.files[0])}
            disabled={converting}
          />
          {converting && <span className="text-xs text-muted-foreground">Converting...</span>}
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

      {bodyIsHtml && (
        <p className="text-xs text-muted-foreground">
          Body contains HTML from a Word document. You can edit the HTML directly above.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button className="text-sm underline text-muted-foreground hover:text-foreground" onClick={() => setShowPreview(!showPreview)}>
          {showPreview ? "Hide" : "Show"} Preview
        </button>
      </div>

      {showPreview && data.csvRows?.[0] && (
        <ErrorBoundary>
          <div className="border rounded p-4 bg-muted/30 space-y-4 overflow-x-auto max-w-full">
            <div className="min-w-0">
              <span className="text-xs text-muted-foreground font-medium">Template (with placeholders):</span>
              <p className="font-semibold mt-0.5 break-words" dangerouslySetInnerHTML={{ __html: highlightPlaceholders(data.subject_template || "") }} />
              <div className="mt-0.5 whitespace-pre-wrap text-sm break-words overflow-x-auto [&_p]:my-1 [&_p:empty]:hidden" dangerouslySetInnerHTML={{ __html: highlightPlaceholders(bodyIsHtml ? data.body_template : data.body_template?.replace(/\n/g, "<br>") || "") }} />
            </div>
            <hr className="border-muted" />
            <div className="min-w-0">
              <span className="text-xs text-muted-foreground font-medium">Rendered Preview (using first row):</span>
              <p className="text-xs text-muted-foreground mt-1">Showing data for: {Object.values(sampleData).filter(v => !String(v).startsWith('{{')).join(', ') || '(no data)'}</p>
              <p className="font-semibold mt-1 break-words">{renderTemplate(data.subject_template || "", sampleData)}</p>
              <div className="mt-0.5 text-sm overflow-x-auto break-words whitespace-pre-wrap [&_p]:my-1 [&_p:empty]:hidden" dangerouslySetInnerHTML={{ __html: renderTemplate(data.body_template || "", sampleData) }} />
            </div>
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
}
