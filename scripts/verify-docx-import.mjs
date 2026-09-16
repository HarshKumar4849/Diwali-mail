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

/**
 * Builds a valid DOCX binary in memory using JSZip.
 */
export async function buildDocxBuffer({ documentXml, relsXml = "", numberingXml = "" }) {
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
    arrayBuffer: async () => nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength),
  };
}

async function runTestSuite() {
  console.log("==================================================");
  console.log("MAILCRAFT — DOCX IMPORT VERIFICATION SUITE");
  console.log("==================================================");

  // -------------------------------------------------------------
  // TEST 1: Headings & Paragraphs
  // -------------------------------------------------------------
  console.log("\n--- TEST 1: Headings & Paragraph Formatting ---");
  const headingDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Q3 Performance Review</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Executive Summary</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading3"/></w:pPr>
      <w:r><w:t>Key Achievements</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>We exceeded our annual target by 14%.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const headingFile = await buildDocxBuffer({ documentXml: headingDocXml });
  const headingHtml = await docxToHtml(headingFile);
  assert(headingHtml.includes("<h1") && headingHtml.includes(">Q3 Performance Review</h1>"), "Heading 1 converted to <h1>");
  assert(headingHtml.includes("<h2") && headingHtml.includes(">Executive Summary</h2>"), "Heading 2 converted to <h2>");
  assert(headingHtml.includes("<h3") && headingHtml.includes(">Key Achievements</h3>"), "Heading 3 converted to <h3>");
  assert(headingHtml.includes("<p") && headingHtml.includes(">We exceeded our annual target by 14%.</p>"), "Normal paragraph wrapped in <p>");

  // -------------------------------------------------------------
  // TEST 2: Inline Styles (Bold, Italic, Underline, Strikethrough)
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: Bold, Italic, Underline, Strikethrough ---");
  const styleDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Bold Text</w:t></w:r>
      <w:r><w:t> and </w:t></w:r>
      <w:r><w:rPr><w:i/></w:rPr><w:t>Italic Text</w:t></w:r>
      <w:r><w:t> and </w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Underlined Text</w:t></w:r>
      <w:r><w:t> and </w:t></w:r>
      <w:r><w:rPr><w:strike/></w:rPr><w:t>Strikethrough Text</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const styleFile = await buildDocxBuffer({ documentXml: styleDocXml });
  const styleHtml = await docxToHtml(styleFile);
  assert(styleHtml.includes("font-weight: bold") && styleHtml.includes("Bold Text"), "Bold style applied");
  assert(styleHtml.includes("font-style: italic") && styleHtml.includes("Italic Text"), "Italic style applied");
  assert(styleHtml.includes("text-decoration: underline") && styleHtml.includes("Underlined Text"), "Underline style applied");
  assert(styleHtml.includes("text-decoration: line-through") && styleHtml.includes("Strikethrough Text"), "Strikethrough style applied");

  // -------------------------------------------------------------
  // TEST 3: Line Breaks, Tabs, and Whitespace
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: Line Breaks, Tabs, and Whitespace ---");
  const brDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Line 1</w:t>
        <w:br/>
        <w:t>Line 2 with tab:</w:t>
        <w:tab/>
        <w:t>Value</w:t>
      </w:r>
    </w:p>
    <w:p></w:p>
    <w:p>
      <w:r><w:t>Paragraph 2 after blank line</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const brFile = await buildDocxBuffer({ documentXml: brDocXml });
  const brHtml = await docxToHtml(brFile);
  assert(brHtml.includes("Line 1<br />Line 2 with tab:"), "Line break inside run preserved without dropping text");
  assert(brHtml.includes("&nbsp;&nbsp;&nbsp;&nbsp;Value"), "Tab inside run converted to non-breaking spaces");
  assert(brHtml.includes("&nbsp;</p>"), "Blank line / empty paragraph preserved as spacing paragraph");

  // -------------------------------------------------------------
  // TEST 4: Lists (Bullets and Numbered)
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Bullet and Numbered Lists ---");
  const listDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Bullet item Alpha</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Bullet item Beta</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Between lists</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>
      <w:r><w:t>Numbered item One</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>
      <w:r><w:t>Numbered item Two</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="10">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="20">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
</w:numbering>`;

  const listFile = await buildDocxBuffer({ documentXml: listDocXml, numberingXml });
  const listHtml = await docxToHtml(listFile);
  assert(listHtml.includes("<ul") && listHtml.includes(">Bullet item Alpha</li>") && listHtml.includes(">Bullet item Beta</li></ul>"), "Bullet list grouped into <ul><li>...</li></ul>");
  assert(listHtml.includes("<ol") && listHtml.includes(">Numbered item One</li>") && listHtml.includes(">Numbered item Two</li></ol>"), "Numbered list grouped into <ol><li>...</li></ol>");

  // -------------------------------------------------------------
  // TEST 5: Tables
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: Tables ---");
  const tableDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblW w:w="5000" w:type="dxa"/>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Col A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Col B</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Val 1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Val 2</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  const tableFile = await buildDocxBuffer({ documentXml: tableDocXml });
  const tableHtml = await docxToHtml(tableFile);
  assert(tableHtml.includes("<table") && tableHtml.includes("<tr><td") && tableHtml.includes("Col A") && tableHtml.includes("Col B") && tableHtml.includes("Val 1") && tableHtml.includes("Val 2"), "Table structure preserved with rows and cells");

  // -------------------------------------------------------------
  // TEST 6: DOCX Hyperlinks (Phases 7, 8, 9, 10)
  // -------------------------------------------------------------
  console.log("\n--- TEST 6: Hyperlinks & Special Characters ---");
  const linksDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t>Plain URL: </w:t></w:r>
      <w:hyperlink r:id="rIdPlain">
        <w:r><w:t>https://example.com</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:r><w:t>Path URL: </w:t></w:r>
      <w:hyperlink r:id="rIdPath">
        <w:r><w:t>https://www.example.com/path</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:r><w:t>HTTP URL: </w:t></w:r>
      <w:hyperlink r:id="rIdHttp">
        <w:r><w:t>http://example.com</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:r><w:t>Query params with &: </w:t></w:r>
      <w:hyperlink r:id="rIdQuery">
        <w:r><w:t>Search Here</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:r><w:t>Fragment URL: </w:t></w:r>
      <w:hyperlink r:id="rIdFrag">
        <w:r><w:t>Section 3</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:r><w:t>Long URL: </w:t></w:r>
      <w:hyperlink r:id="rIdLong">
        <w:r><w:t>Long Destination</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:r><w:t>Hyperlinked text: </w:t></w:r>
      <w:hyperlink r:id="rIdVisit">
        <w:r><w:t>Visit Website</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:r><w:t>Unsafe URL 1: </w:t></w:r>
      <w:hyperlink r:id="rIdUnsafe1">
        <w:r><w:t>Click for Script</w:t></w:r>
      </w:hyperlink>
    </w:p>
    <w:p>
      <w:r><w:t>Unsafe URL 2: </w:t></w:r>
      <w:hyperlink r:id="rIdUnsafe2">
        <w:r><w:t>Click for Data</w:t></w:r>
      </w:hyperlink>
    </w:p>
  </w:body>
</w:document>`;

  const linksRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdPlain" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
  <Relationship Id="rIdPath" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.example.com/path" TargetMode="External"/>
  <Relationship Id="rIdHttp" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="http://example.com" TargetMode="External"/>
  <Relationship Id="rIdQuery" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/search?a=1&amp;b=2" TargetMode="External"/>
  <Relationship Id="rIdFrag" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/page#section" TargetMode="External"/>
  <Relationship Id="rIdLong" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://company.internal.portal.service.cloud/deep/nested/path/to/resource?auth=token1234567890&amp;view=detailed#overview" TargetMode="External"/>
  <Relationship Id="rIdVisit" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
  <Relationship Id="rIdUnsafe1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>
  <Relationship Id="rIdUnsafe2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;" TargetMode="External"/>
</Relationships>`;

  const linksFile = await buildDocxBuffer({ documentXml: linksDocXml, relsXml: linksRelsXml });
  const linksHtml = await docxToHtml(linksFile);

  assert(linksHtml.includes('href="https://example.com"'), "Plain URL anchor generated");
  assert(linksHtml.includes('href="https://www.example.com/path"'), "Path URL anchor generated");
  assert(linksHtml.includes('href="http://example.com"'), "HTTP URL anchor generated");
  assert(linksHtml.includes('href="https://example.com/search?a=1&amp;b=2"'), "Query params with & escaped properly once");
  assert(!linksHtml.includes("&amp;amp;"), "No double encoding in URL query parameters");
  assert(linksHtml.includes('href="https://example.com/page#section"'), "Fragment URL anchor generated");
  assert(linksHtml.includes('href="https://company.internal.portal.service.cloud/deep/nested/path/to/resource?auth=token1234567890&amp;view=detailed#overview"'), "Long URL with query and fragment generated cleanly");
  assert(linksHtml.includes('<a href="https://example.com"') && linksHtml.includes(">Visit Website</a>"), "Hyperlinked text preserved");

  // Verify unsafe protocols rejected
  assert(!linksHtml.includes("href=\"javascript:"), "javascript: protocol rejected");
  assert(!linksHtml.includes("href=\"data:"), "data: protocol rejected");
  assert(linksHtml.includes("Click for Script"), "Unsafe link text preserved without executable anchor");

  // -------------------------------------------------------------
  // TEST 7: Placeholders inside DOCX & compilation
  // -------------------------------------------------------------
  console.log("\n--- TEST 7: Placeholders & compileTemplate Parity ---");
  const placeholderDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t>Hello {{first_name}}, welcome to Johnson &amp; Johnson!</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Please visit your portal: </w:t></w:r>
      <w:hyperlink r:id="rIdPortal">
        <w:r><w:t>Access {{portal_name}}</w:t></w:r>
      </w:hyperlink>
    </w:p>
  </w:body>
</w:document>`;

  const phRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdPortal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://portal.example.com/user?name={{first_name}}" TargetMode="External"/>
</Relationships>`;

  const phFile = await buildDocxBuffer({ documentXml: placeholderDocXml, relsXml: phRelsXml });
  const phHtml = await docxToHtml(phFile);

  assert(phHtml.includes("{{first_name}}"), "Placeholder in paragraph preserved");
  assert(phHtml.includes("Johnson &amp; Johnson"), "Ampersand in text single-escaped");
  assert(phHtml.includes("{{portal_name}}"), "Placeholder in link text preserved");

  const compiled = compileTemplate(phHtml, {
    first_name: "Sarah & Alex",
    portal_name: "HR <Portal>",
  });

  assert(compiled.includes("Sarah &amp; Alex"), "Placeholder value safely escaped once in compiled template");
  assert(compiled.includes("HR &lt;Portal&gt;"), "Link text placeholder safely escaped");
  assert(compiled.includes("Johnson &amp; Johnson"), "Word XML text preserved as single-escaped &amp;");
  assert(!compiled.includes("&amp;amp;"), "Zero double-encoding in compiled DOCX HTML");

  // -------------------------------------------------------------
  // TEST 8: Plain Text Output Support (Phase 13)
  // -------------------------------------------------------------
  console.log("\n--- TEST 8: Plain Text Output ---");
  const plainTextOutput = await docxToPlainText(linksFile);

  assert(!/<[a-z][\s\S]*>/i.test(plainTextOutput), "No HTML tags in plain text output");
  assert(plainTextOutput.includes("https://example.com"), "Plain text preserves URL");
  assert(plainTextOutput.includes("Visit Website (https://example.com)"), "Plain text formats hyperlinked text with URL");
  assert(plainTextOutput.includes("https://example.com/search?a=1&b=2"), "Plain text preserves query parameters without entity corruption");

  const plainListText = await docxToPlainText(listFile);
  assert(plainListText.includes("- Bullet item Alpha"), "Bullet item formatted as bullet in plain text");
  assert(plainListText.includes("1. Numbered item One"), "Numbered item formatted with number in plain text");

  // -------------------------------------------------------------
  // TEST 9: Size Scaling (Small, Medium, Large, Very Large)
  // -------------------------------------------------------------
  console.log("\n--- TEST 9: Size Scaling Performance & Stability ---");
  const sizes = [
    { name: "Small", count: 10 },
    { name: "Medium", count: 100 },
    { name: "Large", count: 1000 },
    { name: "Very Large", count: 3000 },
  ];

  for (const s of sizes) {
    const paras = [];
    for (let i = 0; i < s.count; i++) {
      paras.push(`
        <w:p>
          <w:r><w:t>Item ${i}: Testing performance in Mailcraft DOCX import with Johnson &amp; Johnson &lt;test&gt;.</w:t></w:r>
          <w:hyperlink r:id="rId${i % 5}">
            <w:r><w:t>Link ${i}</w:t></w:r>
          </w:hyperlink>
        </w:p>
      `);
    }

    const sizeRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId0" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/0" TargetMode="External"/>
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/1?a=1&amp;b=2" TargetMode="External"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/2#sec" TargetMode="External"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/3" TargetMode="External"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/4" TargetMode="External"/>
</Relationships>`;

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${paras.join("")}</w:body>
</w:document>`;

    const file = await buildDocxBuffer({ documentXml: docXml, relsXml: sizeRels });
    const t0 = Date.now();
    const html = await docxToHtml(file);
    const duration = Date.now() - t0;

    assert(html.length > 0, `${s.name} (${s.count} paras) converted successfully in ${duration}ms (HTML length: ${html.length})`);
    assert(duration < 2000, `${s.name} processed efficiently (< 2000ms)`);
    assert(!html.includes("&amp;amp;"), `${s.name} contains no double encoding`);
    assert(html.includes('href="https://example.com/1?a=1&amp;b=2"'), `${s.name} contains valid links`);
  }

  // -------------------------------------------------------------
  // TEST 10: HTML Document Import (Handling .html documents directly)
  // -------------------------------------------------------------
  console.log("\n--- Test 10: HTML Document Import & Fallback ---");

  const sampleHtml = `<p style="margin-top: 0; margin-bottom: 0"><span>Dear {{Name}}, </span></p>
<p style="margin-top: 0; margin-bottom: 0"><span>For more information, please visit </span><a href="https://example.com/summit?source=mailcraft&amp;year=2026#details"><span style="font-weight: bold">View Summit Details</span></a><span>.</span></p>
<p style="margin-top: 0; margin-bottom: 0"><span>Company website: </span><a href="{{Website}}"><span>{{Website}}</span></a></p>`;

  const htmlBuffer = Buffer.from(sampleHtml, "utf-8");
  const htmlFile = {
    name: "template.html",
    arrayBuffer: async () => htmlBuffer.buffer.slice(htmlBuffer.byteOffset, htmlBuffer.byteOffset + htmlBuffer.byteLength),
  };

  const importedHtml = await docxToHtml(htmlFile);
  assert(!importedHtml.includes("margin-top: 0"), "HTML import eliminates collapsed margin-top: 0");
  assert(importedHtml.includes("margin: 0 0 12px 0"), "HTML import establishes healthy paragraph spacing (12px)");
  assert(importedHtml.includes('style="color: #0066cc !important; text-decoration: underline;"'), "HTML import styles <a> tags in blue (#0066cc) with underline");
  assert(importedHtml.includes('color: #0066cc !important; text-decoration: underline;">View Summit Details</span>'), "HTML import styles child <span> in blue (#0066cc)");
  assert(importedHtml.includes("{{Name}}"), "HTML import preserves {{Name}} merge tag");
  assert(importedHtml.includes("{{Website}}"), "HTML import preserves {{Website}} merge tag");

  const importedPlain = await docxToPlainText(htmlFile);
  assert(importedPlain.includes("Dear {{Name}}"), "HTML plain text preserves greeting");
  assert(importedPlain.includes("View Summit Details (https://example.com/summit?source=mailcraft&year=2026#details)"), "HTML plain text formats link with target URL");

  console.log("\n==================================================");
  console.log("✨ ALL DOCX & HTML IMPORT VERIFICATION TESTS PASSED!");
  console.log("==================================================");
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR in test suite:", err);
  process.exit(1);
});
