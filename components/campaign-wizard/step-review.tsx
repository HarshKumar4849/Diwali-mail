"use client";

export function StepReview({ data }: { data: any; updateData: (d: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="border rounded p-4">
        <h3 className="font-semibold text-lg">{data.name}</h3>
        <p className="text-sm mt-2"><strong>Subject:</strong> {data.subject_template}</p>
        <p className="text-sm mt-1"><strong>Recipients:</strong> {data.csvRows?.length || 0}</p>
        <p className="text-sm"><strong>BCC:</strong> {data.global_bcc || "None"}</p>
        <p className="text-sm"><strong>CC:</strong> {data.global_cc || "None"}</p>
        <p className="text-sm"><strong>Rate Limit:</strong> {data.rate_limit || 10} emails/min</p>
        <p className="text-sm"><strong>Global Attachments:</strong> {data.globalAttachments?.length || 0} files</p>
        <p className="text-sm"><strong>Per-Recipient Attachment Column:</strong> {data.attachmentColumn || "None"}</p>
      </div>
      <div className="border rounded p-4">
        <h4 className="font-medium mb-2">Email Preview (first recipient)</h4>
        {data.csvRows?.[0] && (
          <div>
            <p><strong>To:</strong> {data.csvRows[0].email}</p>
            <p><strong>Body:</strong></p>
            <div className="bg-muted p-3 rounded mt-1 text-sm whitespace-pre-wrap">
              {data.body_template}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
