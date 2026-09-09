import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import type { SupabaseClient } from "@supabase/supabase-js";

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global active campaign processors registry.
// Tracks which campaigns currently have an active background worker running.
const activeProcessors = new Set<string>();

// Global Microsoft Graph request pacer.
// Ensures calls to Microsoft Graph across all concurrent campaigns maintain safe spacing
// to prevent rate-limit request storms on the user's mailbox.
let lastGraphCallTimestamp = 0;
const MIN_GRAPH_REQUEST_INTERVAL_MS = 250;

async function paceGraphRequest(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastGraphCallTimestamp;
  if (elapsed < MIN_GRAPH_REQUEST_INTERVAL_MS) {
    await delay(MIN_GRAPH_REQUEST_INTERVAL_MS - elapsed);
  }
  lastGraphCallTimestamp = Date.now();
}

/**
 * Checks if a campaign processor is currently running.
 */
export function isCampaignRunning(campaignId: string): boolean {
  return activeProcessors.has(campaignId);
}

/**
 * Returns an array of all currently running campaign IDs.
 */
export function getActiveCampaignIds(): string[] {
  return Array.from(activeProcessors);
}

/**
 * Starts an independent campaign processor for a specific campaign.
 * Idempotent: If a processor is already running for this campaign, it does not start a duplicate.
 * Multiple campaigns (Campaign A, Campaign B, Campaign C) run completely concurrently and independently.
 */
export async function startCampaignProcessor(
  campaignId: string,
  existingSupabase?: SupabaseClient
): Promise<{ started: boolean; message: string }> {
  if (activeProcessors.has(campaignId)) {
    return { started: false, message: `Processor for campaign ${campaignId} is already running` };
  }

  // Mark campaign as actively running
  activeProcessors.add(campaignId);
  console.log(`[processor] Started independent processor for campaign ${campaignId}. Active campaigns: ${activeProcessors.size}`);

  // Run asynchronously in the background so the caller returns immediately
  (async () => {
    try {
      await runCampaignLoop(campaignId, existingSupabase);
    } catch (err) {
      console.error(`[processor] Fatal error in campaign ${campaignId}:`, err);
    } finally {
      activeProcessors.delete(campaignId);
      console.log(`[processor] Processor finished for campaign ${campaignId}. Active campaigns remaining: ${activeProcessors.size}`);
    }
  })();

  return { started: true, message: `Processor started for campaign ${campaignId}` };
}

/**
 * Core loop for an individual campaign. Runs independently of any other campaign.
 */
async function runCampaignLoop(campaignId: string, client?: SupabaseClient): Promise<void> {
  let supabase: SupabaseClient;
  if (client) {
    supabase = client;
  } else {
    try {
      supabase = await createClient();
    } catch {
      supabase = createAdminClient();
    }
  }

  // Fetch campaign details
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campErr || !campaign) {
    console.error(`[processor] Campaign ${campaignId} not found:`, campErr?.message);
    return;
  }

  if (campaign.status === "done") {
    console.log(`[processor] Campaign ${campaignId} is already done`);
    return;
  }

  // Ensure campaign status is "sending"
  if (campaign.status !== "sending") {
    await supabase.from("campaigns").update({ status: "sending" }).eq("id", campaignId);
  }

  // Fetch global attachments
  const { data: globalAttachments } = await supabase
    .from("attachments")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("type", "global");

  const rateLimit = campaign.rate_limit && campaign.rate_limit > 0 ? campaign.rate_limit : 20;
  const delayMs = Math.max(250, Math.floor(60000 / rateLimit));
  const batchSize = 10;

  console.log(`[processor] Campaign ${campaignId}: starting loop (rateLimit=${rateLimit}/min, delayMs=${delayMs}ms)`);

  let consecutiveEmptyBatches = 0;

  while (true) {
    // 1. Fetch next batch of pending recipients
    const { data: pending, error: pendErr } = await supabase
      .from("recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .limit(batchSize);

    if (pendErr) {
      console.error(`[processor] Campaign ${campaignId}: error fetching pending:`, pendErr.message);
      break;
    }

    // 2. If no pending recipients, check if any need reclaiming or if campaign is finished
    if (!pending || pending.length === 0) {
      consecutiveEmptyBatches++;

      // Check if any recipients are still in "sending" (e.g. from an aborted previous worker)
      const { count: stuckCount } = await supabase
        .from("recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "sending");

      // If we see stuck recipients after multiple checks and no pending left, safely reclaim them
      if (stuckCount && stuckCount > 0 && consecutiveEmptyBatches >= 2) {
        console.log(`[processor] Campaign ${campaignId}: reclaiming ${stuckCount} stuck 'sending' recipients`);
        await supabase
          .from("recipients")
          .update({ status: "pending" })
          .eq("campaign_id", campaignId)
          .eq("status", "sending");
        consecutiveEmptyBatches = 0;
        continue;
      }

      if (consecutiveEmptyBatches >= 2) {
        // No more pending or sending recipients: determine final status
        const { count: failedCount } = await supabase
          .from("recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaignId)
          .eq("status", "failed");

        const finalStatus = failedCount && failedCount > 0 ? "partial" : "done";
        await supabase.from("campaigns").update({ status: finalStatus }).eq("id", campaignId);
        console.log(`[processor] Campaign ${campaignId} completed with status: ${finalStatus}`);
        break;
      }

      await delay(1000);
      continue;
    }

    consecutiveEmptyBatches = 0;

    // 3. Process each recipient in the batch with atomic claiming
    for (const recipient of pending) {
      // Atomic claim: Only proceed if status is still 'pending'
      const { data: claimed, error: claimErr } = await supabase
        .from("recipients")
        .update({ status: "sending" })
        .eq("id", recipient.id)
        .eq("status", "pending")
        .select()
        .single();

      // If already claimed by another operation or error, skip to next
      if (claimErr || !claimed) {
        continue;
      }

      // Respect global Graph pacer to avoid API request storms across concurrent campaigns
      await paceGraphRequest();

      try {
        await sendEmail({
          campaign,
          recipient,
          globalAttachments: globalAttachments || [],
          supabase,
        });

        await supabase.from("recipients").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: "",
        }).eq("id", recipient.id);

        console.log(`[processor] Campaign ${campaignId}: sent to ${recipient.email}`);
      } catch (err: unknown) {
        const retryCount = (recipient.retry_count || 0) + 1;
        const newStatus = retryCount >= 3 ? "failed" : "pending";
        const errorMsg = err instanceof Error ? err.message : "Unknown error";

        await supabase.from("recipients").update({
          status: newStatus,
          error_message: errorMsg,
          retry_count: retryCount,
        }).eq("id", recipient.id);

        if (newStatus === "failed") {
          console.error(`[processor] Campaign ${campaignId}: failed for ${recipient.email} (retry ${retryCount}/3): ${errorMsg}`);
        }
      }

      // Campaign-specific rate limit delay
      await delay(delayMs);
    }
  }
}
