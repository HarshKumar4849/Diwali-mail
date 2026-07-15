"use client";

import { useState, useRef } from "react";
import { renderTemplate } from "@/lib/email/template";
import type { WizardData } from "@/types";
import { PlaceholderAutocomplete } from "@/components/placeholder-autocomplete";

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
      const mammoth = await import("mammoth");

      let fmtCounter = 0;
      const fmtStyles: Record<string, string> = {};

      interface MammothParagraph {
        type: string;
        children: MammothParagraph[];
        styleId: string | null;
        styleName: string | null;
        numbering: unknown;
        alignment: string | null;
        indent: {
          start: string | null;
          end: string | null;
          firstLine: string | null;
          hanging: string | null;
        };
      }

      const transformParagraph = (element: MammothParagraph) => {
        const styles: string[] = [];

        if (element.alignment && element.alignment !== "left") {
          styles.push(`text-align: ${element.alignment}`);
        }

        if (element.indent) {
          if (element.indent.start) {
            styles.push(`margin-left: ${element.indent.start}pt`);
          }
          if (element.indent.firstLine) {
            styles.push(`text-indent: ${element.indent.firstLine}pt`);
          }
          if (element.indent.hanging) {
            styles.push(`text-indent: -${element.indent.hanging}pt`);
          }
        }

        if (styles.length > 0) {
          const key = styles.join("; ");
          if (!fmtStyles[key]) {
            fmtCounter++;
            fmtStyles[key] = `fmt-${fmtCounter}`;
          }
          return { ...element, styleName: fmtStyles[key] };
        }
        return element;
      };

      const buffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml(
        { arrayBuffer: buffer },
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          transformDocument: (mammoth as any).transforms.paragraph(transformParagraph),
          ignoreEmptyParagraphs: false,
        }
      );

      const parser = new DOMParser();
      const doc = parser.parseFromString(result.value, "text/html");
      const reverseMap: Record<string, string> = {};
      for (const [style, cls] of Object.entries(fmtStyles)) {
        reverseMap[cls] = style;
      }

      doc.querySelectorAll("[class]").forEach((el) => {
        const classes = el.getAttribute("class")?.split(" ") || [];
        const fmtClass = classes.find((c) => c.startsWith("fmt-"));
        if (fmtClass && reverseMap[fmtClass]) {
          el.removeAttribute("class");
          el.setAttribute("style", reverseMap[fmtClass]);
        }
      });

      updateData({ body_template: doc.body.innerHTML });
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
        <div className="border rounded p-4 bg-muted/30 space-y-4">
          <div>
            <span className="text-xs text-muted-foreground font-medium">Template (with placeholders):</span>
            <p className="font-semibold mt-0.5" dangerouslySetInnerHTML={{ __html: highlightPlaceholders(data.subject_template || "") }} />
            <div className="mt-0.5 whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: highlightPlaceholders(bodyIsHtml ? data.body_template : data.body_template?.replace(/\n/g, "<br>") || "") }} />
          </div>
          <hr className="border-muted" />
          <div>
            <span className="text-xs text-muted-foreground font-medium">Rendered Preview (using first row):</span>
            <p className="text-xs text-muted-foreground mt-1">Showing data for: {Object.values(sampleData).filter(v => !v.startsWith('{{')).join(', ') || '(no data)'}</p>
            <p className="font-semibold mt-1">{renderTemplate(data.subject_template || "", sampleData)}</p>
            <div className="mt-0.5 text-sm" dangerouslySetInnerHTML={{ __html: renderTemplate(data.body_template || "", sampleData) }} />
          </div>
        </div>
      )}
    </div>
  );
}
