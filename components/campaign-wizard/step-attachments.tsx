"use client";

import { useState, useRef } from "react";
import type { WizardData } from "@/types";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import {
  Paperclip,
  UploadCloud,
  File,
  X,
  Layers,
  AlertCircle,
} from "lucide-react";

export function StepAttachments({
  data,
  updateData,
}: {
  data: WizardData;
  updateData: (d: Partial<WizardData>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const globalFiles = data.globalAttachments || [];

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadError("");
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to get upload URL");

      const uploadRes = await fetch(result.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error("Upload to storage failed");

      const newFiles = [...globalFiles, { name: result.originalName, path: result.path }];
      updateData({ globalAttachments: newFiles });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (index: number) => {
    const updated = globalFiles.filter((_, i) => i !== index);
    updateData({ globalAttachments: updated });
  };

  return (
    <div className="space-y-8">
      {/* Global Attachments Card */}
      <div className="rounded-xl border border-border/70 bg-card p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Paperclip className="size-4 text-primary" />
              <h3 className="font-semibold text-base text-foreground">Global Attachments</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              These files will be attached to every single email sent in this campaign.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gap-1.5 text-xs h-8 shrink-0"
          >
            <UploadCloud className="size-3.5" />
            <span>{uploading ? "Uploading..." : "Upload File"}</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
            disabled={uploading}
          />
        </div>

        {uploadError && (
          <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Uploaded File List */}
        {globalFiles.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 pt-2">
            {globalFiles.map((file, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/70 bg-background shadow-2xs hover:border-primary/40 hover:shadow-xs transition-all duration-150 group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <File className="size-4" />
                  </div>
                  <span className="text-xs font-medium text-foreground truncate">{file.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all duration-150 cursor-pointer"
                  title="Remove attachment"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 border border-dashed border-border/60 rounded-lg bg-muted/10">
            <p className="text-xs text-muted-foreground">No global files attached yet</p>
          </div>
        )}
      </div>

      {/* Per-Recipient Attachment Column Card */}
      <ScrollReveal variant="section">
        <div className="rounded-xl border border-border/70 bg-card p-5 md:p-6 shadow-xs space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              <h3 className="font-semibold text-base text-foreground">Per-Recipient Attachments</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Attach individualized documents (e.g. customized invoices, certificates) using URLs or file paths defined in your spreadsheet.
            </p>
          </div>

          <div className="max-w-sm space-y-2 pt-2">
            <label className="block text-xs font-semibold text-foreground">
              Attachment Column
            </label>
            <select
              className="w-full h-10 px-3 rounded-lg border border-input/90 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all duration-150"
              value={data.attachmentColumn || ""}
              onChange={(e) => updateData({ attachmentColumn: e.target.value })}
            >
              <option value="">None (No individual attachments)</option>
              {data.csvHeaders
                ?.filter((h: string) => h !== data.emailColumn)
                .map((h: string) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The values in this column must contain valid public HTTP/HTTPS URLs or uploaded storage paths.
            </p>
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}
