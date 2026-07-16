/* eslint-disable @typescript-eslint/no-explicit-any */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function emuToPx(emu: string): number {
  return Math.round(parseInt(emu) / 914400 * 96);
}

function twipToPt(twip: string): string {
  return (parseInt(twip) / 20).toFixed(1) + "pt";
}

function parseStylesFromPPr(pPr: string): string[] {
  const styles: string[] = [];

  const jcMatch = pPr.match(/<w:jc\s+w:val="([^"]+)"/);
  if (jcMatch && jcMatch[1] !== "left") {
    styles.push(`text-align: ${jcMatch[1] === "both" ? "justify" : jcMatch[1]}`);
  }

  const indMatch = pPr.match(/<w:ind[^>]*>/);
  if (indMatch) {
    const left = indMatch[0].match(/w:left="(\d+)"/);
    const firstLine = indMatch[0].match(/w:firstLine="(\d+)"/);
    const hanging = indMatch[0].match(/w:hanging="(\d+)"/);
    if (left) styles.push(`margin-left: ${twipToPt(left[1])}`);
    if (firstLine) styles.push(`text-indent: ${twipToPt(firstLine[1])}`);
    if (hanging) styles.push(`text-indent: -${twipToPt(hanging[1])}`);
  }

  const spacingMatch = pPr.match(/<w:spacing[^>]*\/>/);
  if (spacingMatch) {
    const before = spacingMatch[0].match(/w:before="(\d+)"/);
    const after = spacingMatch[0].match(/w:after="(\d+)"/);
    const line = spacingMatch[0].match(/w:line="(\d+)"/);
    if (before) styles.push(`margin-top: ${(parseInt(before[1]) / 40).toFixed(1)}pt`);
    if (after) styles.push(`margin-bottom: ${(parseInt(after[1]) / 40).toFixed(1)}pt`);
    if (line) styles.push(`line-height: ${parseInt(line[1]) / 240}`);
  }

  return styles;
}

async function extractParaContent(paraXml: string, zip: any, rels: Record<string, string>): Promise<string> {
  const runRegex = /<w:r[\s>][\s\S]*?<\/w:r>/g;
  const runs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = runRegex.exec(paraXml)) !== null) {
    runs.push(m[0]);
  }

  const parts = await Promise.all(runs.map(async (runXml) => {
    if (/<w:drawing[\s>]/.test(runXml)) {
      const embedMatch = runXml.match(/r:embed="([^"]+)"/);
      if (!embedMatch) return "";
      const embedId = embedMatch[1];
      const rawTarget = rels[embedId];
      if (!rawTarget) return "";
      const imagePath = rawTarget.startsWith("word/") ? rawTarget : "word/" + rawTarget;
      const imageFile = zip.file(imagePath);
      if (!imageFile) return "";

      const cxMatch = runXml.match(/cx="(\d+)"/);
      const cyMatch = runXml.match(/cy="(\d+)"/);
      const cx = cxMatch ? cxMatch[1] : "0";
      const cy = cyMatch ? cyMatch[1] : "0";
      const width = emuToPx(cx);
      const height = emuToPx(cy);

      const imageBuffer = await imageFile.async("base64");
      const ext = imagePath.split(".").pop()?.toLowerCase() || "png";
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
        : ext === "png" ? "image/png"
        : ext === "gif" ? "image/gif"
        : ext === "svg" ? "image/svg+xml"
        : ext === "bmp" ? "image/bmp"
        : ext === "webp" ? "image/webp"
        : "image/png";

      const dimStyle = width ? `max-width: 100%; width: ${width}px; height: ${height}px; display: inline-block; vertical-align: middle` : `max-width: 100%; display: inline-block; vertical-align: middle`;
      return `<img src="data:${mime};base64,${imageBuffer}" style="${dimStyle}" alt="" />`;
    }

    const tMatch = runXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
    if (!tMatch) return "";
    const text = tMatch[1];

    const rPrMatch = runXml.match(/<w:rPr[\s>][\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";
    const inlineStyles: string[] = [];

    if (/<w:b[\s>\/]/.test(rPr)) inlineStyles.push("font-weight: bold");
    if (/<w:i[\s>\/]/.test(rPr)) inlineStyles.push("font-style: italic");
    if (/<w:u[\s>\/]/.test(rPr)) inlineStyles.push("text-decoration: underline");
    if (/<w:strike[\s>\/]/.test(rPr)) inlineStyles.push("text-decoration: line-through");
    const szMatch = rPr.match(/<w:sz\s+w:val="(\d+)"/);
    if (szMatch) inlineStyles.push(`font-size: ${parseInt(szMatch[1]) / 2}pt`);
    const colorMatch = rPr.match(/<w:color\s+w:val="([^"]+)"/);
    if (colorMatch) inlineStyles.push(`color: #${colorMatch[1]}`);

    const styleAttr = inlineStyles.length > 0 ? ` style="${inlineStyles.join("; ")}"` : "";
    return `<span${styleAttr}>${escapeHtml(text)}</span>`;
  }));

  return parts.join("");
}

