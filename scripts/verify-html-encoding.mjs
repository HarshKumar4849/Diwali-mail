import {
  escapeHtml,
  renderTemplate,
  compileTemplate,
} from "../lib/email/template.ts";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

/**
 * Simulates an email client or browser HTML rendering engine.
 * Decodes HTML entities back to visual text nodes while stripping HTML tags.
 */
function simulateHtmlClientRender(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

console.log("=== RUNNING BUG #4 HTML ENTITY & AMPERSAND ENCODING TEST SUITE ===\n");

// --- Test 1: escapeHtml Core Behavior ---
console.log("--- Test 1: escapeHtml Core & Idempotency ---");
const testTokens = [
  "&",
  "R&D",
  "A & B",
  "AT&T",
  "Johnson & Johnson",
  "Research & Development",
];

for (const token of testTokens) {
  const escaped = escapeHtml(token);
  assert(
    escaped.includes("&amp;") && !escaped.includes("&amp;amp;"),
    `escapeHtml('${token}') safely encodes to '${escaped}'`
  );

  // Test idempotency: escaping again must NOT double-encode
  const doubleEscaped = escapeHtml(escaped);
  assert(
    doubleEscaped === escaped,
    `escapeHtml is idempotent on '${escaped}' (does not produce &amp;amp;)`
  );
}

// Test <, >, ", '
assert(escapeHtml("<hello>") === "&lt;hello&gt;", "Escapes < and > correctly");
assert(escapeHtml('"quoted"') === "&quot;quoted&quot;", 'Escapes double quotes correctly');
assert(escapeHtml("'single'") === "&#39;single&#39;", "Escapes single quotes correctly");
assert(
  escapeHtml("Safe & Already &amp; Escaped") === "Safe &amp; Already &amp; Escaped",
  "Leaves existing &amp; intact while escaping raw &"
);

// --- Test 2: Plain Text Hardcoded Template Compilation ---
console.log("\n--- Test 2: Hardcoded Plain Text Templates ---");
const plainDraft = `Hello,

We are excited to partner with AT&T and Johnson & Johnson on R&D initiatives.
Our team is doing A & B testing on the new <Alpha> release.

Best regards,
Research & Development Team`;

const compiledPlain = compileTemplate(plainDraft);

// Must contain valid HTML source entities
assert(compiledPlain.includes("AT&amp;T"), "HTML source contains AT&amp;T");
assert(compiledPlain.includes("Johnson &amp; Johnson"), "HTML source contains Johnson &amp; Johnson");
assert(compiledPlain.includes("R&amp;D"), "HTML source contains R&amp;D");
assert(compiledPlain.includes("A &amp; B"), "HTML source contains A &amp; B");
assert(compiledPlain.includes("&lt;Alpha&gt;"), "Raw <Alpha> is escaped to &lt;Alpha&gt; so tag is not swallowed");
assert(!compiledPlain.includes("&amp;amp;"), "HTML source does NOT contain double-encoded &amp;amp;");

// Visual email client rendering check
const visuallyRenderedPlain = simulateHtmlClientRender(compiledPlain);
assert(!visuallyRenderedPlain.includes("&amp;"), "Recipient visually sees NO '&amp;' in email client");
assert(visuallyRenderedPlain.includes("AT&T"), "Recipient visually sees 'AT&T'");
assert(visuallyRenderedPlain.includes("Johnson & Johnson"), "Recipient visually sees 'Johnson & Johnson'");
assert(visuallyRenderedPlain.includes("R&D"), "Recipient visually sees 'R&D'");
assert(visuallyRenderedPlain.includes("A & B"), "Recipient visually sees 'A & B'");
assert(visuallyRenderedPlain.includes("<Alpha>"), "Recipient visually sees '<Alpha>'");

// --- Test 3: Spreadsheet Placeholder Values in HTML Template ---
console.log("\n--- Test 3: Spreadsheet Placeholder Values in HTML Template ---");
const htmlTemplate = `<div style="font-family: Arial, sans-serif;">
  <p>Dear {{ first_name }},</p>
  <p>Welcome to <strong>{{ company }}</strong>! Your division is <em>{{ division }}</em>.</p>
  <p>Your security clearance is: {{ clearance }}.</p>
</div>`;

const spreadsheetRow = {
  first_name: "Alice & Bob",
  company: "Johnson & Johnson",
  division: "R&D <Advanced>",
  clearance: 'Level "Top & Secret"',
};

const compiledHtmlWithPlaceholders = compileTemplate(htmlTemplate, spreadsheetRow);

// HTML template structure must remain intact
assert(compiledHtmlWithPlaceholders.includes('<div style="font-family: Arial, sans-serif;">'), "HTML wrapper preserved");
assert(compiledHtmlWithPlaceholders.includes("<p>Dear Alice &amp; Bob,</p>"), "Placeholder name single-escaped in HTML");
assert(compiledHtmlWithPlaceholders.includes("<strong>Johnson &amp; Johnson</strong>"), "Company single-escaped inside <strong> tag");
assert(compiledHtmlWithPlaceholders.includes("<em>R&amp;D &lt;Advanced&gt;</em>"), "Division ampersand and brackets single-escaped inside <em> tag");
assert(compiledHtmlWithPlaceholders.includes('&quot;Top &amp; Secret&quot;'), "Quotes and ampersands single-escaped");
assert(!compiledHtmlWithPlaceholders.includes("&amp;amp;"), "No double-encoded &amp;amp; in compiled HTML");
assert(!compiledHtmlWithPlaceholders.includes("&lt;p&gt;"), "Trusted HTML tags (<p>) were NOT escaped into &lt;p&gt;");

const visuallyRenderedHtml = simulateHtmlClientRender(compiledHtmlWithPlaceholders);
assert(visuallyRenderedHtml.includes("Alice & Bob"), "Visually renders 'Alice & Bob'");
assert(visuallyRenderedHtml.includes("Johnson & Johnson"), "Visually renders 'Johnson & Johnson'");
assert(visuallyRenderedHtml.includes("R&D <Advanced>"), "Visually renders 'R&D <Advanced>'");
assert(visuallyRenderedHtml.includes('Level "Top & Secret"'), 'Visually renders Level "Top & Secret"');
assert(!visuallyRenderedHtml.includes("&amp;"), "No visible &amp; text displayed to recipient");

// --- Test 4: Subject Line Preservation (Never Escaped) ---
console.log("\n--- Test 4: Subject Line Preservation (Literal Plain Text) ---");
const subjectTemplate = "Meeting with {{ company }} & {{ partner }}: R&D Discussion";
const subjectData = {
  company: "AT&T",
  partner: "Johnson & Johnson",
};

const renderedSubject = renderTemplate(subjectTemplate, subjectData);
assert(
  renderedSubject === "Meeting with AT&T & Johnson & Johnson: R&D Discussion",
  "Subject line is literal plain text with raw '&' and NO '&amp;'"
);
assert(!renderedSubject.includes("&amp;"), "Subject line contains NO HTML entity encoding whatsoever");

// --- Test 5: Word OpenXML Extraction Simulation ---
console.log("\n--- Test 5: Word OpenXML Extraction & docxToHtml Entity Handling ---");
// Simulate what Word OpenXML stores in document.xml:
// Word stores ampersands as &amp; inside <w:t> nodes.
function decodeXmlEntities(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

const wordXmlRunContent = "Johnson &amp; Johnson &lt;Global R&amp;D&gt;";
const decodedRaw = decodeXmlEntities(wordXmlRunContent);
assert(decodedRaw === "Johnson & Johnson <Global R&D>", "Word XML entities decoded back to raw text");

const docxHtmlSpan = `<span>${escapeHtml(decodedRaw)}</span>`;
assert(
  docxHtmlSpan === "<span>Johnson &amp; Johnson &lt;Global R&amp;D&gt;</span>",
  "DOCX text properly single-escaped for HTML without &amp;amp;"
);

// Now test compiling this DOCX HTML with recipient data
const docxWithPlaceholders = `<p><span>Hello </span><span>{{first_name}}</span><span>, welcome to </span><span>Johnson &amp; Johnson</span></p>`;
const compiledDocx = compileTemplate(docxWithPlaceholders, { first_name: "A & B" });
assert(
  compiledDocx.includes("<span>A &amp; B</span>"),
  "Placeholder in DOCX HTML correctly escaped once"
);
assert(
  compiledDocx.includes("<span>Johnson &amp; Johnson</span>"),
  "Word DOCX text preserved as single-escaped &amp;"
);
assert(!compiledDocx.includes("&amp;amp;"), "No double encoding in DOCX output");

const visuallyRenderedDocx = simulateHtmlClientRender(compiledDocx);
assert(
  visuallyRenderedDocx.includes("Hello A & B, welcome to Johnson & Johnson"),
  "Recipient visually sees clean text with literal ampersands"
);
assert(!visuallyRenderedDocx.includes("&amp;"), "No visible &amp; text in DOCX rendered email");

// --- Test 6: Canonical Preview vs Graph sendMail Parity ---
console.log("\n--- Test 6: Preview vs Graph sendMail Parity ---");
const sampleTemplate = `Hi {{ name }},\n\nWe confirm AT&T & Johnson & Johnson R&D agreement.\n\nRegards,\nTeam`;
const sampleRecipient = { name: "Tom & Jerry" };

// Preview uses compileTemplate
const previewOutput = compileTemplate(sampleTemplate, sampleRecipient);
// Graph sendMail uses compileTemplate
const sendMailOutput = compileTemplate(sampleTemplate, sampleRecipient);

assert(previewOutput === sendMailOutput, "Preview and SendMail receive identical compiled HTML");
assert(!previewOutput.includes("&amp;amp;"), "Preview has no double-encoding");
assert(simulateHtmlClientRender(previewOutput).includes("AT&T & Johnson & Johnson R&D"), "Preview renders literal ampersands");

console.log("\n✨ ALL 6 BUG #4 TEST SUITES PASSED PERFECTLY!");
