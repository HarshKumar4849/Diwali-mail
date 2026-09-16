import { compileTemplate, isHtml } from "../lib/email/template.ts";
import { docxToHtml, docxToPlainText } from "../lib/docx-to-html.ts";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTestSuite() {
  console.log("==================================================");
  console.log("MAILCRAFT — LINK DISPLAY & AUTO-LINKING TEST SUITE");
  console.log("==================================================");

  // -------------------------------------------------------------
  // TEST 1 — PLAIN URL
  // -------------------------------------------------------------
  console.log("\n--- TEST 1: Plain URL ---");
  const t1Input = "Please check https://example.com/sdv-summit-2026 for details.";
  const t1Compiled = compileTemplate(t1Input);
  assert(t1Compiled.includes('<a href="https://example.com/sdv-summit-2026"'), "Plain URL recognized and converted to <a> tag");
  assert(t1Compiled.includes('target="_blank" rel="noopener noreferrer"'), "Plain URL has target blank and rel");
  assert(t1Compiled.includes("color: #0066cc !important; text-decoration: underline;"), "Plain URL has blue underline style");

  // -------------------------------------------------------------
  // TEST 2 — URL WITH QUERY PARAMETERS
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: URL with Query Parameters ---");
  const t2Input = "Partnership info: https://example.com/partnership?company=Alpha%20Corp&source=mailcraft.";
  const t2Compiled = compileTemplate(t2Input);
  assert(t2Compiled.includes('href="https://example.com/partnership?company=Alpha%20Corp&amp;source=mailcraft"'), "Query params & escaped once as &amp; in href");
  assert(!t2Compiled.includes("&amp;amp;"), "No double encoding in query parameters");
  assert(t2Compiled.endsWith(".</p>"), "Trailing period is kept outside anchor tag");

  // -------------------------------------------------------------
  // TEST 3 — URL WITH FRAGMENT
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: URL with Fragment ---");
  const t3Input = "Register here: https://example.com/register#partnership!";
  const t3Compiled = compileTemplate(t3Input);
  assert(t3Compiled.includes('href="https://example.com/register#partnership"'), "URL fragment (#partnership) preserved intact");
  assert(t3Compiled.endsWith("!</p>"), "Trailing exclamation is kept outside anchor tag");

  // -------------------------------------------------------------
  // TEST 4 — HYPERLINKED TEXT
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Hyperlinked Text ---");
  const t4Input = '<a href="https://example.com/sdv-summit-2026">View Summit Details</a>';
  assert(isHtml(t4Input), "isHtml accurately identifies standalone <a> tag as HTML");
  const t4Compiled = compileTemplate(t4Input);
  assert(t4Compiled.includes('href="https://example.com/sdv-summit-2026"'), "Hyperlinked text href preserved");
  assert(t4Compiled.includes(">View Summit Details</a>"), "Hyperlinked text label preserved without markdown brackets");
  assert(!t4Compiled.includes("[View Summit Details]"), "No markdown brackets introduced");
  assert(t4Compiled.includes("color: #0066cc !important; text-decoration: underline;"), "Hyperlinked text styled with standard blue link style");

  // -------------------------------------------------------------
  // TEST 5 — DOCX IMPORT (HTML Anchor, not Markdown)
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: DOCX Hyperlinks Preserved as HTML ---");
  const sampleHtmlFile = {
    name: "template.html",
    arrayBuffer: async () => Buffer.from('<p>Check <a href="https://example.com/sdv-summit-2026">View Summit Details</a></p>', "utf-8"),
  };
  const docxHtml = await docxToHtml(sampleHtmlFile);
  assert(docxHtml.includes('<a href="https://example.com/sdv-summit-2026"'), "DOCX import preserves HTML anchor");
  assert(!docxHtml.includes("[View Summit Details]"), "DOCX import never outputs markdown syntax");

  // -------------------------------------------------------------
  // TEST 6 — PLAIN TEXT MODE
  // -------------------------------------------------------------
  console.log("\n--- TEST 6: Plain Text Mode ---");
  const plainHtmlFile = {
    name: "template.html",
    arrayBuffer: async () => Buffer.from('<p>Search: https://example.com/search?q=mailcraft&source=test</p>', "utf-8"),
  };
  const plainText = await docxToPlainText(plainHtmlFile);
  assert(!plainText.includes("<a "), "Plain text output has no HTML anchor tags");
  assert(plainText.includes("https://example.com/search?q=mailcraft&source=test"), "Plain text preserves exact URL without escape artifacts");
  assert(!plainText.includes("\\&"), "Plain text does not contain escaped ampersand");

  // -------------------------------------------------------------
  // TEST 7 — HTML MODE
  // -------------------------------------------------------------
  console.log("\n--- TEST 7: HTML Mode Styling ---");
  const t7Input = "Visit https://example.com/sdv-summit-2026";
  const t7Output = compileTemplate(t7Input);
  assert(t7Output.startsWith("<p"), "HTML output wrapped in paragraph");
  assert(t7Output.includes('style="color: #0066cc !important; text-decoration: underline;"'), "Anchor styled with #0066cc underline");

  // -------------------------------------------------------------
  // SPECIAL CHARACTER TEST
  // -------------------------------------------------------------
  console.log("\n--- SPECIAL CHARACTER TEST ---");
  const spInput = "Check https://example.com/search?a=1&b=2";
  const spOutput = compileTemplate(spInput);
  assert(spOutput.includes('href="https://example.com/search?a=1&amp;b=2"'), "Ampersand correctly formatted in href attribute");
  assert(!spOutput.includes("&amp;amp;"), "No double encoding of ampersand");
  assert(!spOutput.includes("\\&"), "No backslash escaping in URL");

  // -------------------------------------------------------------
  // SECURITY TEST
  // -------------------------------------------------------------
  console.log("\n--- SECURITY TEST ---");
  const sec1 = compileTemplate("Unsafe javascript:alert(1)");
  assert(!sec1.includes('<a href="javascript:'), "javascript: scheme rejected");
  const sec2 = compileTemplate("Unsafe data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==");
  assert(!sec2.includes('<a href="data:'), "data: scheme rejected");
  const sec3 = compileTemplate("Unsafe vbscript:msgbox(1)");
  assert(!sec3.includes('<a href="vbscript:'), "vbscript: scheme rejected");

  // -------------------------------------------------------------
  // LARGE EMAIL TEST
  // -------------------------------------------------------------
  console.log("\n--- LARGE EMAIL TEST ---");
  const paras = [];
  paras.push("Beginning link: https://example.com/start");
  for (let i = 1; i <= 200; i++) {
    if (i === 100) {
      paras.push("Middle link: https://example.com/middle?batch=100");
    } else {
      paras.push(`Paragraph ${i}: Regular content discussing summit updates and details.`);
    }
  }
  paras.push("End link: https://example.com/end#final");

  const largeBody = paras.join("\n\n");
  const largeOutput = compileTemplate(largeBody);
  assert(largeOutput.includes('href="https://example.com/start"'), "Link near beginning recognized and converted");
  assert(largeOutput.includes('href="https://example.com/middle?batch=100"'), "Link near middle recognized and converted");
  assert(largeOutput.includes('href="https://example.com/end#final"'), "Link near end recognized and converted");

  console.log("\n==================================================");
  console.log("✨ ALL 10 LINK VERIFICATION TESTS PASSED!");
  console.log("==================================================");
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR in link test suite:", err);
  process.exit(1);
});
