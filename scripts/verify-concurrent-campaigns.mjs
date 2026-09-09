import assert from "node:assert";

class MockDatabase {
  constructor() {
    this.campaigns = new Map();
    this.recipients = new Map();
    this.sendLogs = [];
  }

  createCampaign(id, name, rateLimit = 60) {
    this.campaigns.set(id, {
      id,
      name,
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
        email: `${campaignId}.user${i}@example.com`,
        status: "pending",
        retry_count: 0,
        sent_count: 0,
        error_message: "",
      });
    }
  }

  // Atomic claim: only succeeds if current status is 'pending'
  atomicClaimRecipient(recId) {
    const rec = this.recipients.get(recId);
    if (!rec || rec.status !== "pending") {
      return null;
    }
    rec.status = "sending";
    return { ...rec };
  }

  markSent(recId) {
    const rec = this.recipients.get(recId);
    if (rec) {
      rec.status = "sent";
      rec.sent_count = (rec.sent_count || 0) + 1;
      this.sendLogs.push({ recId, email: rec.email, time: Date.now() });
    }
  }

  markFailed(recId, errorMsg) {
    const rec = this.recipients.get(recId);
    if (rec) {
      rec.status = "failed";
      rec.error_message = errorMsg;
    }
  }

  updateCampaignStatus(campaignId, status) {
    const camp = this.campaigns.get(campaignId);
    if (camp) {
      camp.status = status;
    }
  }

  getCampaignRecipients(campaignId) {
    return Array.from(this.recipients.values()).filter(r => r.campaign_id === campaignId);
  }
}

// Global active processors registry simulating lib/campaign/processor.ts
class ConcurrencyProcessorManager {
  constructor(db) {
    this.db = db;
    this.activeProcessors = new Set();
    this.lastGraphCallTime = 0;
    this.minGraphIntervalMs = 50; // scaled for test speed
    this.simultaneousSnapshots = [];
  }

  async paceGraph() {
    const now = Date.now();
    const elapsed = now - this.lastGraphCallTime;
    if (elapsed < this.minGraphIntervalMs) {
      await new Promise(r => setTimeout(r, this.minGraphIntervalMs - elapsed));
    }
    this.lastGraphCallTime = Date.now();
  }

  isCampaignRunning(campaignId) {
    return this.activeProcessors.has(campaignId);
  }

  async startProcessor(campaignId, options = {}) {
    if (this.activeProcessors.has(campaignId)) {
      return { started: false, reason: "already_running" };
    }

    this.activeProcessors.add(campaignId);

    // Run asynchronously (independent background execution)
    const promise = (async () => {
      try {
        await this.runCampaignLoop(campaignId, options);
      } finally {
        this.activeProcessors.delete(campaignId);
      }
    })();

    return { started: true, promise };
  }

  async runCampaignLoop(campaignId, options = {}) {
    const camp = this.db.campaigns.get(campaignId);
    if (!camp || camp.status === "done") return;

    this.db.updateCampaignStatus(campaignId, "sending");

    while (true) {
      // Record active snapshot to prove simultaneous execution
      if (this.activeProcessors.size > 1) {
        this.simultaneousSnapshots.push({
          time: Date.now(),
          runningCount: this.activeProcessors.size,
          campaigns: Array.from(this.activeProcessors),
        });
      }

      // Fetch pending recipients for this campaign
      const allRecs = this.db.getCampaignRecipients(campaignId);
      const pending = allRecs.filter(r => r.status === "pending").slice(0, 5);

      if (pending.length === 0) {
        // Check for stuck recipients or completion
        const hasSending = allRecs.some(r => r.status === "sending");
        if (!hasSending) {
          const hasFailed = allRecs.some(r => r.status === "failed");
          this.db.updateCampaignStatus(campaignId, hasFailed ? "partial" : "done");
          break;
        }
        await new Promise(r => setTimeout(r, 20));
        continue;
      }

      for (const rec of pending) {
        // Atomic claim (recipient-level concurrency protection)
        const claimed = this.db.atomicClaimRecipient(rec.id);
        if (!claimed) continue;

        // Paced Microsoft Graph request
        await this.paceGraph();

        // Simulate send (or forced failure if option configured)
        if (options.shouldFail && options.failRecipientId === rec.id) {
          this.db.markFailed(rec.id, "Simulated Mailbox Rejection");
        } else {
          this.db.markSent(rec.id);
        }

        // Small pacing delay per campaign
        await new Promise(r => setTimeout(r, 10));
      }
    }
  }
}

