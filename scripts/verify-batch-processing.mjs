// scripts/verify-batch-processing.mjs
// Test script to verify batch processing for campaign sizes:
// 5, 14, 15, 25, 50, and 100 recipients.

import assert from "node:assert";

class MockDatabase {
  constructor() {
    this.campaigns = new Map();
    this.recipients = new Map();
  }

  createCampaign(id, rateLimit = 30) {
    this.campaigns.set(id, {
      id,
      name: `Campaign ${id}`,
      rate_limit: rateLimit,
      status: "draft",
    });
  }

  addRecipients(campaignId, count) {
    for (let i = 1; i <= count; i++) {
      const recId = `${campaignId}-rec-${i}`;
      this.recipients.set(recId, {
        id: recId,
        campaign_id: campaignId,
        email: `recipient${i}@example.com`,
        status: "pending",
        retry_count: 0,
        sent_at: null,
        error_message: "",
      });
    }
  }

  async fetchPending(campaignId, batchSize) {
    const list = [];
    for (const rec of this.recipients.values()) {
      if (rec.campaign_id === campaignId && rec.status === "pending") {
        list.push({ ...rec });
        if (list.length >= batchSize) break;
      }
    }
    return list;
  }

  async countByStatus(campaignId, status) {
    let count = 0;
    for (const rec of this.recipients.values()) {
      if (rec.campaign_id === campaignId && rec.status === status) {
        count++;
      }
    }
    return count;
  }

  async countPendingOrSending(campaignId) {
    let count = 0;
    for (const rec of this.recipients.values()) {
      if (rec.campaign_id === campaignId && (rec.status === "pending" || rec.status === "sending")) {
        count++;
      }
    }
    return count;
  }

  async claimRecipient(recId) {
    const rec = this.recipients.get(recId);
    if (!rec || rec.status !== "pending") return null;
    rec.status = "sending";
    return { ...rec };
  }

  async markSent(recId) {
    const rec = this.recipients.get(recId);
    if (!rec) return;
    rec.status = "sent";
    rec.sent_at = new Date().toISOString();
  }

  async markFailed(recId, errMessage) {
    const rec = this.recipients.get(recId);
    if (!rec) return;
    rec.retry_count = (rec.retry_count || 0) + 1;
    if (rec.retry_count >= 3) {
      rec.status = "failed";
      rec.error_message = errMessage;
    } else {
      rec.status = "pending";
    }
  }

  async reclaimOrphanedSending(campaignId) {
    let reclaimed = 0;
    for (const rec of this.recipients.values()) {
      if (rec.campaign_id === campaignId && rec.status === "sending") {
        rec.status = "pending";
        reclaimed++;
      }
    }
    return reclaimed;
  }

  async updateCampaignStatus(campaignId, status) {
    const camp = this.campaigns.get(campaignId);
    if (camp) camp.status = status;
  }
}

// Simulates the exact logic in app/api/campaigns/[id]/process-batch/route.ts
async function processBatch(db, campaignId, options = {}) {
  const campaign = db.campaigns.get(campaignId);
  if (!campaign || campaign.status === "done") {
    return { done: true };
  }

  // Delay is simulated per email in tests

  // Configured batch sizing
  const MAX_BATCH_DURATION_MS = options.maxDurationMs || 20_000;
  const simulatedPerEmailMs = options.simulatedPerEmailMs || 50; // fast for testing
  const batchSize = Math.max(1, Math.min(25, Math.floor(MAX_BATCH_DURATION_MS / (simulatedPerEmailMs + 10))));

  let pending = await db.fetchPending(campaignId, batchSize);

  // Check orphan recovery
  if (!pending || pending.length === 0) {
    const sendingCount = await db.countByStatus(campaignId, "sending");
    if (sendingCount > 0) {
      await db.reclaimOrphanedSending(campaignId);
      pending = await db.fetchPending(campaignId, batchSize);
    }
  }

  if (!pending || pending.length === 0) {
    const failedCount = await db.countByStatus(campaignId, "failed");
    const newStatus = failedCount > 0 ? "partial" : "done";
    await db.updateCampaignStatus(campaignId, newStatus);
    return { done: true, status: newStatus };
  }

  let sent = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const recipient of pending) {
    if (Date.now() - startTime >= MAX_BATCH_DURATION_MS) {
      break;
    }

    const claimed = await db.claimRecipient(recipient.id);
    if (!claimed) continue;

    try {
      // Simulate send
      if (options.failEmails && options.failEmails.includes(recipient.email)) {
        throw new Error("Simulated sending failure");
      }
      await db.markSent(recipient.id);
      sent++;
    } catch (err) {
      await db.markFailed(recipient.id, err.message);
      failed++;
    }
  }

  const remaining = await db.countPendingOrSending(campaignId);

  if (remaining === 0) {
    const failedCount = await db.countByStatus(campaignId, "failed");
    const newStatus = failedCount > 0 ? "partial" : "done";
    await db.updateCampaignStatus(campaignId, newStatus);
  }

  return { processed: pending.length, sent, failed, remaining };
}

