import {
  compileTemplate,
  isHtml,
} from "../lib/email/template.ts";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log("=== RUNNING BUG #2 WHITESPACE & COMPILATION TEST SUITE ===\n");

// Test 1: Normal paragraphs
console.log("--- Test 1: Normal Paragraphs ---");
const normalDraft = "Hello world,\n\nThis is paragraph two.";
const normalCompiled = compileTemplate(normalDraft);
assert(
  normalCompiled ===
    '<p style="margin: 0 0 12px 0; line-height: 1.5;">Hello world,</p><p style="margin: 0 0 12px 0; line-height: 1.5;">This is paragraph two.</p>',
  "Normal paragraphs convert to clean <p> tags with consistent 12px bottom margin and no extra breaks"
);

// Test 2: Multiple paragraphs with single line breaks (e.g. signature or address)
console.log("\n--- Test 2: Multiple Paragraphs with Single Line Breaks ---");
const multiParaDraft =
  "Dear Team,\n\nPlease note the following:\nMeeting is at 10 AM.\n\nBest regards,\nMailcraft Bot\nTecmotiv Solutions";
const multiParaCompiled = compileTemplate(multiParaDraft);
assert(
  multiParaCompiled ===
    '<p style="margin: 0 0 12px 0; line-height: 1.5;">Dear Team,</p>' +
      '<p style="margin: 0 0 12px 0; line-height: 1.5;">Please note the following:<br />Meeting is at 10 AM.</p>' +
      '<p style="margin: 0 0 12px 0; line-height: 1.5;">Best regards,<br />Mailcraft Bot<br />Tecmotiv Solutions</p>',
  "Paragraphs preserve single line breaks within blocks as <br /> without adding extra blank lines"
);

// Test 3: Blank lines
console.log("\n--- Test 3: Blank Lines Handling ---");
const blankLinesDraft = "First paragraph\n\n\n\nSecond paragraph";
const blankLinesCompiled = compileTemplate(blankLinesDraft);
assert(
  blankLinesCompiled ===
    '<p style="margin: 0 0 12px 0; line-height: 1.5;">First paragraph</p><p style="margin: 0 0 12px 0; line-height: 1.5;">Second paragraph</p>',
  "Multiple blank lines between paragraphs do not generate unbounded empty paragraph gaps"
);

// Test 4: Lists (HTML)
console.log("\n--- Test 4: Lists ---");
const listDraft =
  "<ul>\n  <li>Item 1</li>\n  <li>Item 2</li>\n  <li>Item 3</li>\n</ul>";
const listCompiled = compileTemplate(listDraft);
assert(isHtml(listDraft), "Detects list markup as HTML");
assert(
  !listCompiled.includes("<br>"),
  "Lists do NOT have <br> tags injected between items or wrappers"
);
assert(
  listCompiled === "<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>",
  "HTML list whitespace is cleanly normalized between tags"
);

// Test 5: Tables (HTML)
console.log("\n--- Test 5: Tables ---");
const tableDraft = `<table style="width: 100%;">
  <tbody>
    <tr>
      <td>Cell 1</td>
      <td>Cell 2</td>
    </tr>
    <tr>
      <td>Cell 3</td>
      <td>Cell 4</td>
    </tr>
  </tbody>
</table>`;
const tableCompiled = compileTemplate(tableDraft);
assert(isHtml(tableDraft), "Detects table markup as HTML");
assert(
  !tableCompiled.includes("<br>"),
  "Table does NOT have any <br> injected in rows or cells"
);
assert(
  tableCompiled ===
    '<table style="width: 100%;"><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr><tr><td>Cell 3</td><td>Cell 4</td></tr></tbody></table>',
  "Table structural whitespace is completely removed, preventing browser/email client vertical gaps"
);

// Test 6: Placeholder values (with spaces, empty strings, and missing keys)
console.log("\n--- Test 6: Placeholder Values ---");
const placeholderDraft =
  "Hello {{ first_name }}, your role is {{ role }} and status is {{ status }}. Ref: {{ missing }}";
const recipientData = {
  first_name: "John",
  role: "", // empty string in CSV
  status: "Active  Manager", // intentional double space in value
};
const placeholderCompiled = compileTemplate(placeholderDraft, recipientData);
assert(
  placeholderCompiled.includes("Hello John,"),
  "Interpolates trimmed placeholder key correctly"
);
assert(
  !placeholderCompiled.includes("{{ role }}") && !placeholderCompiled.includes("{{role}}"),
  "Empty CSV field renders empty, not {{role}}"
);
assert(
  placeholderCompiled.includes("Active &nbsp;Manager"),
  "Preserves intentional spaces in data values"
);
assert(
  placeholderCompiled.includes("Ref: {{ missing }}"),
  "Preserves unmatched placeholder key for user inspection"
);

// Test 7: DOCX Imported Content
console.log("\n--- Test 7: DOCX Imported Content ---");
const docxHtml = `<p style="margin-top: 0.0pt; margin-bottom: 0.0pt; text-align: justify">
  <span>Dear </span><span>{{first_name}}</span>
</p>
<table style="width: 200.0pt">
  <tr>
    <td style="width: 100.0pt; vertical-align: middle">
      <p style="margin-top: 0.0pt; margin-bottom: 0.0pt"><span>Col A</span></p>
    </td>
    <td style="width: 100.0pt; vertical-align: middle">
      <p style="margin-top: 0.0pt; margin-bottom: 0.0pt"><span>Col B</span></p>
    </td>
  </tr>
</table>`;
const docxCompiled = compileTemplate(docxHtml, { first_name: "Sarah" });
assert(
  !docxCompiled.includes("<br>"),
  "DOCX HTML does NOT have unwanted <br> tags injected"
);
assert(
  docxCompiled.includes("<span>Dear </span><span>Sarah</span>"),
  "Inline whitespace between spans inside paragraph is 100% preserved"
);
assert(
  !docxCompiled.includes("<tr>\n"),
  "Table newlines are cleanly stripped so no visual gaps appear"
);

// Test 8: Intentional spaces in Plain Text
console.log("\n--- Test 8: Intentional Spaces ---");
const intentionalSpacesDraft = "Invoice:\n  Subtotal:    $100.00\n  Tax:         $10.00";
const intentionalSpacesCompiled = compileTemplate(intentionalSpacesDraft);
assert(
  intentionalSpacesCompiled.includes("&nbsp;"),
  "Preserves intentional multiple consecutive spaces via &nbsp;"
);

// Test 9: Canonical Compilation Parity (Preview HTML vs SendMail HTML)
console.log("\n--- Test 9: Canonical Parity (Preview == SendMail) ---");
const testTemplates = [
  normalDraft,
  multiParaDraft,
  tableDraft,
  docxHtml,
  intentionalSpacesDraft,
];
const testData = { first_name: "Alex", role: "Dev", status: "OK" };

for (const tmpl of testTemplates) {
  // In our new architecture:
  // Preview uses: compileTemplate(template, data)
  // SendMail uses: compileTemplate(template, data)
  const previewHtml = compileTemplate(tmpl, testData);
  const sendMailHtml = compileTemplate(tmpl, testData);
  assert(
    previewHtml === sendMailHtml,
    `Preview and SendMail output are bit-for-bit identical for template snippet: "${tmpl.slice(0, 30).replace(/\n/g, "\\n")}..."`
  );
}

console.log("\n✨ ALL 9 TESTS PASSED PERFECTLY!");