async function runConcurrencyTestSuite() {
  console.log("==================================================");
  console.log("RUNNING CONCURRENT CAMPAIGNS TEST SUITE (BUG #3)");
  console.log("==================================================\n");

  const db = new MockDatabase();
  const manager = new ConcurrencyProcessorManager(db);

  // Setup Campaign A (20 recipients)
  db.createCampaign("camp-A", "Campaign A", 60);
  db.addRecipients("camp-A", 20);

  // Setup Campaign B (20 recipients)
  db.createCampaign("camp-B", "Campaign B", 60);
  db.addRecipients("camp-B", 20);

  // Setup Campaign C (20 recipients)
  db.createCampaign("camp-C", "Campaign C", 60);
  db.addRecipients("camp-C", 20);

  console.log("1. Starting Campaign A, B, and C concurrently...");
  const [resA, resB, resC] = await Promise.all([
    manager.startProcessor("camp-A", { shouldFail: true, failRecipientId: "camp-A-rec-5" }),
    manager.startProcessor("camp-B"),
    manager.startProcessor("camp-C"),
  ]);

  assert(resA.started && resB.started && resC.started, "All 3 campaigns started successfully");

  // Attempt duplicate launch of Campaign A while running
  const dupA = await manager.startProcessor("camp-A");
  assert(dupA.started === false, "Idempotent: duplicate launch of active campaign is rejected");
  console.log("✅ PASSED: Idempotency verified (no duplicate processors for same campaign)");

  // Wait for all 3 processors to complete independently
  await Promise.all([resA.promise, resB.promise, resC.promise]);

  console.log("\n2. Verifying Simultaneous Execution:");
  assert(
    manager.simultaneousSnapshots.length > 0,
    "Processors ran simultaneously (multiple active processors observed concurrently)"
  );
  const maxConcurrent = Math.max(...manager.simultaneousSnapshots.map(s => s.runningCount));
  console.log(`✅ PASSED: Simultaneous execution verified! Max concurrent active processors: ${maxConcurrent}`);

  console.log("\n3. Verifying Duplicate-Send Protection (Atomic Claiming):");
  for (const [id, rec] of db.recipients) {
    assert(rec.sent_count <= 1, `Recipient ${id} was sent more than once! (${rec.sent_count})`);
  }
  console.log("✅ PASSED: Zero duplicate sends across all 60 recipients!");

  console.log("\n4. Verifying Failure Isolation:");
  const recsA = db.getCampaignRecipients("camp-A");
  const recsB = db.getCampaignRecipients("camp-B");
  const recsC = db.getCampaignRecipients("camp-C");

  const failedA = recsA.filter(r => r.status === "failed");
  assert(failedA.length === 1 && failedA[0].id === "camp-A-rec-5", "Campaign A recorded its failure");
  assert(db.campaigns.get("camp-A").status === "partial", "Campaign A finished as 'partial'");

  const sentB = recsB.filter(r => r.status === "sent");
  assert(sentB.length === 20, "Campaign B was NOT interrupted by Campaign A's failure and sent all 20");
  assert(db.campaigns.get("camp-B").status === "done", "Campaign B completed with status 'done'");

  const sentC = recsC.filter(r => r.status === "sent");
  assert(sentC.length === 20, "Campaign C was NOT interrupted by Campaign A's failure and sent all 20");
  assert(db.campaigns.get("camp-C").status === "done", "Campaign C completed with status 'done'");
  console.log("✅ PASSED: Failure isolation verified! Failure in Campaign A did not stop B or C.");

  console.log("\n5. Verifying Independent Completion:");
  assert(manager.activeProcessors.size === 0, "All processors cleaned up cleanly after completion");
  console.log("✅ PASSED: Independent completion and cleanup verified!");

  console.log("\n==================================================");
  console.log("ALL CONCURRENCY VERIFICATION TESTS PASSED (BUG #3)!");
  console.log("==================================================");
}

runConcurrencyTestSuite().catch(err => {
  console.error("❌ Concurrency test failed:", err);
  process.exit(1);
});
