import JSZip from "jszip";
import fs from "fs";

const buffer = fs.readFileSync("/home/anubhav/Downloads/AIDA-GES2026-Invitation-Email-Draft.docx");
const zip = await JSZip.loadAsync(buffer);
const docXml = await zip.file("word/document.xml").async("string");

const tbl = docXml.match(/<w:tbl[\s\S]*?<\/w:tbl>/);
if (!tbl) { console.log("No table found"); process.exit(0); }

const cells = tbl[0].match(/<w:tc[\s\S]*?<\/w:tc>/g);
console.log("=== Cell properties ===");
for (let i = 0; i < cells.length; i++) {
  const vAlign = cells[i].match(/<w:vAlign\s+w:val="([^"]+)"/);
  const tcW = cells[i].match(/<w:tcW\s+w:w="(\d+)"/);
  console.log("Cell " + i + ": vAlign=" + (vAlign?.[1] || "default") + " width=" + (tcW?.[1] || "auto"));
}

// Check para 139 (social icons)
const paras = docXml.match(/<w:p[\s\S]*?<\/w:p>/g);
const para139 = paras[139];

const cxVals = para139.match(/cx="(\d+)"/g);
const cyVals = para139.match(/cy="(\d+)"/g);
console.log("\n=== Social icons (para 139) sizes ===");
if (cxVals) {
  for (let i = 0; i < cxVals.length; i++) {
    const cx = parseInt(cxVals[i].match(/\d+/)[0]);
    const cy = parseInt(cyVals[i].match(/\d+/)[0]);
    console.log("  Icon " + i + ": " + Math.round(cx/914400*96) + "x" + Math.round(cy/914400*96) + "px");
  }
}

// Check runs in para 139
const runs = para139.match(/<w:r[\s\S]*?<\/w:r>/g);
console.log("\nRuns in para 139: " + (runs?.length || 0));
if (runs) {
  for (let i = 0; i < runs.length; i++) {
    const hasEmbed = /r:embed=/.test(runs[i]);
    const hasText = /<w:t/.test(runs[i]);
    const textMatch = runs[i].match(/<w:t[^>]*>([^<]*)<\/w:t>/);
    const text = textMatch ? textMatch[1] : "";
    console.log("  Run " + i + ": img=" + hasEmbed + " text=" + hasText + " content='" + text.substring(0, 30) + "'");
  }
}

// Check bottom banner
const para142 = paras[142];
const cx142 = para142.match(/cx="(\d+)"/);
const cy142 = para142.match(/cy="(\d+)"/);
console.log("\n=== Bottom banner (para 142) size ===");
if (cx142) {
  console.log("  " + Math.round(parseInt(cx142[1])/914400*96) + "x" + Math.round(parseInt(cy142[1])/914400*96) + "px");
}
