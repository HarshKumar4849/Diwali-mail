import type JSZip from "jszip";

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

function findDescendant(parent: Element, localName: string): Element | null {
  for (const child of parent.children) {
    if (child.localName === localName) return child;
    const found = findDescendant(child, localName);
    if (found) return found;
  }
  return null;
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

function parseRunContent(run: Element): string {
  const rPr = findChild(run, "rPr");
  const textEl = findChild(run, "t");
  const drawingEl = findChild(run, "drawing") || findChild(run, "pict");
  if (drawingEl) return "";
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

function getAllDescendants(root: Element): Element[] {
  const result: Element[] = [];
  function walk(node: Element) {
    for (const child of node.children) {
      result.push(child);
      walk(child);
    }
  }
  walk(root);
  return result;
}

function emuToPx(emu: string): number {
  const val = parseInt(emu, 10);
  if (isNaN(val)) return 0;
  return Math.round(val / 914400 * 96);
}

async function extractImage(
  parent: Element,
  zip: JSZip,
  rels: Record<string, string>
): Promise<string> {
  const allElements = getAllDescendants(parent);
  allElements.unshift(parent);

  let embedId = "";
  let cx = "0";
  let cy = "0";

  for (const el of allElements) {
    embedId = el.getAttribute("r:embed") || el.getAttribute("r:id")
           || el.getAttribute("embed") || el.getAttribute("id") || "";
    if (embedId) break;
  }

  if (!embedId) return "";

  const rawTarget = rels[embedId];
  if (!rawTarget) return "";

  // Resolve path: rels targets are relative to word/
  const imagePath = rawTarget.startsWith("word/") ? rawTarget : "word/" + rawTarget;

  const imageFile = zip.file(imagePath);
  if (!imageFile) return "";

  // Get dimensions from the drawing extent
  const extent = findDescendant(parent, "extent");
  if (extent) {
    cx = extent.getAttribute("cx") || "0";
    cy = extent.getAttribute("cy") || "0";
  }

  const imageBuffer = await imageFile.async("base64");
  const ext = imagePath.split(".").pop()?.toLowerCase() || "png";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "png" ? "image/png"
    : ext === "gif" ? "image/gif"
    : ext === "svg" ? "image/svg+xml"
    : ext === "bmp" ? "image/bmp"
    : ext === "webp" ? "image/webp"
    : "image/png";

  const width = emuToPx(cx);
  const height = emuToPx(cy);
  const styleAttr = width ? ` style="max-width: 100%; width: ${width}px; height: ${height}px"` : ` style="max-width: 100%"`;
  return `<img src="data:${mime};base64,${imageBuffer}"${styleAttr} alt="" />`;
}

async function parseImageRun(run: Element, zip: JSZip, rels: Record<string, string>): Promise<string> {
  const drawing = findChild(run, "drawing") || findChild(run, "pict");
  if (!drawing) return "";
  return extractImage(drawing, zip, rels);
}

async function parseXmlPart(
  xmlStr: string,
  zip: JSZip,
  rels: Record<string, string>
): Promise<string> {
  const doc = new DOMParser().parseFromString(xmlStr, "text/xml");
  const body = findChild(doc.documentElement, "body") || doc.documentElement;
  const paragraphs = findAllChildren(body, "p");
  const parts: string[] = [];

  for (const p of paragraphs) {
    const pPr = findChild(p, "pPr");
    const styles = parseParagraphStyles(pPr);

    const runs = findAllChildren(p, "r");
    let innerHtml = "";
    for (const run of runs) {
      const textPart = parseRunContent(run);
      if (textPart) {
        innerHtml += textPart;
      } else {
        innerHtml += await parseImageRun(run, zip, rels);
      }
    }

    if (innerHtml) {
      const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
      parts.push(`<p${styleAttr}>${innerHtml}</p>`);
    }
  }

  return parts.join("\n");
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

  const bodyHtml = await parseXmlPart(docXmlStr, zip, rels);

  // Also check for images in headers/footers
  const headerFooterParts: string[] = [];
  for (const path of Object.keys(zip.files)) {
    if (path.startsWith("word/header") || path.startsWith("word/footer")) {
      const hfXml = await zip.file(path)?.async("string");
      if (hfXml) {
        const hfPart = await parseXmlPart(hfXml, zip, rels);
        if (hfPart) headerFooterParts.push(hfPart);
      }
    }
  }

  const allParts = [...headerFooterParts, bodyHtml];
  return allParts.join("\n");
}
