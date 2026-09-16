/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * HTML-escapes plain text for safe insertion into HTML documents.
 * Protects against double-encoding by not re-escaping existing valid HTML entities:
 * named entities (&amp;, &lt;, &gt;, &quot;, &apos;, &nbsp;), decimal (&#123;), or hex (&#x1F;).
 */
export function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    // Replace ampersand ONLY if it is not part of an existing valid HTML/XML entity
    .replace(/&(?!(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Decodes XML entities found inside Word OpenXML document.xml nodes.
 * Word encodes ampersands and special characters as &amp;, &lt;, &gt;, &quot;, &apos;,
 * as well as numeric decimal/hexadecimal entities.
 * We decode them back to raw characters before canonical HTML escaping so that
 * characters like & in "Johnson & Johnson" are not double-escaped to &amp;amp;.
 */
export function decodeXmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return "";
      }
    });
}

/**
 * Validates that a hyperlink URL uses a safe web scheme.
 * Allows http, https, mailto, tel, and fragment (#) anchors.
 * Rejects javascript:, data:, vbscript:, and unknown schemes.
 */
export function isSafeUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    (trimmed.startsWith("{{") && trimmed.endsWith("}}"))
  ) {
    return true;
  }
  const match = trimmed.match(/^([a-zA-Z0-9+.-]+):/);
  if (!match) return false;
  const scheme = match[1].toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel";
}

const COMMON_BUSINESS_HEADINGS = new Set([
  "about the summit",
  "meeting details",
  "partnership opportunities",
  "key areas",
  "agenda",
  "event overview",
  "summit details",
  "next steps",
  "discussion points",
  "company overview",
  "objectives",
  "action items",
  "schedule",
  "overview",
  "summary",
  "details",
  "important information",
  "event highlights",
  "partnership information",
]);

function emuToPx(emu: string): number {
  return Math.round((parseInt(emu, 10) / 914400) * 96);
}

function twipToPt(twip: string): string {
  return (parseInt(twip, 10) / 20).toFixed(1) + "pt";
}

interface RunStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  fontSize?: string;
  color?: string;
}

function parseRunProperties(rPrXml: string): RunStyle {
  if (!rPrXml) {
    return { bold: false, italic: false, underline: false, strike: false };
  }

  // Bold check: <w:b/> or <w:b w:val="1|true"/>, exclude w:val="0|false"
  const bMatch = rPrXml.match(/<w:b(?:\s+w:val="([^"]+)")?\s*\/?>/);
  const bold = !!bMatch && bMatch[1] !== "0" && bMatch[1] !== "false";

  // Italic check: <w:i/> or <w:i w:val="1|true"/>, exclude w:val="0|false"
  const iMatch = rPrXml.match(/<w:i(?:\s+w:val="([^"]+)")?\s*\/?>/);
  const italic = !!iMatch && iMatch[1] !== "0" && iMatch[1] !== "false";

  // Underline check: <w:u/> or <w:u w:val="..."/>, exclude w:val="none"
  const uMatch = rPrXml.match(/<w:u(?:\s+w:val="([^"]+)")?\s*\/?>/);
  const underline = !!uMatch && uMatch[1] !== "none";

  // Strikethrough check
  const strikeMatch = rPrXml.match(/<w:strike(?:\s+w:val="([^"]+)")?\s*\/?>/);
  const strike = !!strikeMatch && strikeMatch[1] !== "0" && strikeMatch[1] !== "false";

  const szMatch = rPrXml.match(/<w:sz\s+w:val="(\d+)"/);
  const fontSize = szMatch ? `${parseInt(szMatch[1], 10) / 2}pt` : undefined;

  const colorMatch = rPrXml.match(/<w:color\s+w:val="([0-9a-fA-F]{6})"/);
  const color = colorMatch ? `#${colorMatch[1]}` : undefined;

  return { bold, italic, underline, strike, fontSize, color };
}

function parseStylesFromPPr(pPr: string): { styles: string[]; headingTag?: string; numPr?: { numId: string; ilvl: number } } {
  const styles: string[] = [];
  let headingTag: string | undefined;
  let numPr: { numId: string; ilvl: number } | undefined;

  if (!pPr) return { styles };

  // Heading check from <w:pStyle w:val="Heading1"/>
  const pStyleMatch = pPr.match(/<w:pStyle\s+w:val="([^"]+)"/i);
  if (pStyleMatch) {
    const styleVal = pStyleMatch[1].toLowerCase().replace(/[\s_-]+/g, "");
    if (/^heading([1-6])$/.test(styleVal)) {
      const level = styleVal.replace("heading", "");
      headingTag = `h${level}`;
    } else if (styleVal === "title") {
      headingTag = "h1";
    } else if (styleVal === "subtitle") {
      headingTag = "h2";
    }
  }

  // Numbering / list check
  const numIdMatch = pPr.match(/<w:numId\s+w:val="(\d+)"/);
  const ilvlMatch = pPr.match(/<w:ilvl\s+w:val="(\d+)"/);
  if (numIdMatch && numIdMatch[1] !== "0") {
    numPr = {
      numId: numIdMatch[1],
      ilvl: ilvlMatch ? parseInt(ilvlMatch[1], 10) : 0,
    };
  } else if (pStyleMatch) {
    // Also detect ListBullet / ListNumber paragraph styles
    const pStyleLower = pStyleMatch[1].toLowerCase();
    if (pStyleLower.includes("bullet") || pStyleLower.includes("listbullet")) {
      numPr = { numId: "bullet-style", ilvl: 0 };
    } else if (pStyleLower.includes("number") || pStyleLower.includes("listnumber")) {
      numPr = { numId: "decimal-style", ilvl: 0 };
    }
  }

  // Alignment
  const jcMatch = pPr.match(/<w:jc\s+w:val="([^"]+)"/);
  if (jcMatch && jcMatch[1] !== "left") {
    styles.push(`text-align: ${jcMatch[1] === "both" ? "justify" : jcMatch[1]}`);
  }

  // Indentation
  const indMatch = pPr.match(/<w:ind[^>]*>/);
  if (indMatch) {
    const left = indMatch[0].match(/w:left="(\d+)"/);
    const firstLine = indMatch[0].match(/w:firstLine="(\d+)"/);
    const hanging = indMatch[0].match(/w:hanging="(\d+)"/);
    if (left) styles.push(`margin-left: ${twipToPt(left[1])}`);
    if (firstLine) styles.push(`text-indent: ${twipToPt(firstLine[1])}`);
    if (hanging) styles.push(`text-indent: -${twipToPt(hanging[1])}`);
  }

  // Spacing
  const spacingMatch = pPr.match(/<w:spacing[^>]*\/>/);
  if (spacingMatch) {
    const before = spacingMatch[0].match(/w:before="(\d+)"/);
    const after = spacingMatch[0].match(/w:after="(\d+)"/);
    const line = spacingMatch[0].match(/w:line="(\d+)"/);
    if (before) styles.push(`margin-top: ${twipToPt(before[1])}`);
    if (after) styles.push(`margin-bottom: ${twipToPt(after[1])}`);
    if (line) styles.push(`line-height: ${(parseInt(line[1], 10) / 240).toFixed(2)}`);
  }

  return { styles, headingTag, numPr };
}

