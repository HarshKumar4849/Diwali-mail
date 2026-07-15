import { createGraphClient } from "@/lib/graph/client";
import { renderTemplate } from "@/lib/email/template";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Recipient, Campaign, Attachment } from "@/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function downloadAttachment(path: string, name: string, supabase?: SupabaseClient): Promise<{ name: string; contentBytes: string; contentType: string }> {
  const db = supabase || await createClient();
  const isUrl = path.startsWith("http://") || path.startsWith("https://");

  let buffer: ArrayBuffer;
  if (isUrl) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to download attachment: HTTP ${res.status}`);
    buffer = await res.arrayBuffer();
  } else {
    const { data, error } = await db.storage.from("attachments").download(path);
    if (error || !data) throw new Error(`Failed to download attachment: ${error?.message}`);
    buffer = await data.arrayBuffer();
  }

  console.log(`[downloadAttachment] Downloaded ${name} (${buffer.byteLength} bytes) from ${isUrl ? "URL" : "storage"}`);

  const ext = name.split(".").pop()?.toLowerCase() || "";
  const contentType: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    txt: "text/plain",
  };

  return {
    name,
    contentBytes: Buffer.from(buffer).toString("base64"),
    contentType: contentType[ext] || "application/octet-stream",
  };
}

interface SendEmailParams {
  campaign: Campaign;
  recipient: Recipient;
  globalAttachments: Attachment[];
  supabase?: SupabaseClient;
}

export async function sendEmail({ campaign, recipient, globalAttachments, supabase }: SendEmailParams) {
  const graphClient = await createGraphClient(campaign.user_id, supabase);

  const subject = renderTemplate(campaign.subject_template, recipient.data);
  const body = renderTemplate(campaign.body_template, recipient.data);

  const message: Record<string, unknown> = {
    subject,
    body: { contentType: "HTML", content: body.replace(/\n/g, "<br>") },
    toRecipients: [{ emailAddress: { address: recipient.email } }],
  };

  if (campaign.global_cc) {
    const ccList = campaign.global_cc.split(",").map(e => e.trim()).filter(e => EMAIL_RE.test(e));
    if (ccList.length > 0) {
      message.ccRecipients = ccList.map(e => ({
        emailAddress: { address: e },
      }));
    }
  }

  if (campaign.global_bcc) {
    const bccList = campaign.global_bcc.split(",").map(e => e.trim()).filter(e => EMAIL_RE.test(e));
    if (bccList.length > 0) {
      message.bccRecipients = bccList.map(e => ({
        emailAddress: { address: e },
      }));
    }
  }

  const attachmentPromises: Promise<{ name: string; contentBytes: string; contentType: string }>[] = [];
  for (const a of globalAttachments) {
    attachmentPromises.push(downloadAttachment(a.file_path, a.original_name, supabase));
  }
  if (recipient.attachment_path) {
    const originalName = recipient.attachment_path.split("/").pop() || "attachment";
    attachmentPromises.push(downloadAttachment(recipient.attachment_path, originalName, supabase));
  }

  if (attachmentPromises.length > 0) {
    const attachmentResults = await Promise.all(attachmentPromises);
    const attachments = attachmentResults.map(a => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      ...a,
    }));
    message.attachments = attachments;
    console.log(`[sendEmail] Attached ${attachments.length} file(s) to email for ${recipient.email}`);
  } else {
    console.log(`[sendEmail] No attachments to attach for ${recipient.email}`);
  }

  console.log(`[sendEmail] Sending email to ${recipient.email}`);
  await graphClient.api("/me/sendMail").post({ message, saveToSentItems: true });
}
