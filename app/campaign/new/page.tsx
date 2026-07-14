"use client";

import { Wizard } from "@/components/campaign-wizard/wizard";
import { StepSetup } from "@/components/campaign-wizard/step-setup";
import { StepTemplate } from "@/components/campaign-wizard/step-template";
import { StepAttachments } from "@/components/campaign-wizard/step-attachments";
import { StepRecipients } from "@/components/campaign-wizard/step-recipients";
import { StepSendConfig } from "@/components/campaign-wizard/step-send-config";
import { StepReview } from "@/components/campaign-wizard/step-review";
import { useRouter } from "next/navigation";

export default function NewCampaign() {
  const router = useRouter();

  const handleComplete = async (data: any) => {
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
    const campaign = await campRes.json();

    // Import recipients (set per-recipient attachment_path from CSV column if configured)
    const attachmentCol = data.attachmentColumn;
    const recipients = data.csvRows.map((row: any) => ({
      email: row.email,
      data: row,
      attachment_path: attachmentCol ? (row[attachmentCol] || "") : "",
    }));
    await fetch(`/api/campaigns/${campaign.id}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients }),
    });

    // Save global attachments
    if (data.globalAttachments?.length > 0) {
      await fetch(`/api/campaigns/${campaign.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachments: data.globalAttachments.map((att: any) => ({
            file_path: att.path,
            original_name: att.name,
            type: "global",
          })),
        }),
      });
    }

    sessionStorage.removeItem("mailcraft-wizard-data");
    router.push(`/campaign/${campaign.id}`);
  };

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold text-center mb-6">New Campaign</h1>
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
      />
    </div>
  );
}
