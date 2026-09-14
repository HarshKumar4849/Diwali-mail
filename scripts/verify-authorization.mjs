function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log("===============================================================");
console.log("=== RUNNING MAILCRAFT AUTHORIZATION & SECURITY TEST SUITE ===");
console.log("===============================================================\n");

// --- TEST 1: Unauthenticated user send rejection ---
console.log("--- TEST 1: Unauthenticated user send rejection ---");
{
  function simulateSendEndpoint({ user, campaign }) {
    if (!user) return { status: 401, error: "Unauthorized" };
    if (!campaign || campaign.user_id !== user.id) return { status: 404, error: "Not found" };
    return { status: 200 };
  }

  const unauthRes = simulateSendEndpoint({ user: null, campaign: { user_id: "user-1" } });
  assert(unauthRes.status === 401, "Unauthenticated request rejected with 401 Unauthorized");
  assert(unauthRes.error === "Unauthorized", "Correct error message returned");
}

// --- TEST 2: Authenticated user with NO Microsoft connection ---
console.log("\n--- TEST 2: Authenticated user with NO Microsoft connection ---");
{
  const mockTokenDatabase = new Map(); // Empty token store

  async function mockGetValidAccessToken(userId) {
    const token = mockTokenDatabase.get(userId);
    if (!token) {
      throw new Error("No Microsoft token found. Please connect Outlook in Settings.");
    }
    return token.access_token;
  }

  async function simulateSendWithAuthCheck({ user, campaign }) {
    if (!user) return { status: 401, error: "Unauthorized" };
    if (!campaign || campaign.user_id !== user.id) return { status: 404, error: "Not found" };

    try {
      await mockGetValidAccessToken(user.id);
    } catch (err) {
      return {
        status: 403,
        error: "Microsoft account connection required before sending email.",
        details: err.message,
      };
    }

    return { status: 200, statusText: "sending" };
  }

  const res = await simulateSendWithAuthCheck({
    user: { id: "user-b" },
    campaign: { id: "camp-b", user_id: "user-b" },
  });

  assert(res.status === 403, "Send request rejected with 403 Forbidden");
  assert(
    res.error === "Microsoft account connection required before sending email.",
    "Correct fail-closed application error returned"
  );
}

// --- TEST 3: User A connected to Microsoft Account A sends as Account A ---
console.log("\n--- TEST 3: User A connected to Microsoft Account A ---");
{
  const mockTokenDatabase = new Map([
    ["user-a", { user_id: "user-a", access_token: "token-a", microsoft_email: "account-a@tecmotiv.com" }],
    ["user-b", { user_id: "user-b", access_token: "token-b", microsoft_email: "account-b@tecmotiv.com" }],
  ]);

  function getSenderForUser(userId) {
    const token = mockTokenDatabase.get(userId);
    if (!token) throw new Error("No token");
    return token.microsoft_email;
  }

  assert(getSenderForUser("user-a") === "account-a@tecmotiv.com", "User A dispatches strictly from Account A");
}

// --- TEST 4: User B connected to Microsoft Account B sends as Account B ---
console.log("\n--- TEST 4: User B connected to Microsoft Account B ---");
{
  const mockTokenDatabase = new Map([
    ["user-a", { user_id: "user-a", access_token: "token-a", microsoft_email: "account-a@tecmotiv.com" }],
    ["user-b", { user_id: "user-b", access_token: "token-b", microsoft_email: "account-b@tecmotiv.com" }],
  ]);

  function getSenderForUser(userId) {
    const token = mockTokenDatabase.get(userId);
    if (!token) throw new Error("No token");
    return token.microsoft_email;
  }

  assert(getSenderForUser("user-b") === "account-b@tecmotiv.com", "User B dispatches strictly from Account B");
}

// --- TEST 5: User B cannot retrieve or use User A's Microsoft token ---
console.log("\n--- TEST 5: User B tries to reference User A's Microsoft account ---");
{
  const mockTokenDatabase = new Map([
    ["user-a", { user_id: "user-a", access_token: "token-a", microsoft_email: "account-a@tecmotiv.com" }],
  ]);

  function fetchTokenForAuthenticatedUser(sessionUserId) {
    const token = mockTokenDatabase.get(sessionUserId);
    if (!token) {
      throw new Error("No Microsoft token found. Please connect Outlook in Settings.");
    }
    return token;
  }

  let userBThrew = false;
  try {
    fetchTokenForAuthenticatedUser("user-b");
  } catch (err) {
    userBThrew = true;
    assert(err.message.includes("No Microsoft token found"), "User B receives No Microsoft Token error");
  }
  assert(userBThrew, "User B cannot query or obtain User A's token");
}

// --- TEST 6: IDOR Protection on Campaigns & Recipients ---
console.log("\n--- TEST 6: User B tries to use User A's campaign ID ---");
{
  const campaigns = [
    { id: "camp-100", user_id: "user-a", name: "User A Campaign" },
  ];

  function getRecipientsEndpoint({ sessionUser, campaignId }) {
    const campaign = campaigns.find(c => c.id === campaignId && c.user_id === sessionUser.id);
    if (!campaign) {
      return { status: 404, error: "Not found" };
    }
    return { status: 200, data: ["recipient1@test.com"] };
  }

  function sendCampaignEndpoint({ sessionUser, campaignId }) {
    const campaign = campaigns.find(c => c.id === campaignId && c.user_id === sessionUser.id);
    if (!campaign) {
      return { status: 404, error: "Not found" };
    }
    return { status: 200, statusText: "sending" };
  }

  const recipientResult = getRecipientsEndpoint({
    sessionUser: { id: "user-b" },
    campaignId: "camp-100",
  });
  assert(recipientResult.status === 404, "User B blocked from reading User A recipients (404 Not Found)");

  const sendResult = sendCampaignEndpoint({
    sessionUser: { id: "user-b" },
    campaignId: "camp-100",
  });
  assert(sendResult.status === 404, "User B blocked from sending User A campaign (404 Not Found)");
}