async function processRun(
  runXml: string,
  zip: any,
  rels: Record<string, string>,
  isPlain: boolean
): Promise<string> {
  // 1. Drawing / embedded images
  if (/<w:drawing[\s>]/.test(runXml)) {
    if (isPlain) return "";
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
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
        ? "image/png"
        : ext === "gif"
        ? "image/gif"
        : ext === "svg"
        ? "image/svg+xml"
        : ext === "bmp"
        ? "image/bmp"
        : ext === "webp"
        ? "image/webp"
        : "image/png";

    const dimStyle = width
      ? `max-width: 100%; width: ${width}px; height: ${height}px; display: inline-block; vertical-align: middle`
      : `max-width: 100%; display: inline-block; vertical-align: middle`;
    return `<img src="data:${mime};base64,${imageBuffer}" style="${dimStyle}" alt="" />`;
  }

  // 2. Extract run text and inline elements in document order
  const rPrMatch = runXml.match(/<w:rPr[\s>][\s\S]*?<\/w:rPr>/);
  const style = parseRunProperties(rPrMatch ? rPrMatch[0] : "");

  const innerRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>|<w:br(?:\s+[^>]*)?\/>|<w:cr\s*\/?>|<w:tab\s*\/?>/g;
  let content = "";
  let match: RegExpExecArray | null;

  while ((match = innerRegex.exec(runXml)) !== null) {
    const fullTag = match[0];
    if (fullTag.startsWith("<w:tab")) {
      content += isPlain ? "\t" : "&nbsp;&nbsp;&nbsp;&nbsp;";
    } else if (fullTag.startsWith("<w:br") || fullTag.startsWith("<w:cr")) {
      content += isPlain ? "\n" : "<br />";
    } else if (fullTag.startsWith("<w:t>") || fullTag.startsWith("<w:t ")) {
      const rawText = match[1] ?? "";
      const decoded = decodeXmlEntities(rawText);
      const cleaned = decoded
        .replace(/\\&/g, "&")
        .replace(/mailto\\:/gi, "mailto:")
        .replace(/(\d+)\\\./g, "$1.")
        .replace(/\\([#*_\[\]\\!.:\-])/g, "$1");
      content += isPlain ? cleaned : escapeHtml(cleaned);
    }
  }

  if (!content) return "";
  if (isPlain) return content;

  // Build inline styling
  const inlineStyles: string[] = [];
  if (style.bold) inlineStyles.push("font-weight: bold");
  if (style.italic) inlineStyles.push("font-style: italic");
  if (style.underline) inlineStyles.push("text-decoration: underline");
  if (style.strike) inlineStyles.push("text-decoration: line-through");
  if (style.fontSize) inlineStyles.push(`font-size: ${style.fontSize}`);
  if (style.color) inlineStyles.push(`color: ${style.color}`);

  if (inlineStyles.length === 0) {
    return content;
  }

  return `<span style="${inlineStyles.join("; ")}">${content}</span>`;
}

async function extractParaElements(
  paraXml: string,
  zip: any,
  rels: Record<string, string>,
  isPlain: boolean
): Promise<{ text: string; rawTextForUrlCompare: string }> {
  // Tokenize child elements: <w:hyperlink> and standalone <w:r>
  const childRegex = /<w:hyperlink[\s\S]*?<\/w:hyperlink>|<w:r[\s>][\s\S]*?<\/w:r>/g;
  const elements: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = childRegex.exec(paraXml)) !== null) {
    elements.push(m[0]);
  }

  const results = await Promise.all(
    elements.map(async (elemXml) => {
      if (elemXml.startsWith("<w:hyperlink")) {
        // Parse hyperlink
        const rIdMatch = elemXml.match(/r:id="([^"]+)"/);
        const anchorMatch = elemXml.match(/w:anchor="([^"]+)"/);
        let target = "";
        if (rIdMatch && rels[rIdMatch[1]]) {
          target = rels[rIdMatch[1]];
        }
        if (anchorMatch) {
          target = target ? `${target}#${anchorMatch[1]}` : `#${anchorMatch[1]}`;
        }

        // Parse runs inside hyperlink
        const innerRuns = elemXml.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) || [];
        const runContents = await Promise.all(
          innerRuns.map((r) => processRun(r, zip, rels, isPlain))
        );
        const innerText = runContents.join("");

        if (!target || !isSafeUrl(target)) {
          return { html: innerText, plain: innerText };
        }

        // Clean target URL and escape for HTML attribute
        const cleanTarget = target.trim();
        const safeHref = escapeHtml(cleanTarget);

        // Plain text link representation
        const rawInner = innerText.replace(/<[^>]+>/g, "").trim();
        const plainLink =
          rawInner === cleanTarget || !rawInner
            ? cleanTarget
            : `${rawInner} (${cleanTarget})`;

        // Ensure the link and any inner spans explicitly render in blue (#0066cc)
        const linkColor = "#0066cc";
        let blueInnerText = innerText;
        if (blueInnerText.includes("<span")) {
          blueInnerText = blueInnerText.replace(/<span([^>]*)style="([^"]*)"/gi, (m, pre, s) => {
            const cleanS = s.replace(/color:[^;"]+;?/gi, "").trim();
            return `<span${pre}style="${cleanS ? cleanS + "; " : ""}color: ${linkColor} !important;"`;
          });
        }

        // HTML anchor tag with explicit blue color
        const htmlLink = `<a href="${safeHref}" style="color: ${linkColor} !important; text-decoration: underline;" target="_blank" rel="noopener noreferrer">${blueInnerText}</a>`;

        return { html: htmlLink, plain: plainLink };
      } else {
        // Standalone run
        const rendered = await processRun(elemXml, zip, rels, isPlain);
        // If a standalone text run contains a raw web URL, autolink it in blue
        if (!isPlain && rendered && !rendered.includes("<a ") && /(?:https?:\/\/)[^\s<"']+/i.test(rendered)) {
          const autoLinked = rendered.replace(/(https?:\/\/[^\s<"']+)/gi, (url) => {
            if (isSafeUrl(url)) {
              return `<a href="${escapeHtml(url)}" style="color: #0066cc !important; text-decoration: underline;" target="_blank" rel="noopener noreferrer">${url}</a>`;
            }
            return url;
          });
          return { html: autoLinked, plain: rendered };
        }
        return { html: rendered, plain: rendered };
      }
    })
  );

  const text = results.map((r) => (isPlain ? r.plain : r.html)).join("");
  const rawTextForUrlCompare = results.map((r) => r.plain).join("");
  return { text, rawTextForUrlCompare };
}

