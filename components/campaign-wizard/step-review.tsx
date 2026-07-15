"use client";

import { useEffect, useState } from "react";
import type { WizardData } from "@/types";

export function StepReview({ data }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetch("/api/auth/microsoft/status")
      .then(r => r.json())
      .then(d => {
        setConnected(d.connected);
        setEmail(d.email || "");
      })
      .catch(() => setConnected(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="border rounded p-4">
        <h3 className="font-semibold text-lg">{data.name}</h3>
        <p className="text-sm mt-2"><strong>Subject:</strong> {data.subject_template}</p>
        <p className="text-sm mt-1"><strong>Recipients:</strong> {data.csvRows?.length || 0}</p>
        <p className="text-sm"><strong>BCC:</strong> {data.global_bcc || "None"}</p>
        <p className="text-sm"><strong>CC:</strong> {data.global_cc || "None"}</p>
        <p className="text-sm"><strong>Rate Limit:</strong> {data.rate_limit || 20} emails/min</p>
        <p className="text-sm"><strong>Global Attachments:</strong> {data.globalAttachments?.length || 0} files</p>
        <p className="text-sm"><strong>Per-Recipient Attachment Column:</strong> {data.attachmentColumn || "None"}</p>
      </div>

      <div className="border rounded p-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Microsoft Outlook</h4>
          {connected === null ? (
            <span className="text-xs text-muted-foreground">Checking...</span>
          ) : connected ? (
            <span className="text-xs text-green-600">Connected as {email}</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Not connected —{" "}
              <a href="/settings" className="text-primary underline hover:text-primary/80">
                connect via Settings
              </a>
            </span>
          )}
        </div>
      </div>

      <div className="border rounded p-4">
        <h4 className="font-medium mb-2">Email Preview (first recipient)</h4>
        {data.csvRows?.[0] && data.emailColumn && (
          <div>
            <p><strong>To:</strong> {data.csvRows[0][data.emailColumn]}</p>
            <p><strong>Subject:</strong> {data.subject_template.replace(/\{\{(.+?)\}\}/g, (_, k) => data.csvRows[0][k.trim()] || `{{${k.trim()}}}`)}</p>
            <p><strong>Body:</strong></p>
            <div className="bg-muted p-3 rounded mt-1 text-sm overflow-x-auto break-words" dangerouslySetInnerHTML={{
              __html: data.body_template.replace(/\{\{(.+?)\}\}/g, (_, k) => data.csvRows[0][k.trim()] || `{{${k.trim()}}}`)
            }} />
          </div>
        )}
      </div>
    </div>
  );
}