// Drive campaign until all batches complete (cooperative execution)
async function runCampaignToCompletion(db, campaignId, options = {}) {
  await db.updateCampaignStatus(campaignId, "sending");
  let iterations = 0;
  const MAX_ITERATIONS = 100;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const res = await processBatch(db, campaignId, options);
    if (res.done || res.remaining === 0) {
      break;
    }
  }

  const campaign = db.campaigns.get(campaignId);
  const sentCount = await db.countByStatus(campaignId, "sent");
  const failedCount = await db.countByStatus(campaignId, "failed");
  const pendingCount = await db.countByStatus(campaignId, "pending");
  const sendingCount = await db.countByStatus(campaignId, "sending");

  return {
    iterations,
    status: campaign.status,
    sent: sentCount,
    failed: failedCount,
    pending: pendingCount,
    sending: sendingCount,
  };
}

async function runTests() {
  console.log("==================================================");
  console.log("RUNNING BATCH PROCESSING VERIFICATION TESTS");
  console.log("==================================================\n");

  const testCases = [5, 14, 15, 25, 50, 100];

  for (const count of testCases) {
    const db = new MockDatabase();
    const campId = `camp-${count}`;
    db.createCampaign(campId, 30);
    db.addRecipients(campId, count);

    const result = await runCampaignToCompletion(db, campId);

    console.log(`Test: ${count} recipients`);
    console.log(`  Batches/Iterations: ${result.iterations}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Sent: ${result.sent} / ${count}`);
    console.log(`  Failed: ${result.failed}`);
    console.log(`  Pending: ${result.pending}`);
    console.log(`  Sending (stuck): ${result.sending}`);

    assert.strictEqual(result.status, "done", `Campaign with ${count} recipients should be marked 'done'`);
    assert.strictEqual(result.sent, count, `All ${count} recipients should be sent`);
    assert.strictEqual(result.pending, 0, "No recipients should remain pending");
    assert.strictEqual(result.sending, 0, "No recipients should remain stuck in sending");
    console.log(`  -> PASSED: All ${count} recipients successfully processed!\n`);
  }

  // Test failure handling & partial status
  console.log("Test: 20 recipients with 2 failures (partial status verification)");
  const failDb = new MockDatabase();
  const failCampId = "camp-failures";
  failDb.createCampaign(failCampId, 30);
  failDb.addRecipients(failCampId, 20);

  // Each failure retries up to 3 times before failing
  const failEmails = ["recipient3@example.com", "recipient7@example.com"];
  const failResult = await runCampaignToCompletion(failDb, failCampId, { failEmails });

  console.log(`  Batches/Iterations: ${failResult.iterations}`);
  console.log(`  Status: ${failResult.status}`);
  console.log(`  Sent: ${failResult.sent} / 18`);
  console.log(`  Failed: ${failResult.failed} / 2`);
  assert.strictEqual(failResult.status, "partial", "Campaign with failed recipients should be marked 'partial'");
  assert.strictEqual(failResult.sent, 18, "18 recipients should be sent");
  assert.strictEqual(failResult.failed, 2, "2 recipients should be failed");
  console.log("  -> PASSED: Partial completion correctly detected!\n");

  // Test recovery of orphaned "sending" status (e.g. from crash/timeout)
  console.log("Test: Orphaned 'sending' recipient recovery");
  const orphanDb = new MockDatabase();
  const orphanCampId = "camp-orphan";
  orphanDb.createCampaign(orphanCampId, 30);
  orphanDb.addRecipients(orphanCampId, 10);
  // Mark 3 recipients as stuck in "sending"
  orphanDb.recipients.get("camp-orphan-rec-1").status = "sending";
  orphanDb.recipients.get("camp-orphan-rec-2").status = "sending";
  orphanDb.recipients.get("camp-orphan-rec-3").status = "sending";

  const orphanResult = await runCampaignToCompletion(orphanDb, orphanCampId);
  console.log(`  Status: ${orphanResult.status}`);
  console.log(`  Sent: ${orphanResult.sent} / 10`);
  assert.strictEqual(orphanResult.status, "done");
  assert.strictEqual(orphanResult.sent, 10, "All 10 recipients including orphans should be sent");
  console.log("  -> PASSED: Orphaned recipients successfully recovered and sent!\n");

  console.log("==================================================");
  console.log("ALL VERIFICATION TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