export type ListFormat = "bullet" | "decimal";

export interface ListItemBlock {
  listType: ListFormat;
  ilvl: number;
  content: string;
}

/**
 * Renders a sequence of list item blocks into properly nested HTML lists (<ul> and <ol>).
 * Respects indentation levels (ilvl) without flattening, and wraps nested sub-lists
 * inside the parent <li> element in strict compliance with HTML specifications.
 */
export function renderListHierarchy(items: ListItemBlock[]): string {
  if (items.length === 0) return "";
  let html = "";
  const stack: { tag: "ul" | "ol"; ilvl: number }[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const targetIlvl = item.ilvl >= 0 ? item.ilvl : 0;
    const tag = item.listType === "decimal" ? "ol" : "ul";

    if (stack.length === 0) {
      const listStyle = "margin: 0 0 12px 0; padding-left: 24px; line-height: 1.5;";
      html += `<${tag} style="${listStyle}">`;
      stack.push({ tag, ilvl: targetIlvl });
      html += `<li style="margin-bottom: 4px;">${item.content}`;
      continue;
    }

    const current = stack[stack.length - 1];

    if (targetIlvl > current.ilvl) {
      // Sub-level: open inside current <li>
      const subStyle = "margin: 4px 0 6px 0; padding-left: 20px; line-height: 1.5;";
      html += `<${tag} style="${subStyle}">`;
      stack.push({ tag, ilvl: targetIlvl });
      html += `<li style="margin-bottom: 4px;">${item.content}`;
    } else if (targetIlvl < current.ilvl) {
      // Ascend to target level
      while (stack.length > 0 && stack[stack.length - 1].ilvl > targetIlvl) {
        html += `</li></${stack[stack.length - 1].tag}>`;
        stack.pop();
      }
      if (stack.length > 0 && stack[stack.length - 1].tag !== tag) {
        html += `</li></${stack[stack.length - 1].tag}>`;
        stack.pop();
        const style = stack.length === 0
          ? "margin: 0 0 12px 0; padding-left: 24px; line-height: 1.5;"
          : "margin: 4px 0 6px 0; padding-left: 20px; line-height: 1.5;";
        html += `<${tag} style="${style}">`;
        stack.push({ tag, ilvl: targetIlvl });
      } else {
        html += `</li>`;
      }
      html += `<li style="margin-bottom: 4px;">${item.content}`;
    } else {
      // Same level
      if (current.tag !== tag) {
        html += `</li></${current.tag}>`;
        stack.pop();
        const style = stack.length === 0
          ? "margin: 0 0 12px 0; padding-left: 24px; line-height: 1.5;"
          : "margin: 4px 0 6px 0; padding-left: 20px; line-height: 1.5;";
        html += `<${tag} style="${style}">`;
        stack.push({ tag, ilvl: targetIlvl });
      } else {
        html += `</li>`;
      }
      html += `<li style="margin-bottom: 4px;">${item.content}`;
    }
  }

  while (stack.length > 0) {
    const top = stack.pop()!;
    html += `</li></${top.tag}>`;
  }

  return html;
}

interface ParsedBlock {
  type: "heading" | "list" | "para" | "empty" | "table";
  tag?: string;
  styles?: string[];
  content: string;
  listType?: ListFormat;
  ilvl?: number;
}

