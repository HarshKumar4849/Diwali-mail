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

interface ParaStyle {
  alignment: string | null;
  indentLeft: string | null;
  indentFirstLine: string | null;
  indentHanging: string | null;
  spacingBefore: string | null;
  spacingAfter: string | null;
  spacingLine: string | null;
}

function extractParagraphStyles(xmlStr: string): ParaStyle[] {
  const doc = new DOMParser().parseFromString(xmlStr, "text/xml");
  const body = findChild(doc.documentElement, "body") || doc.documentElement;
  const paragraphs = findAllChildren(body, "p");
  const styles: ParaStyle[] = [];

  for (const p of paragraphs) {
    const pPr = findChild(p, "pPr");
    const style: ParaStyle = {
      alignment: null,
      indentLeft: null,
      indentFirstLine: null,
      indentHanging: null,
      spacingBefore: null,
      spacingAfter: null,
      spacingLine: null,
    };

    if (pPr) {
      const jc = findChild(pPr, "jc");
      if (jc) {
        const val = jc.getAttribute("w:val");
        if (val && val !== "left") {
          style.alignment = val === "both" ? "justify" : val;
        }
      }

      const ind = findChild(pPr, "ind");
      if (ind) {
        style.indentLeft = ind.getAttribute("w:left") || null;
        style.indentFirstLine = ind.getAttribute("w:firstLine") || null;
        style.indentHanging = ind.getAttribute("w:hanging") || null;
      }

      const spacing = findChild(pPr, "spacing");
      if (spacing) {
        style.spacingBefore = spacing.getAttribute("w:before") || null;
        style.spacingAfter = spacing.getAttribute("w:after") || null;
        style.spacingLine = spacing.getAttribute("w:line") || null;
      }
    }

    styles.push(style);
  }

  return styles;
}

function applyStylesToHtml(html: string, styles: ParaStyle[]): string {
  // Split HTML into paragraph chunks
  const pRegex = /<p[^>]*>[\s\S]*?<\/p>/g;
  const parts: string[] = [];
  let lastIdx = 0;
  let styleIdx = 0;

  let match: RegExpExecArray | null;
  while ((match = pRegex.exec(html)) !== null) {
    parts.push(html.slice(lastIdx, match.index));

    const pTag = match[0];
    const style = styles[styleIdx] || null;
    styleIdx++;

    if (style) {
      const cssParts: string[] = [];
      if (style.alignment) cssParts.push(`text-align: ${style.alignment}`);
      if (style.indentLeft) cssParts.push(`margin-left: ${parseInt(style.indentLeft) / 20}pt`);
      if (style.indentFirstLine) cssParts.push(`text-indent: ${parseInt(style.indentFirstLine) / 20}pt`);
      if (style.indentHanging) cssParts.push(`text-indent: -${parseInt(style.indentHanging) / 20}pt`);
      if (style.spacingBefore) cssParts.push(`margin-top: ${parseInt(style.spacingBefore) / 20}pt`);
      if (style.spacingAfter) cssParts.push(`margin-bottom: ${parseInt(style.spacingAfter) / 20}pt`);
      if (style.spacingLine) cssParts.push(`line-height: ${parseInt(style.spacingLine) / 240}`);

      if (cssParts.length > 0) {
        const existingStyle = pTag.match(/style="([^"]*)"/);
        if (existingStyle) {
          const newTag = pTag.replace(`style="${existingStyle[1]}"`, `style="${existingStyle[1]}; ${cssParts.join("; ")}"`);
          parts.push(newTag);
        } else {
          const newTag = pTag.replace("<p", `<p style="${cssParts.join("; ")}"`);
          parts.push(newTag);
        }
      } else {
        parts.push(pTag);
      }
    } else {
      parts.push(pTag);
    }

    lastIdx = match.index + match[0].length;
  }

  parts.push(html.slice(lastIdx));
  return parts.join("");
}

export async function docxToHtml(file: File): Promise<string> {
  const [mammothMod, JSZipMod] = await Promise.all([
    import("mammoth"),
    import("jszip"),
  ]);
  const mammoth = mammothMod.default || mammothMod;
  const JSZip = JSZipMod.default || JSZipMod;

  const buffer = await file.arrayBuffer();

  // Step 1: Extract paragraph styles from XML
  const zip = await JSZip.loadAsync(buffer);
  const docXmlStr = await zip.file("word/document.xml")?.async("string");
  let paraStyles: ParaStyle[] = [];
  if (docXmlStr) {
    paraStyles = extractParagraphStyles(docXmlStr);
  }

  // Step 2: Use mammoth for conversion (handles images, text, run formatting)
  // Use transformDocument + styleMap for alignment and indentation
  let fmtCounter = 0;
  const fmtStyles: Record<string, string> = {};
  const styleMapEntries: string[] = [];

  const transformParagraph = (element: Record<string, unknown>) => {
    const styles: string[] = [];

    if (element.alignment && element.alignment !== "left") {
      styles.push(`text-align: ${element.alignment}`);
    }

    if (element.indent) {
      const indent = element.indent as Record<string, string>;
      if (indent.start) styles.push(`margin-left: ${indent.start}pt`);
      if (indent.firstLine) styles.push(`text-indent: ${indent.firstLine}pt`);
      if (indent.hanging) styles.push(`text-indent: -${indent.hanging}pt`);
    }

    if (styles.length > 0) {
      const key = styles.join("; ");
      if (!fmtStyles[key]) {
        fmtCounter++;
        const cls = `fmt-${fmtCounter}`;
        fmtStyles[key] = cls;
        styleMapEntries.push(`p[style-name='${cls}'] => p.${cls}`);
      }
      return { ...element, styleName: fmtStyles[key] };
    }
    return element;
  };

  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transformDocument: (mammoth as any).transforms.paragraph(transformParagraph),
      ignoreEmptyParagraphs: false,
      styleMap: styleMapEntries,
    }
  );

  let html = result.value;

  // Step 3: Convert fmt-* classes to inline styles
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const reverseMap: Record<string, string> = {};
  for (const [style, cls] of Object.entries(fmtStyles)) {
    reverseMap[cls] = style;
  }

  doc.querySelectorAll("[class]").forEach((el) => {
    const classes = el.getAttribute("class")?.split(" ") || [];
    const fmtClass = classes.find((c) => c.startsWith("fmt-"));
    if (fmtClass && reverseMap[fmtClass]) {
      el.removeAttribute("class");
      el.setAttribute("style", reverseMap[fmtClass]);
    }
  });

  html = doc.body.innerHTML;

  // Step 4: Apply paragraph spacing from XML
  html = applyStylesToHtml(html, paraStyles);

  return html;
}