async function processPara(paraXml: string, zip: any, rels: Record<string, string>): Promise<string> {
  const pPrMatch = paraXml.match(/<w:pPr[\s>][\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : "";
  const styles = parseStylesFromPPr(pPr);
  const innerHtml = await extractParaContent(paraXml, zip, rels);
  if (!innerHtml) return "";
  if (!innerHtml.replace(/<[^>]+>/g, "").trim() && !/<img[\s>]/i.test(innerHtml)) return "";
  if (!styles.some(s => s.startsWith("margin-top"))) styles.push("margin-top: 0");
  if (!styles.some(s => s.startsWith("margin-bottom"))) styles.push("margin-bottom: 0");
  const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
  return `<p${styleAttr}>${innerHtml}</p>`;
}

async function processTable(tblXml: string, zip: any, rels: Record<string, string>): Promise<string> {
  // Check for table width
  const tblWMatch = tblXml.match(/<w:tblW\s+w:w="(\d+)"\s+w:type="([^"]+)"/);
  let tableStyle = "";
  if (tblWMatch && tblWMatch[2] === "dxa") {
    tableStyle = ` style="width: ${twipToPt(tblWMatch[1])}"`;
  }

  const rowRegex = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
  const rows: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(tblXml)) !== null) {
    rows.push(m[0]);
  }

  const rowHtmls = await Promise.all(rows.map(async (rowXml) => {
    const cellRegex = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
    const cells: string[] = [];
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(rowXml)) !== null) {
      cells.push(cm[0]);
    }

    const cellHtmls = await Promise.all(cells.map(async (cellXml) => {
      // Cell width
      const tcWMatch = cellXml.match(/<w:tcW\s+w:w="(\d+)"/);
      let cellStyle = "";
      if (tcWMatch) {
        cellStyle = ` style="width: ${twipToPt(tcWMatch[1])}; vertical-align: middle"`;
      }

      // Colspan
      let colspan = "";
      const gridSpan = cellXml.match(/<w:gridSpan\s+w:val="(\d+)"/);
      if (gridSpan && gridSpan[1] !== "1") colspan = ` colspan="${gridSpan[1]}"`;

      // Process paragraphs inside cell
      const cellParas = cellXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
      const cellContent = await Promise.all(cellParas.map(p => processPara(p, zip, rels)));
      const inner = cellContent.filter(c => c).join("\n");

      return `    <td${colspan}${cellStyle}>\n${inner}\n    </td>`;
    }));

    return `  <tr>\n${cellHtmls.join("\n")}\n  </tr>`;
  }));

  return `<table${tableStyle}>\n${rowHtmls.join("\n")}\n</table>`;
}

export async function docxToHtml(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const docXmlStr = await zip.file("word/document.xml")?.async("string");
  if (!docXmlStr) throw new Error("Invalid docx: missing document.xml");

  // Read relationships
  const relsXmlStr = await zip.file("word/_rels/document.xml.rels")?.async("string");
  const rels: Record<string, string> = {};
  if (relsXmlStr) {
    const relList = relsXmlStr.match(/<Relationship[^>]*\/>/g) || [];
    for (const rel of relList) {
      const idMatch = rel.match(/Id="([^"]+)"/);
      const targetMatch = rel.match(/Target="([^"]+)"/);
      if (idMatch && targetMatch) rels[idMatch[1]] = targetMatch[1];
    }
  }

  // Extract body content
  const bodyMatch = docXmlStr.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error("Invalid docx: missing body");
  const bodyXml = bodyMatch[1];

  // Match both paragraphs and tables in document order
  const blockRegex = /<w:p[\s>][\s\S]*?<\/w:p>|<w:tbl[\s>][\s\S]*?<\/w:tbl>/g;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(bodyXml)) !== null) {
    blocks.push(m[0]);
  }

  const parts: string[] = [];
  for (const block of blocks) {
    if (block.startsWith("<w:tbl")) {
      parts.push(await processTable(block, zip, rels));
    } else {
      parts.push(await processPara(block, zip, rels));
    }
  }

  // Also check for images in headers/footers
  const hfParts: string[] = [];
  for (const path of Object.keys(zip.files)) {
    if ((path.startsWith("word/header") || path.startsWith("word/footer")) && !zip.files[path].dir) {
      const hfXml = await zip.files[path].async("string");
      const hfParas = hfXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
      for (const paraXml of hfParas) {
        const innerHtml = await extractParaContent(paraXml, zip, rels);
        if (innerHtml) hfParts.push(innerHtml);
      }
    }
  }

  return [...hfParts, ...parts].join("\n");
}