function getHeadingStyle(tag: string): string {
  switch (tag) {
    case "h1":
      return "margin: 18px 0 8px 0; font-size: 20px; font-weight: bold; line-height: 1.3; color: #111827;";
    case "h2":
      return "margin: 16px 0 8px 0; font-size: 16px; font-weight: bold; line-height: 1.3; color: #111827;";
    case "h3":
      return "margin: 14px 0 6px 0; font-size: 14px; font-weight: bold; line-height: 1.3; color: #111827;";
    case "h4":
      return "margin: 12px 0 6px 0; font-size: 13px; font-weight: bold; line-height: 1.3; color: #111827;";
    case "h5":
      return "margin: 10px 0 4px 0; font-size: 12px; font-weight: bold; line-height: 1.3; color: #111827;";
    case "h6":
      return "margin: 8px 0 4px 0; font-size: 11px; font-weight: bold; line-height: 1.3; color: #111827;";
    default:
      return "margin: 16px 0 8px 0; font-size: 15px; font-weight: bold; line-height: 1.3; color: #111827;";
  }
}

async function processTable(
  tblXml: string,
  zip: any,
  rels: Record<string, string>,
  listTypes: Record<string, Record<number, ListFormat>>,
  isPlain: boolean
): Promise<string> {
  const tblWMatch = tblXml.match(/<w:tblW\s+w:w="(\d+)"\s+w:type="([^"]+)"/);
  let tableWidth = "";
  if (tblWMatch && tblWMatch[2] === "dxa") {
    tableWidth = ` width: ${twipToPt(tblWMatch[1])};`;
  }

  const rowRegex = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
  const rows: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(tblXml)) !== null) {
    rows.push(m[0]);
  }

  const rowHtmls = await Promise.all(
    rows.map(async (rowXml) => {
      const cellRegex = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
      const cells: string[] = [];
      let cm: RegExpExecArray | null;
      while ((cm = cellRegex.exec(rowXml)) !== null) {
        cells.push(cm[0]);
      }

      const cellHtmls = await Promise.all(
        cells.map(async (cellXml) => {
          const tcWMatch = cellXml.match(/<w:tcW\s+w:w="(\d+)"/);
          let cellWidth = "";
          if (tcWMatch) {
            cellWidth = ` width: ${twipToPt(tcWMatch[1])};`;
          }

          let colspan = "";
          const gridSpan = cellXml.match(/<w:gridSpan\s+w:val="(\d+)"/);
          if (gridSpan && gridSpan[1] !== "1") {
            colspan = ` colspan="${gridSpan[1]}"`;
          }

          const cellParas = cellXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
          const cellContentParts = await Promise.all(
            cellParas.map(async (pXml) => {
              const { text } = await extractParaElements(pXml, zip, rels, isPlain);
              if (!text.replace(/<[^>]+>/g, "").trim() && !/<img[\s>]/i.test(text)) {
                return "";
              }
              return isPlain ? text : `<p style="margin: 0 0 4px 0;">${text}</p>`;
            })
          );
          const inner = cellContentParts.filter(Boolean).join(isPlain ? "\n" : "");

          if (isPlain) {
            return inner;
          }
          return `<td${colspan} style="padding: 6px 8px; vertical-align: middle; border: 1px solid #e2e8f0;${cellWidth}">${inner}</td>`;
        })
      );

      if (isPlain) {
        return cellHtmls.join("\t|\t");
      }
      return `<tr>${cellHtmls.join("")}</tr>`;
    })
  );

  if (isPlain) {
    return rowHtmls.join("\n") + "\n";
  }
  return `<table style="border-collapse: collapse; margin: 0 0 16px 0;${tableWidth}">${rowHtmls.join("")}</table>`;
}

/**
 * Parses numbering.xml from the Word document package to determine
 * per numId and per ilvl whether the list item is an unordered bullet list or ordered decimal list.
 */
async function parseNumbering(zip: any): Promise<Record<string, Record<number, ListFormat>>> {
  const listTypes: Record<string, Record<number, ListFormat>> = {};
  const numberingFile = zip.file("word/numbering.xml");
  if (!numberingFile) return listTypes;

  try {
    const numberingXml = await numberingFile.async("string");

    // 1. Map abstractNumId -> Record<ilvl, ListFormat>
    const abstractFmts: Record<string, Record<number, ListFormat>> = {};
    const abstractRegex = /<w:abstractNum\s+w:abstractNumId="(\d+)"[\s\S]*?<\/w:abstractNum>/g;
    let am: RegExpExecArray | null;
    while ((am = abstractRegex.exec(numberingXml)) !== null) {
      const absId = am[1];
      const xml = am[0];
      const levelMap: Record<number, ListFormat> = {};

      const lvlRegex = /<w:lvl\s+w:ilvl="(\d+)"[\s\S]*?<\/w:lvl>/g;
      let lm: RegExpExecArray | null;
      while ((lm = lvlRegex.exec(xml)) !== null) {
        const ilvl = parseInt(lm[1], 10);
        const lvlXml = lm[0];
        const fmtMatch = lvlXml.match(/<w:numFmt\s+w:val="([^"]+)"/);
        if (fmtMatch) {
          levelMap[ilvl] = fmtMatch[1].toLowerCase() === "bullet" ? "bullet" : "decimal";
        } else {
          const lvlTextMatch = lvlXml.match(/<w:lvlText\s+w:val="([^"]*)"/);
          const lvlText = lvlTextMatch ? lvlTextMatch[1] : "";
          if (/[\u2022\uF0B7\u25AA\u25AB\u25CF•o]/.test(lvlText)) {
            levelMap[ilvl] = "bullet";
          } else {
            levelMap[ilvl] = "decimal";
          }
        }
      }

      if (Object.keys(levelMap).length === 0) {
        const fmtMatch = xml.match(/<w:numFmt\s+w:val="([^"]+)"/);
        const fmt: ListFormat = fmtMatch && fmtMatch[1].toLowerCase() === "bullet" ? "bullet" : "decimal";
        levelMap[0] = fmt;
      }

      abstractFmts[absId] = levelMap;
    }

    // 2. Map numId -> Record<ilvl, ListFormat>
    const numRegex = /<w:num\s+w:numId="(\d+)"[\s\S]*?<\/w:num>/g;
    let nm: RegExpExecArray | null;
    while ((nm = numRegex.exec(numberingXml)) !== null) {
      const numId = nm[1];
      const xml = nm[0];
      const absRef = xml.match(/<w:abstractNumId\s+w:val="(\d+)"/);
      const baseMap = absRef && abstractFmts[absRef[1]] ? { ...abstractFmts[absRef[1]] } : {};

      const overrideRegex = /<w:lvlOverride\s+w:ilvl="(\d+)"[\s\S]*?<\/w:lvlOverride>/g;
      let om: RegExpExecArray | null;
      while ((om = overrideRegex.exec(xml)) !== null) {
        const ilvl = parseInt(om[1], 10);
        const oXml = om[0];
        const fmtMatch = oXml.match(/<w:numFmt\s+w:val="([^"]+)"/);
        if (fmtMatch) {
          baseMap[ilvl] = fmtMatch[1].toLowerCase() === "bullet" ? "bullet" : "decimal";
        }
      }

      listTypes[numId] = baseMap;
    }
  } catch (err) {
    console.warn("Failed to parse numbering.xml in docx:", err);
  }

  return listTypes;
}

