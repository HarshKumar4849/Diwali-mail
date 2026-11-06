// scripts/send-test-campaign.mjs
// Run this anytime with: node scripts/send-test-campaign.mjs

const API_URL = "http://localhost:3000/api/external/campaigns";
const API_KEY = process.env.LEADFORGE_API_KEY || "leadforge_sec_k9x2m4p8q1w3v7y5";

// Change these values to whatever you want to test!
const payload = {
  campaignName: "My Manual Test Campaign",
  emails: [
    {
      to: "hkp12345h@gmail.com",
      from: "yogeshumbarkar@tecmotivsolutions.com", // This must match your connected Microsoft 365 email
      subject: "Hello from Mailcraft External API!",
      body: "<h1>Great News!</h1><p>This email was sent using the <strong>Mailcraft External Campaign API</strong>.</p><p>Links work too: <a href='https://mailcraft.app'>Visit Website</a></p>",
    },
    {
      to: "test@test.com",
      from: "yogeshumbarkar@tecmotivsolutions.com",
      subject: "Second test email in the same batch",
      body: "<p>Hi there,</p><p>This is recipient #2 in the batch!</p>",
    },
  ],
};

async function run() {
  console.log("Sending request to Mailcraft External API...");
  console.log("Endpoint:", API_URL);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    console.log("\n================ HTTP RESPONSE ================");
    console.log("Status Code:", response.status);
    console.log("Response Body:");
    console.log(JSON.stringify(data, null, 2));
    console.log("===============================================\n");

    if (response.ok) {
      console.log("SUCCESS! Campaign created.");
      console.log(`Open http://localhost:3000/ in your browser to view campaign ID: ${data.campaignId}`);
    } else {
      console.log("FAILED. Check the error message above.");
    }
  } catch (err) {
    console.error("Network or connection error:", err.message);
    console.log("Make sure your dev server is running on http://localhost:3000 (npm run dev)");
  }
}

run();
