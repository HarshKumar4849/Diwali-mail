/**
 * Microsoft Graph Throttling & Account Safety Utilities
 * 
 * Provides detection, header parsing, and mailbox-scoped cooldown tracking
 * to respect Microsoft 365 / Outlook API limits (HTTP 429, 503, 504, Retry-After).
 */

// Registry of mailbox throttling cooldown timestamps (per user/mailbox)
const mailboxThrottledUntil = new Map<string, number>();

export function setMailboxThrottledUntil(userId: string, untilTimestamp: number): void {
  mailboxThrottledUntil.set(userId, untilTimestamp);
}

export function getMailboxThrottledUntil(userId: string): number {
  return mailboxThrottledUntil.get(userId) || 0;
}

/**
 * Checks whether an error from Microsoft Graph is a 401 Unauthorized or expired token error.
 */
export function isGraph401(err: unknown): boolean {
  if (!err) return false;
  const e = err as { statusCode?: number; code?: string; message?: string };
  if (e.statusCode === 401) return true;
  if (e.code === "InvalidAuthenticationToken") return true;
  if (typeof e.message === "string") {
    const msg = e.message.toLowerCase();
    return (
      msg.includes("401") ||
      msg.includes("unauthorized") ||
      msg.includes("invalidauthenticationtoken") ||
      msg.includes("access token has expired") ||
      msg.includes("lifetime validation failed") ||
      msg.includes("compacttoken parsing failed")
    );
  }
  return false;
}

/**
 * Checks whether an error from Microsoft Graph represents a rate limit / throttling response.
 * Includes HTTP 429 Too Many Requests, 503 Service Unavailable, 504 Gateway Timeout,
 * and Microsoft Graph throttling error codes.
 */
export function isGraphThrottled(err: unknown): boolean {
  if (!err) return false;
  const e = err as { statusCode?: number; status?: number; code?: string; message?: string };
  const status = e.statusCode || e.status;
  if (status === 429 || status === 503 || status === 504) return true;

  if (typeof e.code === "string") {
    const code = e.code.toLowerCase();
    if (
      code === "toomanyrequests" ||
      code === "activitylimitreached" ||
      code === "mailboxconcurrencylimitexceeded"
    ) {
      return true;
    }
  }

  if (typeof e.message === "string") {
    const msg = e.message.toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("too many requests") ||
      msg.includes("activitylimitreached") ||
      msg.includes("mailboxconcurrencylimitexceeded") ||
      msg.includes("throttled")
    );
  }

  return false;
}

/**
 * Extracts the Retry-After interval (in seconds) from a Microsoft Graph error response.
 * Safely parses integer seconds or HTTP-date format, defaulting to defaultSeconds if unspecified.
 */
export function extractRetryAfterSeconds(err: unknown, defaultSeconds = 5): number {
  if (!err || typeof err !== "object") return defaultSeconds;

  const e = err as {
    headers?: Headers | Record<string, string> | { get?: (name: string) => string | null };
    response?: { headers?: Headers | Record<string, string> | { get?: (name: string) => string | null } };
  };

  let headerValue: string | null = null;
  const headers = e.headers || e.response?.headers;

  if (headers) {
    if (typeof (headers as { get?: (name: string) => string | null }).get === "function") {
      headerValue =
        (headers as { get: (name: string) => string | null }).get("Retry-After") ||
        (headers as { get: (name: string) => string | null }).get("retry-after");
    } else if (typeof headers === "object") {
      const record = headers as Record<string, string>;
      headerValue = record["Retry-After"] || record["retry-after"] || null;
    }
  }

  if (headerValue) {
    const seconds = parseInt(headerValue, 10);
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(seconds, 300); // Cap at 5 minutes to prevent unbounded freezes
    }

    const parsedDate = Date.parse(headerValue);
    if (!Number.isNaN(parsedDate)) {
      const diffSeconds = Math.ceil((parsedDate - Date.now()) / 1000);
      if (diffSeconds > 0) {
        return Math.min(diffSeconds, 300);
      }
    }
  }

  return defaultSeconds;
}