function getListType(
  listTypes: Record<string, Record<number, ListFormat>>,
  numId: string,
  ilvl: number
): ListFormat {
  if (numId === "bullet-style") return "bullet";
  if (numId === "decimal-style") return "decimal";
  const numConfig = listTypes[numId];
  if (numConfig) {
    if (numConfig[ilvl] !== undefined) return numConfig[ilvl];
    if (numConfig[0] !== undefined) return numConfig[0];
  }
  return "bullet";
}

/**
 * Converts raw HTML string into clean plain text for plain-text email output.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  let text = html;

  const bodyMatch = text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    text = bodyMatch[1];
  }

  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Convert links: <a href="url">text</a>
  text = text.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const linkText = inner.replace(/<[^>]+>/g, "").trim();
    const linkHref = href.trim();
    if (!linkText || linkText === linkHref) {
      return linkHref;
    }
    return `${linkText} (${linkHref})`;
  });

  // Table cells and rows
  text = text.replace(/<\/td>\s*<td[^>]*>/gi, "\t|\t");
  text = text.replace(/<\/tr>/gi, "\n");

  // Line breaks and block ends
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|h[1-6]|li)>/gi, "\n\n");
  text = text.replace(/<\/ul>|<\/ol>/gi, "\n");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode entities
  text = decodeXmlEntities(text);
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&copy;/g, "©")
    .replace(/&reg;/g, "®")
    .replace(/&trade;/g, "™");

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Normalizes an uploaded HTML document or snippet into email-ready HTML,
 * ensuring blue underlined links, healthy paragraph spacing, and proper formatting.
 */
