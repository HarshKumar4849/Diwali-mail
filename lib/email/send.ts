import { Client } from "@microsoft/microsoft-graph-client";
import {
  createGraphClient,
  isGraph401,
  getValidAccessToken,
  isGraphThrottled,
  extractRetryAfterSeconds,
  setMailboxThrottledUntil,
  getMailboxThrottledUntil,
} from "@/lib/graph/client";
import { renderTemplate, compileTemplate, cleanHtmlWhitespace, autoLinkHtml } from "@/lib/email/template";
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
    const { data, error } = await db.storage.from("mailcraft").download(path);
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
  let body: string;
  if (recipient.data?.__is_html_body === "true" && recipient.data?.body) {
    body = autoLinkHtml(cleanHtmlWhitespace(recipient.data.body));
  } else {
    body = compileTemplate(campaign.body_template, recipient.data);
  }

  // Convert base64 images to hosted URLs (Gmail doesn't render base64 images)
  const db = supabase || await createClient();
  const imgRegex = /<img\s+src="data:image\/([^;]+);base64,([^"]+)"([^>]*)>/g;
  let imgMatch: RegExpExecArray | null;
  const imagesToUpload: Array<{ fullTag: string; ext: string; b64: string; restAttrs: string; filePath: string }> = [];

  while ((imgMatch = imgRegex.exec(body)) !== null) {
    const ext = imgMatch[1];
    imagesToUpload.push({
      fullTag: imgMatch[0],
      ext,
      b64: imgMatch[2],
      restAttrs: imgMatch[3],
      filePath: `email-images/${crypto.randomUUID()}.${ext}`,
    });
  }

  if (imagesToUpload.length > 0) {
    await Promise.all(
      imagesToUpload.map(async (img) => {
        const raw = Buffer.from(img.b64, "base64");
        const { error } = await db.storage.from("mailcraft").upload(img.filePath, raw, {
          contentType: `image/${img.ext}`,
          upsert: false,
        });
        if (error) throw new Error(`Failed to upload image: ${error.message}`);
      })
    );

    for (const img of imagesToUpload) {
      const { data: { publicUrl } } = db.storage.from("mailcraft").getPublicUrl(img.filePath);
      body = body.replace(img.fullTag, `<img src="${publicUrl}"${img.restAttrs}>`);
    }

    console.log(`[sendEmail] Uploaded and linked ${imagesToUpload.length} inline image(s) for ${recipient.email}`);
  }

  const message: Record<string, unknown> = {
    subject,
    body: { contentType: "HTML", content: body },
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

  // Check if mailbox has an active throttling cooldown
  const throttledUntil = getMailboxThrottledUntil(campaign.user_id);
  const cooldownWaitMs = throttledUntil - Date.now();
  if (cooldownWaitMs > 0) {
    console.log(
      `[sendEmail] Mailbox is in throttling cooldown for user ${campaign.user_id}. Waiting ${Math.ceil(cooldownWaitMs / 1000)}s before dispatching to ${recipient.email}...`
    );
    await new Promise((resolve) => setTimeout(resolve, cooldownWaitMs));
  }

  console.log(`[sendEmail] Sending email to ${recipient.email}`);

  const MAX_THROTTLE_RETRIES = 3;
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      await graphClient.api("/me/sendMail").post({ message, saveToSentItems: true });
      break;
    } catch (err: unknown) {
      if (isGraph401(err) && attempt === 1) {
        console.log(`[sendEmail] Graph returned 401 for ${recipient.email}. Refreshing token and retrying once...`);
        const freshToken = await getValidAccessToken(campaign.user_id, supabase, true);
        const retryClient = Client.initWithMiddleware({
          authProvider: {
            getAccessToken: async () => freshToken,
          },
        });
        await retryClient.api("/me/sendMail").post({ message, saveToSentItems: true });
        console.log(`[sendEmail] Retry after token refresh succeeded for ${recipient.email}`);
        break;
      }

      if (isGraphThrottled(err) && attempt <= MAX_THROTTLE_RETRIES) {
        const retryAfterSeconds = extractRetryAfterSeconds(err, attempt * 5);
        const retryAfterMs = retryAfterSeconds * 1000;
        // Mark mailbox cooldown so concurrent sends on this mailbox pause appropriately
        setMailboxThrottledUntil(campaign.user_id, Date.now() + retryAfterMs);

        console.warn(
          `[sendEmail] Microsoft Graph throttling (429/503) for ${recipient.email}. Attempt ${attempt}/${MAX_THROTTLE_RETRIES}. Waiting ${retryAfterSeconds}s (Retry-After)...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
        continue;
      }

      throw err;
    }
  }
}
