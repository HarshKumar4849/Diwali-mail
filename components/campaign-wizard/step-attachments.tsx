"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { WizardData } from "@/types";

export function StepAttachments({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [uploading, setUploading] = useState(false);
  const [globalFiles, setGlobalFiles] = useState<{ name: string; path: string }[]>(data.globalAttachments || []);

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, base64 }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Upload failed");
      if (!result.path) throw new Error("Upload response missing path");
      const newFiles = [...globalFiles, { name: result.originalName, path: result.path }];
      setGlobalFiles(newFiles);
      updateData({ globalAttachments: newFiles });
    } catch (err) {
      console.error("Upload failed:", err);
      alert(err instanceof Error ? err.message : "Upload failed");
    }
    setUploading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Global Attachments (sent to everyone)</label>
        <Input type="file" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} disabled={uploading} />
        <ul className="mt-2 space-y-1">
          {globalFiles.map((f, i) => (
            <li key={i} className="text-sm text-muted-foreground">{f.name}</li>
          ))}
        </ul>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Per-Recipient Attachment Column</label>
        <select className="w-full p-2 border rounded" value={data.attachmentColumn || ""} onChange={e => updateData({ attachmentColumn: e.target.value })}>
          <option value="">None</option>
          {data.csvHeaders?.map((h: string) => <option key={h} value={h}>{h}</option>)}
        </select>
        <p className="text-xs text-muted-foreground mt-1">If a CSV column contains URLs or file paths to attach per recipient</p>
      </div>
    </div>
  );
}
