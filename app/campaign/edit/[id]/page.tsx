"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Wizard } from "@/components/campaign-wizard/wizard";
import { StepSetup } from "@/components/campaign-wizard/step-setup";
import { StepTemplate } from "@/components/campaign-wizard/step-template";
import { StepAttachments } from "@/components/campaign-wizard/step-attachments";
import { StepRecipients } from "@/components/campaign-wizard/step-recipients";
import { StepSendConfig } from "@/components/campaign-wizard/step-send-config";
import { StepReview } from "@/components/campaign-wizard/step-review";
import type { Campaign, WizardData } from "@/types";

export default function EditCampaign() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then(r => {
        if (!r.ok) throw new Error("Failed to load campaign");
        return r.json();
      })
      .then((campaign: Campaign) => {
        sessionStorage.setItem("mailcraft-wizard-data", JSON.stringify({
          name: campaign.name,
          subject_template: campaign.subject_template,
          body_template: campaign.body_template,
          global_bcc: campaign.global_bcc || "",
          global_cc: campaign.global_cc || "",
          rate_limit: campaign.rate_limit || 20,
          csvHeaders: [],
          csvRows: [],
          csvFileName: "",
          globalAttachments: [],
          attachmentColumn: "",
          emailColumn: "",
        }));
        setReady(true);
      })
      .catch(e => {
        setError(e.message);
        router.push("/");
      });
  }, [id, router]);

  const handleComplete = async (data: WizardData) => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
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
      if (!res.ok) throw new Error("Failed to update campaign");

      sessionStorage.removeItem("mailcraft-wizard-data");
      router.push(`/campaign/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  if (!ready) {
    return <div className="p-8 text-center text-muted-foreground">Loading campaign...</div>;
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold text-center mb-6">Edit Campaign</h1>
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
