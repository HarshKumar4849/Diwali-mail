"use client";

import { useState, useRef } from "react";
import { renderTemplate, compileTemplate, isHtml } from "@/lib/email/template";
import type { WizardData } from "@/types";
import { PlaceholderAutocomplete } from "@/components/placeholder-autocomplete";
import { docxToHtml } from "@/lib/docx-to-html";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import {
  Eye,
  EyeOff,
  Sparkles,
  Upload,
  User,
  Mail,
  Tag,
  Code,
  Link as LinkIcon,
} from "lucide-react";

function highlightPlaceholders(text: string): string {
  return text.replace(
    /\{\{(.+?)\}\}/g,
    '<span class="bg-primary/15 text-primary rounded px-1.5 py-0.5 font-mono text-xs font-semibold">{{$1}}</span>'
  );
}

export function StepTemplate({
  data,
  updateData,
}: {
  data: WizardData;
  updateData: (d: Partial<WizardData>) => void;
}) {
  const [showPreview, setShowPreview] = useState(true);
  const [previewMode, setPreviewMode] = useState<"rendered" | "raw">("rendered");
  const [converting, setConverting] = useState(false);
  const docxRef = useRef<HTMLInputElement>(null);

  const sampleData =
    data.csvHeaders?.reduce((acc: Record<string, string>, h: string) => {
      acc[h] = data.csvRows?.[0]?.[h] || `{{${h}}}`;
      return acc;
    }, {}) || {};

  const columns = data.csvHeaders || [];
  const bodyIsHtml = isHtml(data.body_template || "");
  const sampleRecipientEmail = (data.emailColumn && data.csvRows?.[0]?.[data.emailColumn]) || "recipient@example.com";

  const handleDocx = async (file: File) => {
    setConverting(true);
    try {
      const html = await docxToHtml(file);
      updateData({ body_template: html });
    } catch (err) {
      console.error("Failed to convert document:", err);
      alert("Failed to convert the document. Make sure it's a valid .docx or HTML file.");
    } finally {
      setConverting(false);
    }
  };

  const handleInsertTag = (col: string) => {
    const current = data.body_template || "";
    const insert = `{{${col}}}`;
    updateData({ body_template: current + insert });
  };

  const handleInsertLink = () => {
    const url = prompt("Enter the link URL (e.g. https://example.com):", "https://");
    if (!url || url.trim() === "" || url === "https://") return;
    const text = prompt("Enter the display text for this link (leave empty to use URL):", "") || url.trim();
    const linkHtml = `<a href="${url.trim()}">${text.trim()}</a>`;
    const current = data.body_template || "";
    updateData({ body_template: current ? `${current} ${linkHtml}` : linkHtml });
  };

  return (
    <div className="space-y-6">
      {/* Subject Line */}
      <div className="space-y-2">
        <PlaceholderAutocomplete
          label="Subject Line"
          value={data.subject_template || ""}
          onChange={(val) => updateData({ subject_template: val })}
          columns={columns}
          placeholder="e.g. Exclusive Update for {{Company}} — {{Name}}"
          id="subject-template"
        />
        <p className="text-xs text-muted-foreground">
          Type <code className="font-mono text-primary font-semibold">{"{{"}</code> to trigger autocomplete for spreadsheet columns.
        </p>
      </div>

      {/* Merge Tags & Document Import Bar */}
      <div className="p-4 rounded-xl border border-border/70 bg-muted/20 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Tag className="size-4 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Available Merge Tags
            </span>
          </div>

          {/* Quick Actions (Insert Link & Document Import) */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleInsertLink}
              className="gap-1.5 text-xs h-7"
              title="Insert a clickable link"
            >
              <LinkIcon className="size-3 text-primary" />
              <span>Insert Link</span>
            </Button>

            <input
              ref={docxRef}
              type="file"
              accept=".docx,.html,.htm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleDocx(file);
                if (docxRef.current) docxRef.current.value = "";
              }}
              disabled={converting}
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => docxRef.current?.click()}
              disabled={converting}
              className="gap-1.5 text-xs h-7"
            >
              <Upload className="size-3" />
              <span>{converting ? "Importing..." : "Import from .docx / .html"}</span>
            </Button>
          </div>
        </div>

        {columns.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {columns.map((h: string) => (
              <button
                key={h}
                type="button"
                onClick={() => handleInsertTag(h)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono bg-background border border-border/70 hover:border-primary/50 hover:bg-primary/5 text-foreground active:scale-95 transition-all duration-150 cursor-pointer shadow-2xs group"
                title={`Click to insert {{${h}}} into email body`}
              >
                <Sparkles className="size-2.5 text-primary opacity-60 group-hover:opacity-100 transition-opacity" />
                <span>{"{{" + h + "}}"}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Upload a spreadsheet in Step 1 to populate personalized merge tags.
          </p>
        )}
      </div>

      {/* Body Template */}
      <div className="space-y-2">
        <PlaceholderAutocomplete
          label="Email Body"
          value={data.body_template || ""}
          onChange={(val) => updateData({ body_template: val })}
          columns={columns}
          placeholder="Hi {{Name}},&#10;&#10;I am writing to you from..."
          rows={10}
          id="body-template"
          multiline
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {bodyIsHtml ? (
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <Code className="size-3.5" /> HTML formatting active
              </span>
            ) : (
              "Plain text with automatic paragraph spacing"
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            {showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            <span>{showPreview ? "Hide Preview" : "Show Preview"}</span>
          </Button>
        </div>
      </div>

      {/* Realistic Email Client Preview */}
      {showPreview && (
        <ScrollReveal variant="section" className="mt-6">
          <ErrorBoundary>
            <div className="rounded-2xl border border-border/80 overflow-hidden bg-muted/20 shadow-sm">
            {/* Email Client Header Window Bar */}
            <div className="bg-muted/60 px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 hidden sm:flex">
                  <span className="size-2.5 rounded-full bg-border/90" />
                  <span className="size-2.5 rounded-full bg-border/90" />
                  <span className="size-2.5 rounded-full bg-border/90" />
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground tracking-tight">
                    Inbox Preview
                  </span>
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-1 bg-background/80 backdrop-blur-xs border border-border/70 rounded-lg p-0.5 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => setPreviewMode("rendered")}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all duration-150 ${
                    previewMode === "rendered"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Personalized
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("raw")}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all duration-150 ${
                    previewMode === "raw"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Template Markup
                </button>
              </div>
            </div>

            {/* Email Message Container (Canvas) */}
            <div className="p-3 sm:p-5">
              <div className="rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
                {/* Email Envelope Metadata Header */}
                <div className="p-4 sm:p-5 border-b border-border/40 bg-muted/10 space-y-2.5">
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-2xs">
                      <User className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold text-foreground">
                            Connected Outlook Mailbox
                          </p>
                          <span className="text-[11px] text-muted-foreground hidden sm:inline">&lt;sender@organization.com&gt;</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground/80 shrink-0">Today, 10:45 AM</span>
                      </div>

                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-muted-foreground/70">To:</span>
                        <span className="text-foreground font-medium bg-muted/60 px-2 py-0.5 rounded text-[11px]">
                          {sampleRecipientEmail}
                        </span>
                        {data.global_cc && (
                          <>
                            <span className="font-medium text-muted-foreground/70 ml-1">Cc:</span>
                            <span className="text-muted-foreground text-[11px] truncate max-w-xs">{data.global_cc}</span>
                          </>
                        )}
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-foreground mt-3 tracking-tight break-words">
                        {previewMode === "rendered" ? (
                          renderTemplate(data.subject_template || "", sampleData) || (
                            <span className="text-muted-foreground italic font-normal">No subject set</span>
                          )
                        ) : (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: highlightPlaceholders(data.subject_template || "") || "(No subject)",
                            }}
                          />
                        )}
                      </h4>
                    </div>
                  </div>
                </div>

                {/* Email Message Content Canvas */}
                <div className="p-5 sm:p-7 text-foreground text-sm min-h-[180px] overflow-x-auto leading-relaxed">
                  {previewMode === "rendered" ? (
                    data.body_template ? (
                      <div
                        className="prose dark:prose-invert max-w-none break-words text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: compileTemplate(data.body_template || "", sampleData),
                        }}
                      />
                    ) : (
                      <p className="text-muted-foreground italic text-xs">Email body is empty.</p>
                    )
                  ) : data.body_template ? (
                    <div
                      className="whitespace-pre-wrap font-mono text-xs leading-relaxed break-words text-foreground/90"
                      dangerouslySetInnerHTML={{
                        __html: highlightPlaceholders(data.body_template),
                      }}
                    />
                  ) : (
                    <p className="text-muted-foreground italic text-xs">Email body is empty.</p>
                  )}
                </div>
              </div>
            </div>
            </div>
          </ErrorBoundary>
        </ScrollReveal>
      )}
    </div>
  );
}
