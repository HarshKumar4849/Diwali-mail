import JSZip from "jszip";
import { docxToHtml, docxToPlainText } from "../lib/docx-to-html.ts";
import { compileTemplate } from "../lib/email/template.ts";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function buildDocxBuffer({ documentXml, relsXml = "", numberingXml = "" }) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  ${numberingXml ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : ""}
</Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  const defaultRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  zip.file("word/_rels/document.xml.rels", relsXml || defaultRels);
  zip.file("word/document.xml", documentXml);
  if (numberingXml) {
    zip.file("word/numbering.xml", numberingXml);
  }

  const nodeBuf = await zip.generateAsync({ type: "nodebuffer" });
  return {
    name: "SDV_Mailcraft_DOCX_Test.docx",
    arrayBuffer: async () => nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength),
  };
}

async function runVerification() {
  console.log("==================================================");
  console.log("MAILCRAFT — PROFESSIONAL EMAIL FORMATTING VERIFICATION");
  console.log("==================================================");

  // -------------------------------------------------------------
  // TEST 1: Corporate Email Drafting & Markdown Removal
  // -------------------------------------------------------------
  console.log("\n--- TEST 1: Drafting Corporate Business Email & Markdown Elimination ---");
  const draftContent = `Dear {{Name}},

Greetings from Tecmotiv Solutions.

We are pleased to invite {{Company}} to explore a potential strategic partnership.

Meeting Details

Date: 25 September 2026
Venue: Pune

About the Summit

The summit will bring together leading automotive technology companies.

Key Areas

• Software-Defined Vehicles
• Digital Cockpit
• Connected Mobility
• Automotive AI

Partnership Opportunities

We offer multiple strategic packages tailored to your brand goals.

View Summit Details:
https://example.com/sdv-summit-2026

Partnership Information:
https://example.com/partnership?company=Alpha%20Corp&source=mailcraft

Hyperlink with Markdown:
[View Website](https://example.com)

**Important Information** and *Session Schedule*:
1\\. Register early
2\\. Reserve your seat

Contact our partnership team:
mailto\\:partnership@example.com

Test URL containing & and escape:
https://example.com/register?a=1\\&b=2#summit

Warm Regards,

**Yogesh**
Founder | Tecmotiv Solutions
Co-Founder | Tech4Earth Mobility Foundation
Board Advisor | Astron Aerospace, USA`;

  const sampleData = { Name: "Alex", Company: "Alpha Corp" };
  const compiled = compileTemplate(draftContent, sampleData);

  // Assertions for Test 1
  assert(compiled.includes("Dear Alex,"), "Greeting personalized with {{Name}}");
  assert(compiled.includes("invite Alpha Corp to"), "Company name personalized with {{Company}}");
  
  // Headings
  assert(compiled.includes("<strong>Meeting Details</strong>"), "Natural heading 'Meeting Details' rendered distinctly");
  assert(compiled.includes("<strong>About the Summit</strong>"), "Natural heading 'About the Summit' rendered distinctly");
  assert(compiled.includes("<strong>Partnership Opportunities</strong>"), "Natural heading 'Partnership Opportunities' rendered distinctly");
  assert(compiled.includes("<strong>Key Areas</strong>"), "Natural heading 'Key Areas' rendered distinctly");

  // Bold & Italic
  assert(compiled.includes("<strong>Important Information</strong>"), "Markdown bold **Important Information** converted to <strong>");
  assert(!compiled.includes("**Important Information**"), "No raw ** markers in output");
  assert(compiled.includes("<em>Session Schedule</em>"), "Markdown italic *Session Schedule* converted to <em>");

  // Links
  assert(compiled.includes('<a href="https://example.com/sdv-summit-2026"'), "Direct URL converted to <a> tag");
  assert(compiled.includes('style="color: #0066cc !important; text-decoration: underline;"'), "Standard blue underline link style applied");
  assert(compiled.includes('target="_blank" rel="noopener noreferrer"'), "Safe link target and rel attributes applied");

  // Markdown link [View Website](https://example.com)
  assert(compiled.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer" style="color: #0066cc !important; text-decoration: underline;">View Website</a>'), "Markdown link converted to clean HTML anchor");
  assert(!compiled.includes("[View Website]"), "No markdown brackets in link output");

  // Query URLs with &
  assert(compiled.includes('href="https://example.com/partnership?company=Alpha%20Corp&amp;source=mailcraft"'), "Query URL & escaped once as &amp; in href");
  assert(!compiled.includes("&amp;amp;"), "Zero double encoding in HTML output");
  assert(!compiled.includes("\\&"), "Zero backslash escape characters in output");

  // Fragment URLs
  assert(compiled.includes("#summit"), "URL fragment #summit preserved intact");

  // Mailto links
  assert(compiled.includes('href="mailto:partnership@example.com"'), "Mailto link generated cleanly");
  assert(!compiled.includes("mailto\\:"), "Zero mailto\\: backslash escape in output");

  // Lists
  assert(compiled.includes("<ul") && compiled.includes(">Software-Defined Vehicles</li>"), "Bullet list rendered as <ul><li>");
  assert(compiled.includes("<ol") && compiled.includes(">Register early</li>"), "Numbered list rendered as <ol><li>");
  assert(!compiled.includes("1\\."), "Zero 1\\. backslash escape in output");

  // Signature
  assert(compiled.includes("Warm Regards,"), "Signature greeting present");
  assert(compiled.includes("<strong>Yogesh</strong><br />Founder | Tecmotiv Solutions<br />Co-Founder | Tech4Earth Mobility Foundation<br />Board Advisor | Astron Aerospace, USA"), "Signature formatted tightly with <br /> and bold name");

  // -------------------------------------------------------------
  // TEST 2: DOCX Import with Headings, Tables, Lists, and Links
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: DOCX Import to Semantic Corporate HTML ---");
  const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t>Dear {{Name}},</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Greetings from </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Tecmotiv Solutions</w:t></w:r>
      <w:r><w:t>.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>About the Summit</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The SDV Summit brings together global leaders from AT&amp;T, Johnson &amp; Johnson, and others.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Category</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Details</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Date</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>25 September 2026</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:hyperlink r:id="rId2">
        <w:r><w:t>View Summit Details</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="0"/></w:pPr>
      <w:r><w:t>Warm Regards,</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="0"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Yogesh</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:spacing w:after="0"/></w:pPr>
      <w:r><w:t>Founder | Tecmotiv Solutions</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/sdv-summit-2026?partner=Alpha%20Corp&amp;track=main" TargetMode="External"/>
</Relationships>`;

  const docxFile = await buildDocxBuffer({ documentXml: docxXml, relsXml });
  const importedHtml = await docxToHtml(docxFile);

  assert(importedHtml.includes("<h2") && importedHtml.includes(">About the Summit</h2>"), "DOCX standalone bold line converted to <h2> heading");
  assert(importedHtml.includes("<table"), "DOCX table preserved as <table>");
  assert(importedHtml.includes("<td") && importedHtml.includes("25 September 2026"), "Table cell contents preserved");
  assert(importedHtml.includes('<a href="https://example.com/sdv-summit-2026?partner=Alpha%20Corp&amp;track=main"'), "Hyperlinked text preserved with safe single-escaped query params");
  assert(importedHtml.includes(">View Summit Details</a>"), "Hyperlink anchor text 'View Summit Details' preserved");
  assert(importedHtml.includes("margin: 0 0 2px 0"), "Compact signature lines with w:after='0' preserved without massive 12px gaps");

  // Compile with placeholders
  const compiledDocx = compileTemplate(importedHtml, { Name: "Alex" });
  assert(compiledDocx.includes("Dear Alex,"), "DOCX placeholder replacement works in compileTemplate");
  assert(compiledDocx.includes("AT&amp;T"), "Ampersand in company name safely single-escaped");
  assert(!compiledDocx.includes("&amp;amp;"), "Zero double encoding in compiled DOCX HTML");

  // -------------------------------------------------------------
  // TEST 3: Plain-Text Output Mode Strict Parity
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: Genuine Plain-Text Output ---");
  const plainTextOutput = await docxToPlainText(docxFile);
  assert(!plainTextOutput.includes("<p>"), "No <p> tags in plain text output");
  assert(!plainTextOutput.includes("<a>"), "No <a> tags in plain text output");
  assert(!plainTextOutput.includes("<strong>"), "No <strong> tags in plain text output");
  assert(plainTextOutput.includes("Dear {{Name}},"), "Plain text preserves greeting and merge tag");
  assert(plainTextOutput.includes("View Summit Details (https://example.com/sdv-summit-2026?partner=Alpha%20Corp&track=main)"), "Plain text formats hyperlink with URL");
  assert(plainTextOutput.includes("AT&T"), "Plain text contains raw ampersand, not &amp;");

  // -------------------------------------------------------------
  // TEST 4: Special Characters & Unicode & Emoji
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Special Characters, Quotes, Dashes, Emoji ---");
  const specialInput = `Partnership with Johnson & Johnson — Strategic "MoU" Announcement 🚀
AT&T and AAYERA & ARAI are participating.
Website: https://example.com/info?param1=A&param2=B#details`;

  const specialCompiled = compileTemplate(specialInput);
  assert(specialCompiled.includes("Johnson &amp; Johnson"), "Ampersand single-escaped in text");
  assert(specialCompiled.includes("—"), "Em dash preserved");
  assert(specialCompiled.includes("🚀"), "Emoji preserved");
  assert(!specialCompiled.includes("&amp;amp;"), "Zero double-encoded ampersands");
  assert(specialCompiled.includes('href="https://example.com/info?param1=A&amp;param2=B#details"'), "Query URL parameters preserved cleanly");

  // -------------------------------------------------------------
  // TEST 5: Large Email Performance & Degradation Check
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: Large Email Consistency Check ---");
  const largeParas = [];
  for (let i = 1; i <= 200; i++) {
    largeParas.push(`Paragraph ${i}: Information regarding summit session ${i}. Check https://example.com/session-${i}?ref=mailcraft`);
  }
  const largeDraft = largeParas.join("\n\n");
  const t0 = Date.now();
  const largeCompiled = compileTemplate(largeDraft);
  const t1 = Date.now();

  assert(largeCompiled.includes('href="https://example.com/session-1?ref=mailcraft"'), "Link at beginning formatted cleanly");
  assert(largeCompiled.includes('href="https://example.com/session-100?ref=mailcraft"'), "Link in middle formatted cleanly");
  assert(largeCompiled.includes('href="https://example.com/session-200?ref=mailcraft"'), "Link at end formatted cleanly");
  assert(t1 - t0 < 500, `Large email compiled in ${t1 - t0}ms (< 500ms)`);

  console.log("\n==================================================");
  console.log("✨ ALL PROFESSIONAL EMAIL FORMATTING TESTS PASSED!");
  console.log("==================================================");
}

runVerification().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