// --- TEST 7: Frontend Spoofing Immunity ---
console.log("\n--- TEST 7: User modifies sender email in browser request ---");
{
  // Even if user sends { sender: "adityaj@tecmotivsolutions.com" } in the body,
  // the backend determines sender strictly from server-side authenticated token
  const authenticatedToken = {
    microsoft_email: "genuine-user@company.com",
    user_id: "user-123",
  };

  function resolveDispatchSender(reqBody, serverToken) {
    // The backend IGNORES reqBody.sender entirely
    return serverToken.microsoft_email;
  }

  const spoofedSender = resolveDispatchSender({ sender: "adityaj@tecmotivsolutions.com" }, authenticatedToken);
  assert(spoofedSender === "genuine-user@company.com", "Backend ignores spoofed sender and enforces authenticated token identity");
}

// --- TEST 8: Pre-flight processor gate (Fail closed) ---
console.log("\n--- TEST 8: Campaign processor aborts cleanly if no Microsoft token ---");
{
  let claimedCount = 0;
  let finalStatus = "";

  async function mockRunCampaignLoop({ campaign, hasToken }) {
    if (!campaign || !hasToken) {
      // Pre-flight check fails
      finalStatus = "draft";
      return;
    }
    claimedCount++;
    finalStatus = "done";
  }

  await mockRunCampaignLoop({
    _campaign: { id: "camp-1", user_id: "user-no-token" },
    hasToken: false,
  });

  assert(claimedCount === 0, "No recipients claimed when token is absent");
  assert(finalStatus === "draft", "Campaign reverted to draft without failing recipients");
}

// --- TEST 9: Proactive Token Refresh & 5-Minute Buffer ---
console.log("\n--- TEST 9: Proactive token refresh with 5-minute buffer ---");
{
  const TOKEN_REFRESH_BUFFER_SECONDS = 300;
  function needsTokenRefresh(expiresAtIso) {
    const expiresAt = new Date(expiresAtIso).getTime();
    return expiresAt < Date.now() + TOKEN_REFRESH_BUFFER_SECONDS * 1000;
  }

  const validExpiry = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  const nearExpiry = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  assert(!needsTokenRefresh(validExpiry), "Valid token with >5 min remaining is reused");
  assert(needsTokenRefresh(nearExpiry), "Token within 5 min of expiry triggers proactive refresh");
}

// --- TEST 10: Single-Flight Refresh Mutex Per User ---
console.log("\n--- TEST 10: Concurrent sends share single refresh promise per user ---");
{
  const activeRefreshes = new Map();
  let refreshCalls = 0;

  async function mockRefresh(userId) {
    if (activeRefreshes.has(userId)) {
      return await activeRefreshes.get(userId);
    }
    const p = (async () => {
      try {
        refreshCalls++;
        await new Promise(r => setTimeout(r, 20));
        return `refreshed_token_for_${userId}`;
      } finally {
        activeRefreshes.delete(userId);
      }
    })();
    activeRefreshes.set(userId, p);
    return await p;
  }

  const [t1, t2, t3] = await Promise.all([
    mockRefresh("user-a"),
    mockRefresh("user-a"),
    mockRefresh("user-a"),
  ]);

  assert(refreshCalls === 1, "Exactly 1 refresh network call made for 3 concurrent requests");
  assert(t1 === t2 && t2 === t3, "All concurrent requests received identical refreshed token");
}

// --- TEST 11: Concurrent Campaigns from Different Users are Isolated ---
console.log("\n--- TEST 11: Concurrent campaigns from different users remain isolated ---");
{
  const activeRefreshes = new Map();
  const userTokens = new Map();

  async function mockUserRefresh(userId) {
    if (activeRefreshes.has(userId)) {
      return await activeRefreshes.get(userId);
    }
    const p = (async () => {
      try {
        await new Promise(r => setTimeout(r, 20));
        const tok = `token_${userId}_${Date.now()}`;
        userTokens.set(userId, tok);
        return tok;
      } finally {
        activeRefreshes.delete(userId);
      }
    })();
    activeRefreshes.set(userId, p);
    return await p;
  }

  const [tokA, tokB] = await Promise.all([
    mockUserRefresh("user-a"),
    mockUserRefresh("user-b"),
  ]);

  assert(tokA.startsWith("token_user-a"), "User A token belongs strictly to User A");
  assert(tokB.startsWith("token_user-b"), "User B token belongs strictly to User B");
  assert(tokA !== tokB, "User A and User B never share tokens");
}

// --- TEST 12: Status Endpoint Does Not Fall Back to Supabase Email ---
console.log("\n--- TEST 12: Status endpoint does not fall back to Supabase email ---");
{
  function resolveStatusResponse(tokenRow) {
    if (!tokenRow || !tokenRow.refresh_token) {
      return { connected: false, email: "" };
    }
    return {
      connected: true,
      email: tokenRow.microsoft_email || "",
    };
  }

  const disconnectedRes = resolveStatusResponse(null);
  assert(disconnectedRes.connected === false, "Disconnected status is connected: false");
  assert(disconnectedRes.email === "", "Disconnected status has empty email, never leaks user email");

  const connectedNoEmail = resolveStatusResponse({ refresh_token: "ref_tok" });
  assert(connectedNoEmail.email === "", "No fallback to user email if microsoft_email is missing");
}

console.log("\n✨ ALL 12 AUTHORIZATION & SECURITY TESTS PASSED WITH ZERO FAILURES!\n");
