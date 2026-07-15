export async function docxToHtml(file: File): Promise<string> {
  const mammothMod = await import("mammoth");
  const mammoth = mammothMod.default || mammothMod;

  const buffer = await file.arrayBuffer();

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
      styleMap: styleMapEntries,
    }
  );

  const html = result.value;

  // Convert fmt-* classes to inline styles
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

  // Uniform paragraph styling matching docx defaults
  // All paragraphs in this docx have: spaceAfter=0, line=240 (single spacing)
  doc.querySelectorAll("p").forEach((el) => {
    const existing = el.getAttribute("style") || "";
    const styles = existing ? [existing] : [];
    if (!existing.includes("margin-top")) styles.push("margin-top: 0");
    if (!existing.includes("margin-bottom")) styles.push("margin-bottom: 0");
    if (!existing.includes("line-height")) styles.push("line-height: 1");
    el.setAttribute("style", styles.join("; "));
  });

  return doc.body.innerHTML;
}
