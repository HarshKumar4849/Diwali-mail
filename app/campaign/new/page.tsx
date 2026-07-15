"use client";

import { useState } from "react";
import { Wizard } from "@/components/campaign-wizard/wizard";
import { StepSetup } from "@/components/campaign-wizard/step-setup";
import { StepTemplate } from "@/components/campaign-wizard/step-template";
import { StepAttachments } from "@/components/campaign-wizard/step-attachments";
import { StepRecipients } from "@/components/campaign-wizard/step-recipients";
import { StepSendConfig } from "@/components/campaign-wizard/step-send-config";
import { StepReview } from "@/components/campaign-wizard/step-review";
import { useRouter } from "next/navigation";
import type { WizardData } from "@/types";

export default function NewCampaign() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleComplete = async (data: WizardData) => {
    setLoading(true);
    setError("");

    try {
      const campRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          subject_template: data.subject_template,
          body_template: data.body_template,
          global_bcc: data.global_bcc,
          global_cc: data.global_cc,
          rate_limit: data.rate_limit,
        }),
      });
      if (!campRes.ok) throw new Error("Failed to create campaign");
      const campaign = await campRes.json();

      const attachmentCol = data.attachmentColumn;
      const recipients = data.csvRows.map((row: Record<string, string>) => ({
        email: row.email,
        data: row,
        attachment_path: attachmentCol ? (row[attachmentCol] || "") : "",
      }));
      const recRes = await fetch(`/api/campaigns/${campaign.id}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      if (!recRes.ok) throw new Error("Failed to save recipients");

      if (data.globalAttachments?.length > 0) {
        const attRes = await fetch(`/api/campaigns/${campaign.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attachments: data.globalAttachments.map((att: { path: string; name: string }) => ({
              file_path: att.path,
              original_name: att.name,
              type: "global",
            })),
          }),
        });
        if (!attRes.ok) throw new Error("Failed to save attachments");
      }

      const sendRes = await fetch(`/api/campaigns/${campaign.id}/send`, { method: "POST" });
      if (!sendRes.ok) throw new Error("Failed to start sending");

      sessionStorage.removeItem("mailcraft-wizard-data");
      router.push(`/campaign/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold text-center mb-6">New Campaign</h1>
      {error && (
        <div className="max-w-3xl mx-auto mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded">
          {error}
        </div>
      )}
      <Wizard
        steps={[
          { title: "Setup", render: (props) => <StepSetup {...props} /> },
          { title: "Template", render: (props) => <StepTemplate {...props} /> },
          { title: "Attachments", render: (props) => <StepAttachments {...props} /> },
          { title: "Recipients", render: (props) => <StepRecipients {...props} /> },
          { title: "Send Config", render: (props) => <StepSendConfig {...props} /> },
          { title: "Review", render: (props) => <StepReview {...props} /> },
        ]}
        onComplete={handleComplete}
        loading={loading}
      />
    </div>
  );
}
