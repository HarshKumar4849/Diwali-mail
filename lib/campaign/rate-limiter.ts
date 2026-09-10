/**
 * Per-Campaign Rate Limiter
 * 
 * Each campaign maintains its own independent rate limiter state:
 * - campaignRateLimit: configured emails per minute (e.g., 20)
 * - campaignSendCount: number of emails sent in the current 1-minute window
 * - windowStartTime: timestamp when the current window started
 * - nextAllowedSendTime: timestamp when the campaign is next eligible to send
 * 
 * Reaching a campaign's configured rate limit pauses only that specific campaign
 * until its own window resets, without blocking any other concurrent campaigns.
 */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CampaignRateLimiter {
  readonly campaignId: string;
  readonly campaignRateLimit: number;
  private readonly windowDurationMs = 60_000; // 1-minute window
  private readonly targetIntervalMs: number;

  private windowStartTime: number;
  private campaignSendCount: number;
  private nextAllowedSendTime: number;

  constructor(campaignId: string, campaignRateLimit: number) {
    this.campaignId = campaignId;
    this.campaignRateLimit = campaignRateLimit > 0 ? campaignRateLimit : 20;
    // Calculate target interval between sends to distribute emails smoothly
    this.targetIntervalMs = Math.max(100, Math.floor(this.windowDurationMs / this.campaignRateLimit));

    const now = Date.now();
    this.windowStartTime = now;
    this.campaignSendCount = 0;
    this.nextAllowedSendTime = now;
  }

  /**
   * Waits until this campaign is eligible to send its next recipient.
   * Enforces both:
   * 1. 1-minute window limit (campaignSendCount < campaignRateLimit)
   * 2. Smooth pacing between individual emails within the window
   */
  async waitForNextSend(): Promise<void> {
    const now = Date.now();

    // Check if the current 1-minute window has expired
    if (now - this.windowStartTime >= this.windowDurationMs) {
      this.windowStartTime = now;
      this.campaignSendCount = 0;
      this.nextAllowedSendTime = now;
    }

    // If the campaign has exhausted its quota for this 1-minute window,
    // wait until the current window ends.
    if (this.campaignSendCount >= this.campaignRateLimit) {
      const windowRemainingMs = (this.windowStartTime + this.windowDurationMs) - Date.now();
      if (windowRemainingMs > 0) {
        await delay(windowRemainingMs);
      }
      // Reset window after waiting
      const resetTime = Date.now();
      this.windowStartTime = resetTime;
      this.campaignSendCount = 0;
      this.nextAllowedSendTime = resetTime;
    }

    // Pacing within the window: wait if nextAllowedSendTime is in the future
    const currentTime = Date.now();
    if (currentTime < this.nextAllowedSendTime) {
      const waitMs = this.nextAllowedSendTime - currentTime;
      await delay(waitMs);
    }
  }

  /**
   * Records a successful dispatch for this campaign and schedules the next eligible time.
   */
  recordSend(): void {
    const now = Date.now();
    this.campaignSendCount++;
    // Schedule next allowed send time based on target interval
    this.nextAllowedSendTime = Math.max(now, this.nextAllowedSendTime) + this.targetIntervalMs;
  }

  /**
   * Diagnostic snapshot of the campaign's current rate-limiting state.
   */
  getState() {
    const now = Date.now();
    const elapsedInWindow = now - this.windowStartTime;
    return {
      campaignId: this.campaignId,
      campaignRateLimit: this.campaignRateLimit,
      campaignSendCount: this.campaignSendCount,
      windowStartTime: this.windowStartTime,
      nextAllowedSendTime: this.nextAllowedSendTime,
      windowRemainingMs: Math.max(0, this.windowDurationMs - elapsedInWindow),
    };
  }
}

// Registry to track active rate limiters by campaign ID
const activeLimiters = new Map<string, CampaignRateLimiter>();

/**
 * Gets or creates an independent rate limiter for a specific campaign.
 */
export function getCampaignRateLimiter(campaignId: string, rateLimit: number): CampaignRateLimiter {
  let limiter = activeLimiters.get(campaignId);
  if (!limiter || limiter.campaignRateLimit !== rateLimit) {
    limiter = new CampaignRateLimiter(campaignId, rateLimit);
    activeLimiters.set(campaignId, limiter);
  }
  return limiter;
}

/**
 * Removes a campaign limiter when its campaign finishes or stops.
 */
export function cleanupCampaignRateLimiter(campaignId: string): void {
  activeLimiters.delete(campaignId);
}