export function processHtmlContent(rawHtml: string, isPlain?: boolean): string {
  if (isPlain) {
    return htmlToPlainText(rawHtml);
  }

  let content = rawHtml;
  const bodyMatch = content.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    content = bodyMatch[1];
  }

  // Remove scripts, styles, doctype, and HTML wrapper tags
  content = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\/?(html|head|body)[^>]*>/gi, "");

  // Style links: make them blue and underlined, add target="_blank"
  content = content.replace(/<a(\s[^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, inner) => {
    const hrefMatch = attrs.match(/\bhref="([^"]*)"/i);
    const href = hrefMatch ? hrefMatch[1] : "";

    const isPlaceholder = /^\{\{[^}]+\}\}$/.test(href.trim());
    if (!isPlaceholder && !isSafeUrl(href)) {
      return inner;
    }

    const cleanAttrs = attrs
      .replace(/\btarget="[^"]*"/gi, "")
      .replace(/\brel="[^"]*"/gi, "")
      .replace(/\bstyle="[^"]*"/gi, "")
      .trim();

    // Ensure any span inside the link also has blue color and underline
    const styledInner = inner.replace(/<span(\s[^>]*)?>/gi, (__: string, sAttrs = "") => {
      const spanStyle = sAttrs.match(/\bstyle="([^"]*)"/i);
      const rest = sAttrs.replace(/\bstyle="[^"]*"/i, "").trim();
      const existing = spanStyle ? spanStyle[1].trim() : "";
      const filtered = existing
        .split(";")
        .map((s: string) => s.trim())
        .filter((s: string) => s && !s.toLowerCase().startsWith("color") && !s.toLowerCase().startsWith("text-decoration"))
        .join("; ");
      const newStyle = filtered
        ? `${filtered}; color: #0066cc !important; text-decoration: underline;`
        : "color: #0066cc !important; text-decoration: underline;";
      return `<span ${rest ? rest + " " : ""}style="${newStyle}">`;
    });

    const attrStr = cleanAttrs ? ` ${cleanAttrs}` : "";
    return `<a${attrStr} target="_blank" rel="noopener noreferrer" style="color: #0066cc !important; text-decoration: underline;">${styledInner}</a>`;
  });

  // Paragraph spacing: replace margin-top: 0 / margin-bottom: 0 with healthy bottom spacing
  content = content.replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi, (_, attrs = "", inner) => {
    const styleMatch = attrs.match(/\bstyle="([^"]*)"/i);
    let otherAttrs = attrs;
    let userStyles: string[] = [];

    if (styleMatch) {
      otherAttrs = attrs.replace(/\bstyle="[^"]*"/i, "").trim();
      userStyles = styleMatch[1]
        .split(";")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .filter((s: string) => {
          const lower = s.toLowerCase();
          return (
            !lower.startsWith("margin-top") &&
            !lower.startsWith("margin-bottom") &&
            !lower.startsWith("margin:") &&
            !lower.startsWith("line-height")
          );
        });
    }

    const finalStyles = ["margin: 0 0 12px 0", "line-height: 1.6", ...userStyles];
    const styleAttr = `style="${finalStyles.join("; ")}"`;
    const cleanOther = otherAttrs.trim();
    return `<p ${styleAttr}${cleanOther ? " " + cleanOther : ""}>${inner}</p>`;
  });

  // Style headings
  content = content.replace(/<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi, (_, level, attrs = "", inner) => {
    const cleanAttrs = attrs.replace(/\bstyle="[^"]*"/gi, "").trim();
    const style = "margin: 16px 0 8px 0; font-weight: bold; line-height: 1.3;";
    return `<h${level}${cleanAttrs ? " " + cleanAttrs : ""} style="${style}">${inner}</h${level}>`;
  });

  // Style lists
  content = content.replace(/<(ul|ol)(\s[^>]*)?>/gi, (_, tag, attrs = "") => {
    const cleanAttrs = attrs.replace(/\bstyle="[^"]*"/gi, "").trim();
    return `<${tag}${cleanAttrs ? " " + cleanAttrs : ""} style="margin: 0 0 12px 0; padding-left: 24px; line-height: 1.5;">`;
  });

  content = content.replace(/<li(\s[^>]*)?>/gi, (_, attrs = "") => {
    const cleanAttrs = attrs.replace(/\bstyle="[^"]*"/gi, "").trim();
    return `<li${cleanAttrs ? " " + cleanAttrs : ""} style="margin-bottom: 4px;">`;
  });

  // Style tables
  content = content.replace(/<table(\s[^>]*)?>/gi, (_, attrs = "") => {
    const cleanAttrs = attrs.replace(/\bstyle="[^"]*"/gi, "").trim();
    return `<table${cleanAttrs ? " " + cleanAttrs : ""} style="border-collapse: collapse; margin: 0 0 16px 0;">`;
  });

  // If there are no paragraph or block tags, wrap lines into <p>
  if (!/<(p|div|table|h[1-6]|ul|ol)\b/i.test(content)) {
    const lines = content.split(/\r?\n\r?\n/);
    content = lines
      .map((block) => `<p style="margin: 0 0 12px 0; line-height: 1.6;">${block.replace(/\r?\n/g, "<br>")}</p>`)
      .join("");
  }

  return content.trim();
}

export interface DocxConvertOptions {
  format?: "html" | "text";
}

/**
 * Converts a DOCX or HTML File object into email-ready HTML or plain text.
 * Strictly preserves paragraphs, headings, bullet/numbered lists, tables,
 * hyperlinks, special characters, and intentional spacing.
 */
