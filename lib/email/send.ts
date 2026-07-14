import { createGraphClient } from "@/lib/graph/client";
import { renderTemplate } from "@/lib/email/template";
import { createClient } from "@/lib/supabase/server";
import type { Recipient, Campaign, Attachment } from "@/types";

async function downloadAttachment(path: string, name: string): Promise<{ name: string; contentBytes: string; contentType: string }> {
  const supabase = await createClient();
  const isUrl = path.startsWith("http://") || path.startsWith("https://");

  let buffer: ArrayBuffer;
  if (isUrl) {
    const res = await fetch(path);
    buffer = await res.arrayBuffer();
  } else {
    const { data, error } = await supabase.storage.from("attachments").download(path);
    if (error || !data) throw new Error(`Failed to download attachment: ${error?.message}`);
    buffer = await data.arrayBuffer();
  }

  return {
    name,
    contentBytes: Buffer.from(buffer).toString("base64"),
    contentType: "application/octet-stream",
  };
}

interface SendEmailParams {
  campaign: Campaign;
  recipient: Recipient;
  globalAttachments: Attachment[];
}

export async function sendEmail({ campaign, recipient, globalAttachments }: SendEmailParams) {
  const graphClient = await createGraphClient(campaign.user_id);

  const subject = renderTemplate(campaign.subject_template, recipient.data);
  const body = renderTemplate(campaign.body_template, recipient.data);

  const message: any = {
    subject,
    body: { contentType: "HTML", content: body.replace(/\n/g, "<br>") },
    toRecipients: [{ emailAddress: { address: recipient.email } }],
  };

  if (campaign.global_cc) {
    message.ccRecipients = campaign.global_cc.split(",").map(e => ({
      emailAddress: { address: e.trim() },
    }));
  }

  if (campaign.global_bcc) {
    message.bccRecipients = campaign.global_bcc.split(",").map(e => ({
      emailAddress: { address: e.trim() },
    }));
  }

  const attachmentPromises: Promise<{ name: string; contentBytes: string; contentType: string }>[] = [];
  for (const a of globalAttachments) {
    attachmentPromises.push(downloadAttachment(a.file_path, a.original_name));
  }
  if (recipient.attachment_path) {
    attachmentPromises.push(downloadAttachment(recipient.attachment_path, "attachment"));
  }

  if (attachmentPromises.length > 0) {
    message.attachments = await Promise.all(attachmentPromises.map(async (p) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      ...await p,
    })));
  }

  await graphClient.api("/me/sendMail").post({ message, saveToSentItems: true });
}
