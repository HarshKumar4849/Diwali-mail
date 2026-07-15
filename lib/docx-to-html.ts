function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseParagraphStyles(pPr: Element | null): string[] {
  const styles: string[] = [];
  if (!pPr) return styles;

  const jc = pPr.querySelector("w\\:jc, jc");
  if (jc) {
    const val = jc.getAttribute("w:val");
    if (val && val !== "left") {
      styles.push(`text-align: ${val === "both" ? "justify" : val}`);
    }
  }

  const ind = pPr.querySelector("w\\:ind, ind");
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

  const spacing = pPr?.querySelector("w\\:spacing, spacing");
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

function parseRun(run: Element): string {
  const rPr = run.querySelector("w\\:rPr, rPr");
  const textEl = run.querySelector("w\\:t, t");
  if (!textEl) return "";
  const text = textEl.textContent || "";

  const bold = rPr?.querySelector("w\\:b, b");
  const italic = rPr?.querySelector("w\\:i, i");
  const underline = rPr?.querySelector("w\\:u, u");
  const strike = rPr?.querySelector("w\\:strike, strike");
  const sz = rPr?.querySelector("w\\:sz, sz");
  const color = rPr?.querySelector("w\\:color, color");
  const highlight = rPr?.querySelector("w\\:highlight, highlight");

  const inlineStyles: string[] = [];

  if (bold) inlineStyles.push("font-weight: bold");
  if (italic) inlineStyles.push("font-style: italic");
  if (underline) inlineStyles.push("text-decoration: underline");
  if (strike) inlineStyles.push("text-decoration: line-through");
  if (sz) inlineStyles.push(`font-size: ${parseInt(sz.getAttribute("w:val") || "0") / 2}pt`);
  if (color) inlineStyles.push(`color: #${color.getAttribute("w:val")}`);
  if (highlight) inlineStyles.push(`background-color: ${highlight.getAttribute("w:val")}`);

  const styleAttr = inlineStyles.length > 0 ? ` style="${inlineStyles.join("; ")}"` : "";
  return `<span${styleAttr}>${escapeHtml(text)}</span>`;
}

export async function docxToHtml(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const docXmlStr = await zip.file("word/document.xml")?.async("string");
  if (!docXmlStr) throw new Error("Invalid docx: missing document.xml");

  const parser = new DOMParser();
  const doc = parser.parseFromString(docXmlStr, "text/xml");

  const paragraphs = doc.querySelectorAll("w\\:p, p");
  const parts: string[] = [];

  for (const p of paragraphs) {
    const pPr = p.querySelector("w\\:pPr, pPr");
    const styles = parseParagraphStyles(pPr);

    const runs = p.querySelectorAll("w\\:r, r");
    let innerHtml = "";
    for (const run of runs) {
      innerHtml += parseRun(run);
    }

    if (innerHtml) {
      const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
      parts.push(`<p${styleAttr}>${innerHtml}</p>`);
    }
  }

  return parts.join("\n");
}