export async function docxToHtml(file: File, options?: DocxConvertOptions): Promise<string> {
  const isPlain = options?.format === "text";
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Check if buffer is a ZIP file (Magic bytes: 0x50, 0x4B = "PK")
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  const fileName = (file.name || "").toLowerCase();
  const isExplicitHtml = fileName.endsWith(".html") || fileName.endsWith(".htm");

  if (!isZip || isExplicitHtml) {
    const rawText = new TextDecoder("utf-8").decode(buffer);
    return processHtmlContent(rawText, isPlain);
  }

  let zip: any;
  try {
    const JSZip = (await import("jszip")).default;
    zip = await JSZip.loadAsync(buffer);
  } catch (zipErr) {
    // If JSZip fails, try decoding as HTML/text fallback
    try {
      const rawText = new TextDecoder("utf-8").decode(buffer);
      if (rawText.includes("<") && rawText.includes(">")) {
        return processHtmlContent(rawText, isPlain);
      }
    } catch {
      // ignore
    }
    throw zipErr;
  }

  const docXmlStr = await zip.file("word/document.xml")?.async("string");
  if (!docXmlStr) {
    const rawText = new TextDecoder("utf-8").decode(buffer);
    if (rawText.includes("<") && rawText.includes(">")) {
      return processHtmlContent(rawText, isPlain);
    }
    throw new Error("Invalid docx: missing document.xml");
  }

  // Read relationships (links, images)
  const relsXmlStr = await zip.file("word/_rels/document.xml.rels")?.async("string");
  const rels: Record<string, string> = {};
  if (relsXmlStr) {
    const relList = relsXmlStr.match(/<Relationship[^>]*\/>/g) || [];
    for (const rel of relList) {
      const idMatch = rel.match(/Id="([^"]+)"/);
      const targetMatch = rel.match(/Target="([^"]+)"/);
      if (idMatch && targetMatch) {
        rels[idMatch[1]] = decodeXmlEntities(targetMatch[1]);
      }
    }
  }

  // Parse list formats from numbering.xml
  const listTypes = await parseNumbering(zip);

  // Extract body content
  const bodyMatch = docXmlStr.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error("Invalid docx: missing body");
  const bodyXml = bodyMatch[1];

  // Tokenize blocks in document order: tables vs paragraphs
  const blockRegex = /<w:tbl[\s>][\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(bodyXml)) !== null) {
    blocks.push(m[0]);
  }

  // Parse blocks
  const parsedBlocks: ParsedBlock[] = [];
  for (const block of blocks) {
    if (block.startsWith("<w:tbl")) {
      const tableHtml = await processTable(block, zip, rels, listTypes, isPlain);
      parsedBlocks.push({ type: "table", content: tableHtml });
    } else {
      const pPrMatch = block.match(/<w:pPr[\s>][\s\S]*?<\/w:pPr>/);
      const pPr = pPrMatch ? pPrMatch[0] : "";
      const { styles, headingTag, numPr } = parseStylesFromPPr(pPr);

      const { text } = await extractParaElements(block, zip, rels, isPlain);
      const hasVisibleText = text.replace(/<[^>]+>/g, "").trim().length > 0;
      const hasImage = /<img[\s>]/i.test(text);

      if (!hasVisibleText && !hasImage) {
        // Preserve blank line / empty paragraph spacing
        parsedBlocks.push({ type: "empty", content: "" });
        continue;
      }

      if (headingTag) {
        parsedBlocks.push({
          type: "heading",
          tag: headingTag,
          styles,
          content: text,
        });
      } else if (numPr) {
        const lType = getListType(listTypes, numPr.numId, numPr.ilvl);
        parsedBlocks.push({
          type: "list",
          listType: lType,
          ilvl: numPr.ilvl,
          styles,
          content: text,
        });
      } else {
        const rawContent = text.replace(/<[^>]+>/g, "").trim();
        const prevBlock = parsedBlocks[parsedBlocks.length - 1];
        const prevText = prevBlock?.content ? prevBlock.content.replace(/<[^>]+>/g, "").trim().toLowerCase() : "";
        const isAfterSignOff = /^(?:regards|warm regards|best regards|sincerely|thanks|cheers|with regards)\b/i.test(prevText);

        // Check if paragraph starts with an explicit bullet character without numPr
        const bulletMatch = rawContent.match(/^[\u2022\uF0B7\u25AA\u25AB\u25CF•]\s+(.*)$/);
        if (bulletMatch) {
          const cleanText = text.replace(/^(\s*<[^>]+>)*\s*[\u2022\uF0B7\u25AA\u25AB\u25CF•]\s*/, "$1");
          parsedBlocks.push({
            type: "list",
            listType: "bullet",
            ilvl: 0,
            styles,
            content: cleanText,
          });
          continue;
        }

        // Check if paragraph starts with manual numbered list marker: "1. ", "2) ", etc.
        // Exclude emoji keycaps like "1️⃣ " or "2️⃣ "
        const isEmojiKeycap = /^[0-9]\uFE0F?\s*\u20E3/.test(rawContent);
        const numberMatch = !isEmojiKeycap && rawContent.match(/^(\d+)[.)]\s+(.*)$/);
        if (numberMatch && !isAfterSignOff && rawContent.length > 5 && rawContent.includes(" ")) {
          const cleanText = text.replace(/^(\s*<[^>]+>)*\s*\d+[.)]\s*/, "$1");
          parsedBlocks.push({
            type: "list",
            listType: "decimal",
            ilvl: 0,
            styles,
            content: cleanText,
          });
          continue;
        }

        const isHeadingCandidate =
          !isAfterSignOff &&
          rawContent.length > 0 &&
          rawContent.length <= 70 &&
          !/[.,;!?]$/.test(rawContent) &&
          !/^(?:dear|hi|hello|regards|warm regards|best regards|sincerely|thanks|cheers)\b/i.test(rawContent) &&
          !/(?:founder|co-founder|director|ceo|cto|cfo|manager|lead|advisor|president|team)\s*\|/i.test(rawContent) &&
          !(rawContent.startsWith("{{") && rawContent.endsWith("}}"));

        const lowerContent = rawContent.toLowerCase();
        const matchesKnownHeading =
          COMMON_BUSINESS_HEADINGS.has(lowerContent) ||
          /^(?:about\s+|meeting\s+|partnership\s+|key\s+|agenda\b|schedule\b|next\s+steps\b)/i.test(rawContent);

        const isEmojiSection = isEmojiKeycap || /^(?:🚗|📅|🤝|📎|📌|💡|🎯|📣|🎙️|👔|📩)\s+/.test(rawContent);
        const isBold = styles.some((s) => s.includes("font-weight: bold")) || /<w:b[\s\/>]/.test(block);

        if (isHeadingCandidate && (matchesKnownHeading || (isEmojiSection && isBold))) {
          const cleanHeadingContent = text.replace(/<span style="font-weight: bold">([\s\S]*?)<\/span>/gi, "$1");
          parsedBlocks.push({
            type: "heading",
            tag: isEmojiSection ? "h3" : "h2",
            styles,
            content: cleanHeadingContent,
          });
        } else {
          parsedBlocks.push({
            type: "para",
            styles,
            content: text,
          });
        }
      }
    }
  }

  // Assemble HTML or plain text
  if (isPlain) {
    const textParts: string[] = [];
    const listCounters: Record<number, number> = {};
    for (let i = 0; i < parsedBlocks.length; i++) {
      const b = parsedBlocks[i];
      if (b.type === "empty") {
        textParts.push("");
        for (const k of Object.keys(listCounters)) delete listCounters[parseInt(k, 10)];
      } else if (b.type === "heading") {
        textParts.push(b.content);
        for (const k of Object.keys(listCounters)) delete listCounters[parseInt(k, 10)];
      } else if (b.type === "list") {
        const indent = "  ".repeat(b.ilvl || 0);
        const lvl = b.ilvl || 0;
        if (b.listType === "decimal") {
          listCounters[lvl] = (listCounters[lvl] || 0) + 1;
          for (const k of Object.keys(listCounters)) {
            if (parseInt(k, 10) > lvl) delete listCounters[parseInt(k, 10)];
          }
          textParts.push(`${indent}${listCounters[lvl]}. ${b.content}`);
        } else {
          textParts.push(`${indent}- ${b.content}`);
          for (const k of Object.keys(listCounters)) {
            if (parseInt(k, 10) >= lvl) delete listCounters[parseInt(k, 10)];
          }
        }
      } else if (b.type === "para") {
        textParts.push(b.content);
        for (const k of Object.keys(listCounters)) delete listCounters[parseInt(k, 10)];
      } else if (b.type === "table") {
        textParts.push(b.content);
        for (const k of Object.keys(listCounters)) delete listCounters[parseInt(k, 10)];
      }
    }
    return textParts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // HTML assembly with list grouping and spacing
  const htmlParts: string[] = [];

  // Check for header images only (do not dump header text/page numbers)
  for (const path of Object.keys(zip.files)) {
    if (path.startsWith("word/header") && !zip.files[path].dir) {
      const hfXml = await zip.files[path].async("string");
      if (/<w:drawing[\s>]/.test(hfXml)) {
        // Read header-specific relationships if present
        const hfRelsPath = path.replace("word/", "word/_rels/") + ".rels";
        const hfRelsXml = await zip.file(hfRelsPath)?.async("string");
        const hfRels: Record<string, string> = { ...rels };
        if (hfRelsXml) {
          const relList = hfRelsXml.match(/<Relationship[^>]*\/>/g) || [];
          for (const rel of relList) {
            const idMatch = rel.match(/Id="([^"]+)"/);
            const targetMatch = rel.match(/Target="([^"]+)"/);
            if (idMatch && targetMatch) {
              hfRels[idMatch[1]] = decodeXmlEntities(targetMatch[1]);
            }
          }
        }

        const hfRuns = hfXml.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) || [];
        for (const rXml of hfRuns) {
          if (/<w:drawing[\s>]/.test(rXml)) {
            const imgHtml = await processRun(rXml, zip, hfRels, false);
            if (imgHtml) {
              htmlParts.push(`<p style="margin: 0 0 12px 0;">${imgHtml}</p>`);
            }
          }
        }
      }
    }
  }

  let i = 0;
  while (i < parsedBlocks.length) {
    const block = parsedBlocks[i];

    if (block.type === "empty") {
      let nextNonEmpty: ParsedBlock | undefined;
      for (let j = i + 1; j < parsedBlocks.length; j++) {
        if (parsedBlocks[j].type !== "empty") {
          nextNonEmpty = parsedBlocks[j];
          break;
        }
      }

      const prevBlock = parsedBlocks[i - 1];
      const isAtDocStart = htmlParts.length === 0;
      const isAtDocEnd = !nextNonEmpty;
      const isAfterHeadingOrList = prevBlock && (prevBlock.type === "heading" || prevBlock.type === "list");
      const isBeforeHeadingOrList = nextNonEmpty && (nextNonEmpty.type === "heading" || nextNonEmpty.type === "list");

      if (isAtDocStart || isAtDocEnd || isAfterHeadingOrList || isBeforeHeadingOrList) {
        i++;
        continue;
      }

      htmlParts.push('<p style="margin: 0 0 12px 0; line-height: 1.5;">&nbsp;</p>');
      i++;
      continue;
    }

    if (block.type === "heading" && block.tag) {
      const baseStyle = getHeadingStyle(block.tag);
      const customAlign = block.styles?.find((s) => s.startsWith("text-align:"));
      const styleAttr = customAlign ? ` style="${baseStyle} ${customAlign}"` : ` style="${baseStyle}"`;
      htmlParts.push(`<${block.tag}${styleAttr}>${block.content}</${block.tag}>`);
      i++;
      continue;
    }

    if (block.type === "list") {
      const listGroup: ListItemBlock[] = [];
      while (i < parsedBlocks.length && parsedBlocks[i].type === "list") {
        const it = parsedBlocks[i];
        listGroup.push({
          listType: it.listType || "bullet",
          ilvl: it.ilvl ?? 0,
          content: it.content,
        });
        i++;
      }
      htmlParts.push(renderListHierarchy(listGroup));
      continue;
    }

    if (block.type === "table") {
      htmlParts.push(block.content);
      i++;
      continue;
    }

    // Regular paragraph
    // In email HTML, every paragraph must have healthy bottom spacing (12px to 14px) and line height
    // so paragraphs never collapse into an unspaced brick, even if Word specified 0pt spacing.
    const userStyles = block.styles || [];
    const nonMarginStyles = userStyles.filter(
      (s) =>
        !s.startsWith("margin-top") &&
        !s.startsWith("margin-bottom") &&
        !s.startsWith("margin:") &&
        !s.startsWith("line-height")
    );

    const customBottomMatch = userStyles.find((s) => s.startsWith("margin-bottom:"));
    let bottomMargin = "12px";
    let lineHeight = "1.5";
    if (customBottomMatch) {
      const ptVal = parseFloat(customBottomMatch.replace("margin-bottom:", "").trim());
      if (ptVal > 0) {
        bottomMargin = `${ptVal}pt`;
      } else if (ptVal === 0) {
        // Word explicitly specified 0pt spacing (compact detail lines or signatures)
        bottomMargin = "2px";
        lineHeight = "1.4";
      }
    }

    const finalStyles = [
      `margin: 0 0 ${bottomMargin} 0`,
      `line-height: ${lineHeight}`,
      ...nonMarginStyles,
    ];

    const styleAttr = ` style="${finalStyles.join("; ")}"`;
    htmlParts.push(`<p${styleAttr}>${block.content}</p>`);
    i++;
  }

  return htmlParts.join("");
}

/**
 * Converts a DOCX File object into clean plain text.
 */
export async function docxToPlainText(file: File): Promise<string> {
  return docxToHtml(file, { format: "text" });
}
