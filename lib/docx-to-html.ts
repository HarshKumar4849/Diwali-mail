/* eslint-disable @typescript-eslint/no-explicit-any */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function findChild(parent: Element, localName: string): Element | null {
  for (const child of parent.children) {
    if (child.localName === localName) return child;
  }
  return null;
}

function findAllChildren(parent: Element, localName: string): Element[] {
  const result: Element[] = [];
  for (const child of parent.children) {
    if (child.localName === localName) result.push(child);
  }
  return result;
}

function parseParagraphStyles(pPr: Element | null): string[] {
  const styles: string[] = [];
  if (!pPr) return styles;

  const jc = findChild(pPr, "jc");
  if (jc) {
    const val = jc.getAttribute("w:val");
    if (val && val !== "left") {
      styles.push(`text-align: ${val === "both" ? "justify" : val}`);
    }
  }

  const ind = findChild(pPr, "ind");
  if (ind) {
    const left = ind.getAttribute("w:left") || ind.getAttribute("left");
    const right = ind.getAttribute("w:right") || ind.getAttribute("right");
    const firstLine = ind.getAttribute("w:firstLine") || ind.getAttribute("firstLine");
    const hanging = ind.getAttribute("w:hanging") || ind.getAttribute("hanging");
    if (left) styles.push(`margin-left: ${parseInt(left) / 20}pt`);
    if (right) styles.push(`margin-right: ${parseInt(right) / 20}pt`);
    if (firstLine) styles.push(`text-indent: ${parseInt(firstLine) / 20}pt`);
    if (hanging) styles.push(`text-indent: -${parseInt(hanging) / 20}pt`);
  }

  const spacing = findChild(pPr, "spacing");
  if (spacing) {
    const before = spacing.getAttribute("w:before") || spacing.getAttribute("before");
    const after = spacing.getAttribute("w:after") || spacing.getAttribute("after");
    const line = spacing.getAttribute("w:line") || spacing.getAttribute("line");
    if (before) styles.push(`margin-top: ${parseInt(before) / 20}pt`);
    if (after) styles.push(`margin-bottom: ${parseInt(after) / 20}pt`);
    if (line) styles.push(`line-height: ${parseInt(line) / 240}`);
  }

  return styles;
}

function parseRun(run: Element, rawXml: string): string {
  const drawingEl = findChild(run, "drawing") || findChild(run, "pict");
  if (drawingEl) return "";

  const rPr = findChild(run, "rPr");
  const textEl = findChild(run, "t");
  if (!textEl) return "";
  const text = textEl.textContent || "";

  const inlineStyles: string[] = [];
  if (rPr) {
    if (findChild(rPr, "b")) inlineStyles.push("font-weight: bold");
    if (findChild(rPr, "i")) inlineStyles.push("font-style: italic");
    if (findChild(rPr, "u")) inlineStyles.push("text-decoration: underline");
    if (findChild(rPr, "strike")) inlineStyles.push("text-decoration: line-through");
    const sz = findChild(rPr, "sz");
    if (sz) inlineStyles.push(`font-size: ${parseInt(sz.getAttribute("w:val") || "0") / 2}pt`);
    const color = findChild(rPr, "color");
    if (color) inlineStyles.push(`color: #${color.getAttribute("w:val")}`);
    const highlight = findChild(rPr, "highlight");
    if (highlight) inlineStyles.push(`background-color: ${highlight.getAttribute("w:val")}`);
  }

  const styleAttr = inlineStyles.length > 0 ? ` style="${inlineStyles.join("; ")}"` : "";
  return `<span${styleAttr}>${escapeHtml(text)}</span>`;
}

async function extractImageFromXml(rawXml: string, zip: Record<string, any>, rels: Record<string, string>): Promise<string> {
  const embedMatch = rawXml.match(/r:embed=\"([^\"]+)\"/);
  if (!embedMatch) return "";

  const embedId = embedMatch[1];
  const rawTarget = rels[embedId];
  if (!rawTarget) return "";

  const imagePath = rawTarget.startsWith("word/") ? rawTarget : "word/" + rawTarget;
  const imageFile = zip.file(imagePath);
  if (!imageFile) return "";

  const cxMatch = rawXml.match(/cx=\"(\d+)\"/);
  const cyMatch = rawXml.match(/cy=\"(\d+)\"/);
  const cx = cxMatch ? cxMatch[1] : "0";
  const cy = cyMatch ? cyMatch[1] : "0";
  const width = Math.round(parseInt(cx) / 914400 * 96);
  const height = Math.round(parseInt(cy) / 914400 * 96);

  const imageBuffer = await imageFile.async("base64");
  const ext = imagePath.split(".").pop()?.toLowerCase() || "png";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "png" ? "image/png"
    : ext === "gif" ? "image/gif"
    : ext === "svg" ? "image/svg+xml"
    : ext === "bmp" ? "image/bmp"
    : ext === "webp" ? "image/webp"
    : "image/png";

  const dimStyle = width ? ` style="max-width: 100%; width: ${width}px; height: ${height}px"` : ` style="max-width: 100%"`;
  return `<img src="data:${mime};base64,${imageBuffer}"${dimStyle} alt="" />`;
}

export async function docxToHtml(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const docXmlStr = await zip.file("word/document.xml")?.async("string");
  if (!docXmlStr) throw new Error("Invalid docx: missing document.xml");

  const relsXmlStr = await zip.file("word/_rels/document.xml.rels")?.async("string");

  const rels: Record<string, string> = {};
  if (relsXmlStr) {
    const relsDoc = new DOMParser().parseFromString(relsXmlStr, "text/xml");
    for (const rel of findAllChildren(relsDoc.documentElement, "Relationship")) {
      const id = rel.getAttribute("Id") || "";
      const target = rel.getAttribute("Target") || "";
      if (id && target) rels[id] = target;
    }
  }

  // Split the docx XML by paragraphs to preserve raw XML for regex matching
  const paraRegex = /(<w:p[\s\S]*?<\/w:p>)/g;
  const paraMatches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = paraRegex.exec(docXmlStr)) !== null) {
    paraMatches.push(m[1]);
  }

  const parts: string[] = [];

  for (const paraXml of paraMatches) {
    // Use DOMParser for text/formatting (works reliably for simple elements)
    const doc = new DOMParser().parseFromString(paraXml, "text/xml");
    const p = doc.documentElement;
    const pPr = findChild(p, "pPr");
    const styles = parseParagraphStyles(pPr);

    const runs = findAllChildren(p, "r");
    let innerHtml = "";

    for (const run of runs) {
      const textPart = parseRun(run, paraXml);
      if (textPart) {
        innerHtml += textPart;
      } else if (findChild(run, "drawing") || findChild(run, "pict")) {
        // Use regex on raw XML to find images (avoids DOMParser namespace issues)
        innerHtml += await extractImageFromXml(paraXml, zip, rels);
      }
    }

    if (innerHtml) {
      const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
      parts.push(`<p${styleAttr}>${innerHtml}</p>`);
    }
  }

  return parts.join("\n");
}
