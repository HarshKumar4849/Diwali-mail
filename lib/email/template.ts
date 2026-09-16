/**
 * Email template compilation, auto-linking, and corporate email formatting.
 * Canonical path: Template -> compileTemplate() -> Final HTML
 */

/**
 * Checks if a string contains HTML block-level elements or root tags.
 * If true, the template is considered pre-formatted HTML (e.g. from DOCX or rich email editor).
 */
export function isHtml(text: string): boolean {
  if (!text) return false;
  return /<\s*(?:p|div|table|tr|td|th|tbody|thead|tfoot|h[1-6]|ul|ol|li|blockquote|header|footer|section|article|html|body|head|style|a|span|b|strong|i|em|u)\b[^>]*>/i.test(text);
}

/**
 * Standard email hyperlink style conforming to Mailcraft's design system.
 */
export const EMAIL_LINK_STYLE = "color: #0066cc !important; text-decoration: underline;";

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
 * Unescapes markdown backslash-escaped characters so the email recipient
 * never sees raw backslash escape artifacts like 1\., mailto\:, or \&.
 */
export function unescapeMarkdownChars(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\&/g, "&")
    .replace(/mailto\\:/gi, "mailto:")
    .replace(/(\d+)\\\./g, "$1.")
    .replace(/\\([#*_\[\]\\!.:\-])/g, "$1");
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

/**
 * Converts Markdown link syntax [Link Text](url) into semantic HTML anchors
 * with standard Mailcraft corporate blue underline styling.
 */
export function convertMarkdownLinks(text: string): string {
  if (!text) return "";
  return text.replace(/\[([^\]]+)\]\(([^)\s]+(?:\s+[^\s)]+)*)\)/g, (match, rawLabel, rawUrl) => {
    let cleanUrl = rawUrl.trim();
    if (cleanUrl.includes(" ")) {
      cleanUrl = cleanUrl.replace(/ /g, "%20");
    }
    cleanUrl = unescapeMarkdownChars(cleanUrl);

    if (!isSafeUrl(cleanUrl)) {
      return rawLabel;
    }

    const safeHref = escapeHtml(cleanUrl);
    const cleanLabel = unescapeMarkdownChars(rawLabel.trim());
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="${EMAIL_LINK_STYLE}">${cleanLabel}</a>`;
  });
}

/**
 * Converts Markdown bold (**text** or __text__) and italic (*text* or _text_)
 * into standard semantic HTML tags (<strong> and <em>).
 */
export function convertMarkdownInline(text: string): string {
  if (!text) return "";
  let res = text;
  // Bold: **text** or __text__
  res = res.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  res = res.replace(/__([^_\n]+?)__/g, "<strong>$1</strong>");
  // Italic: *text* (avoid matching bullet points)
  res = res.replace(/(^|[^\w*])\*([^*\n]+?)\*([^\w*]|$)/g, "$1<em>$2</em>$3");
  // Italic: _text_ (avoid matching snake_case identifiers)
  res = res.replace(/(^|[^\w_])_([^_\n]+?)_([^\w_]|$)/g, "$1<em>$2</em>$3");
  // Strikethrough: ~~text~~
  res = res.replace(/~~([^~\n]+?)~~/g, "<del>$1</del>");
  return res;
}

/**
 * Replaces {{placeholder}} tokens with values from data dictionary.
 * When options.escapeHtml is true (used for HTML body templates), values are safely escaped once for HTML.
 * When options.escapeHtml is false (default, used for plain text subject lines), raw values are kept.
 */
export function renderTemplate(
  template: string,
  data?: Record<string, string>,
  options?: { escapeHtml?: boolean }
): string {
  if (!template || !data) return template;
  const shouldEscape = options?.escapeHtml ?? false;
  return template.replace(/\{\{(.+?)\}\}/g, (match, key: string) => {
    const trimmed = key.trim();
    if (Object.prototype.hasOwnProperty.call(data, trimmed)) {
      const val = data[trimmed];
      const strVal = val !== undefined && val !== null ? String(val) : "";
      return shouldEscape ? escapeHtml(strVal) : strVal;
    }
    return match;
  });
}

/**
 * Cleans up non-semantic whitespace between block tags in HTML emails.
 * Avoids browser/email client artifacts where newlines between table rows or paragraphs
 * get rendered as unexpected vertical gaps or breaks, while preserving all inline text spacing.
 */
export function cleanHtmlWhitespace(html: string): string {
  if (!html) return "";
  let prev = "";
  let current = html;
  while (prev !== current) {
    prev = current;
    current = current
      // Remove whitespace between closing block tags and opening block tags
      .replace(/(<\/(?:p|div|tr|td|th|table|tbody|thead|tfoot|ul|ol|li|h[1-6])>)\s+(<(?:p|div|tr|td|th|table|tbody|thead|tfoot|ul|ol|li|h[1-6]|\/tr|\/td|\/th|\/table|\/tbody|\/thead|\/tfoot|\/ul|\/ol)>)/gi, "$1$2")
      // Remove whitespace between container opening tags and opening child tags
      .replace(/(<(?:table|tbody|thead|tfoot|tr|ul|ol)[^>]*>)\s+(<(?:tbody|thead|tfoot|tr|td|th|li)[^>]*>)/gi, "$1$2")
      // Remove whitespace between closing child tags and parent closing tags
      .replace(/(<\/(?:td|th|tr|tbody|thead|tfoot|li)>)\s+(<\/(?:tr|tbody|thead|tfoot|table|ul|ol)>)/gi, "$1$2");
  }
  return current;
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

/**
 * Checks if a standalone line represents a business email section heading.
 */
function isBusinessHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return false;

  // Never treat greetings, sign-offs, or sentences with periods as headings
  if (/[.,;!?]$/.test(trimmed)) return false;
  if (/^(?:dear|hi|hello|regards|warm regards|best regards|sincerely|thanks|cheers)\b/i.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) return false;

  const lower = trimmed.toLowerCase();
  if (COMMON_BUSINESS_HEADINGS.has(lower)) return true;

  // Pattern: "About ...", "Meeting ...", "Partnership ...", "Key ...", "Agenda ..."
  if (/^(?:about\s+|meeting\s+|partnership\s+|key\s+|agenda\b|schedule\b|next\s+steps\b)/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Checks if a block of lines represents a signature block.
 */
function isSignatureBlock(lines: string[]): boolean {
  if (lines.length === 0) return false;
  const first = lines[0].trim().toLowerCase();
  if (
    first.startsWith("regards") ||
    first.startsWith("warm regards") ||
    first.startsWith("best regards") ||
    first.startsWith("sincerely") ||
    first.startsWith("thanks & regards") ||
    first.startsWith("with regards") ||
    first.startsWith("yours truly") ||
    first.startsWith("yours faithfully") ||
    first.startsWith("cheers")
  ) {
    return true;
  }

  // Check if lines contain typical business signature indicators (Founder |, Director |, etc.)
  const hasJobTitle = lines.some((l) =>
    /(?:founder|co-founder|director|ceo|cto|cfo|manager|lead|advisor|president|vp|engineer|consultant|team)\s*\|/i.test(l)
  );
  return hasJobTitle && lines.length <= 6;
}

/**
 * Compiles a plain text draft into canonical email HTML:
 * - Unescapes markdown escape artifacts (1\., mailto\:, \&).
 * - Converts markdown links [Text](url) to styled HTML anchors.
 * - Converts markdown formatting (**bold**, *italic*) to semantic HTML.
 * - Formats headings (## Heading or recognized business headings) cleanly.
 * - Converts bullet/numbered lists to <ul><li> and <ol><li>.
 * - Preserves clean signature blocks without excessive vertical gaps.
 * - Safe entity handling without double encoding (&amp;amp;).
 */
export function compilePlainText(text: string): string {
  if (!text) return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawBlocks = normalized.split(/\n{2,}/);

  const htmlBlocks: string[] = [];

  for (const rawBlock of rawBlocks) {
    const trimmedBlock = rawBlock.trim();
    if (!trimmedBlock) continue;

    const lines = trimmedBlock.split("\n").map((l) => l.trimEnd());

    // 1. Check for Markdown Headings (# Heading, ## Heading, ### Heading)
    const mdHeadingMatch = trimmedBlock.match(/^(#{1,6})\s+(.+)$/);
    if (mdHeadingMatch && !trimmedBlock.includes("\n")) {
      const level = mdHeadingMatch[1].length;
      let headingText = mdHeadingMatch[2].trim();
      headingText = unescapeMarkdownChars(headingText);
      headingText = convertMarkdownInline(headingText);
      headingText = escapeHtml(headingText);

      const headingTag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      const headingStyle =
        level === 1
          ? "margin: 18px 0 8px 0; font-size: 20px; font-weight: bold; line-height: 1.3; color: #111827;"
          : level === 2
          ? "margin: 16px 0 8px 0; font-size: 16px; font-weight: bold; line-height: 1.3; color: #111827;"
          : "margin: 14px 0 6px 0; font-size: 14px; font-weight: bold; line-height: 1.3; color: #111827;";

      htmlBlocks.push(`<${headingTag} style="${headingStyle}">${headingText}</${headingTag}>`);
      continue;
    }

    // 2. Check for Natural Business Email Headings (e.g. Meeting Details, About the Summit)
    if (lines.length === 1 && isBusinessHeading(lines[0])) {
      let headingText = unescapeMarkdownChars(lines[0].trim());
      headingText = escapeHtml(headingText);
      headingText = convertMarkdownInline(headingText);
      const isAlreadyBold = headingText.startsWith("<strong>") && headingText.endsWith("</strong>");
      const inner = isAlreadyBold ? headingText : `<strong>${headingText}</strong>`;
      htmlBlocks.push(
        `<p style="margin: 16px 0 8px 0; font-size: 15px; font-weight: bold; line-height: 1.4; color: #111827;">${inner}</p>`
      );
      continue;
    }

    // 3. Check for Signature Block (clean line spacing with <br />)
    if (isSignatureBlock(lines)) {
      const processedLines = lines.map((l) => {
        let lineText = unescapeMarkdownChars(l.trim());
        lineText = escapeHtml(lineText);
        lineText = convertMarkdownLinks(lineText);
        lineText = convertMarkdownInline(lineText);
        return lineText;
      });

      htmlBlocks.push(
        `<p style="margin: 0 0 8px 0; line-height: 1.4;">${processedLines.join("<br />")}</p>`
      );
      continue;
    }

    // 4. Process lines in the block: supports intro sentences followed by lists, or pure lists/paragraphs
    let lineIdx = 0;
    while (lineIdx < lines.length) {
      const curLine = lines[lineIdx];

      // Check bullet item
      if (/^\s*(?:[•*+-]|\u2022)\s+/.test(curLine)) {
        const bulletItems: string[] = [];
        while (lineIdx < lines.length && /^\s*(?:[•*+-]|\u2022)\s+/.test(lines[lineIdx])) {
          let itemContent = lines[lineIdx].replace(/^\s*(?:[•*+-]|\u2022)\s+/, "").trim();
          itemContent = unescapeMarkdownChars(itemContent);
          itemContent = escapeHtml(itemContent);
          itemContent = convertMarkdownLinks(itemContent);
          itemContent = convertMarkdownInline(itemContent);
          bulletItems.push(`<li style="margin-bottom: 4px;">${itemContent}</li>`);
          lineIdx++;
        }
        htmlBlocks.push(
          `<ul style="margin: 0 0 12px 0; padding-left: 24px; line-height: 1.5;">${bulletItems.join("")}</ul>`
        );
        continue;
      }

      // Check numbered item
      if (/^\s*\d+(?:\.|\)|\\\.)\s+/.test(curLine)) {
        const numItems: string[] = [];
        while (lineIdx < lines.length && /^\s*\d+(?:\.|\)|\\\.)\s+/.test(lines[lineIdx])) {
          let itemContent = lines[lineIdx].replace(/^\s*\d+(?:\.|\)|\\\.)\s+/, "").trim();
          itemContent = unescapeMarkdownChars(itemContent);
          itemContent = escapeHtml(itemContent);
          itemContent = convertMarkdownLinks(itemContent);
          itemContent = convertMarkdownInline(itemContent);
          numItems.push(`<li style="margin-bottom: 4px;">${itemContent}</li>`);
          lineIdx++;
        }
        htmlBlocks.push(
          `<ol style="margin: 0 0 12px 0; padding-left: 24px; line-height: 1.5;">${numItems.join("")}</ol>`
        );
        continue;
      }

      // Text line(s) before a list or standalone
      const textLines: string[] = [];
      while (
        lineIdx < lines.length &&
        !/^\s*(?:[•*+-]|\u2022)\s+/.test(lines[lineIdx]) &&
        !/^\s*\d+(?:\.|\)|\\\.)\s+/.test(lines[lineIdx])
      ) {
        let lineText = unescapeMarkdownChars(lines[lineIdx]);
        lineText = escapeHtml(lineText);
        lineText = convertMarkdownLinks(lineText);
        lineText = convertMarkdownInline(lineText);
        lineText = lineText.replace(/ {2}/g, " &nbsp;");
        textLines.push(lineText);
        lineIdx++;
      }

      const inner = textLines.join("<br />");
      const margin = lineIdx < lines.length ? "margin: 0 0 8px 0;" : "margin: 0 0 12px 0;";
      htmlBlocks.push(`<p style="${margin} line-height: 1.5;">${inner}</p>`);
    }
  }

  return htmlBlocks.join("");
}

/**
 * Auto-links raw URLs and mailto addresses in plain text nodes,
 * safely ignoring trailing punctuation (. , ! ? : ; ) ]).
 */
export function autoLinkText(text: string): string {
  if (!text || (!/(https?:\/\/)/i.test(text) && !/(mailto:)/i.test(text))) {
    return text;
  }

  // Regex captures:
  // 1. mailto:email@domain.com
  // 2. Web URLs (http/https). Handles URLs containing query parameters with spaces (?company=Alpha Corp&source=mailcraft)
  return text.replace(
    /(mailto:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|https?:\/\/[^\s<>"']+(?:\s+[a-zA-Z0-9_.~%-]+=[^\s<>"']+)*)/gi,
    (fullMatch) => {
      let url = fullMatch.trim();
      let trailing = "";

      // Strip trailing punctuation
      while (url.length > 0) {
        const lastChar = url[url.length - 1];
        if (/[.,!?:;]/.test(lastChar)) {
          trailing = lastChar + trailing;
          url = url.slice(0, -1);
        } else if (lastChar === ")" && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) {
          trailing = lastChar + trailing;
          url = url.slice(0, -1);
        } else if (lastChar === "]" && (url.match(/\[/g) || []).length < (url.match(/\]/g) || []).length) {
          trailing = lastChar + trailing;
          url = url.slice(0, -1);
        } else {
          break;
        }
      }

      if (!url || !isSafeUrl(url)) {
        return fullMatch;
      }

      // Encode spaces in href
      const encodedUrl = url.replace(/ /g, "%20");
      const safeHref = escapeHtml(encodedUrl);
      const displayText = escapeHtml(url);

      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="${EMAIL_LINK_STYLE}">${displayText}</a>${trailing}`;
    }
  );
}

/**
 * Scans an HTML string:
 * - Ensures all existing <a> tags are safely styled with standard blue underline.
 * - Auto-links any raw URLs in text nodes outside existing <a> tags.
 * - Converts Markdown formatting (**bold**, [text](url), etc.) and unescapes markdown slashes in text nodes.
 */
export function autoLinkHtml(html: string): string {
  if (!html) return "";

  // 1. Style and normalize existing <a ...> tags
  const styledHtml = html.replace(/<a(\s[^>]*)>([\s\S]*?)<\/a>/gi, (match, attrs, inner) => {
    const hrefMatch = attrs.match(/\bhref="([^"]*)"/i);
    let href = hrefMatch ? hrefMatch[1] : "";
    // Clean escape slashes inside href
    href = unescapeMarkdownChars(href);

    if (!isSafeUrl(href)) return inner;

    const cleanAttrs = attrs
      .replace(/\btarget="[^"]*"/gi, "")
      .replace(/\brel="[^"]*"/gi, "")
      .replace(/\bstyle="[^"]*"/gi, "")
      .replace(/\bhref="[^"]*"/i, `href="${escapeHtml(href)}"`)
      .trim();

    // Ensure any nested <span> inside <a> also inherits blue color & underline
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
        ? `${filtered}; ${EMAIL_LINK_STYLE}`
        : EMAIL_LINK_STYLE;
      return `<span ${rest ? rest + " " : ""}style="${newStyle}">`;
    });

    const attrStr = cleanAttrs ? ` ${cleanAttrs}` : "";
    return `<a${attrStr} target="_blank" rel="noopener noreferrer" style="${EMAIL_LINK_STYLE}">${styledInner}</a>`;
  });

  // 2. Process text nodes outside existing tags: convert markdown syntax & autolink URLs
  const tagRegex = /(<\/?[a-zA-Z][^>]*>|<!--[\s\S]*?-->)/g;
  let inAnchor = 0;
  let lastIndex = 0;
  let result = "";
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(styledHtml)) !== null) {
    const textBetween = styledHtml.substring(lastIndex, match.index);
    const tag = match[0];

    if (inAnchor === 0 && textBetween) {
      let processed = unescapeMarkdownChars(textBetween);
      processed = convertMarkdownLinks(processed);
      processed = convertMarkdownInline(processed);
      processed = autoLinkText(processed);
      result += processed;
    } else {
      result += textBetween;
    }

    if (/^<a\b/i.test(tag)) {
      inAnchor++;
    } else if (/^<\/a>/i.test(tag)) {
      inAnchor = Math.max(0, inAnchor - 1);
    }

    result += tag;
    lastIndex = tagRegex.lastIndex;
  }

  const remaining = styledHtml.substring(lastIndex);
  if (inAnchor === 0 && remaining) {
    let processed = unescapeMarkdownChars(remaining);
    processed = convertMarkdownLinks(processed);
    processed = convertMarkdownInline(processed);
    processed = autoLinkText(processed);
    result += processed;
  } else {
    result += remaining;
  }

  return result;
}

/**
 * Canonical email compilation pipeline:
 * Template -> compileTemplate() -> Final HTML (used for both Preview and Graph sendMail)
 */
export function compileTemplate(template: string, data?: Record<string, string>): string {
  if (!template) return "";

  if (isHtml(template)) {
    // For HTML templates (e.g. from DOCX or rich email), template markup is trusted HTML.
    // Plain-text spreadsheet values must be escaped exactly once so they don't break HTML or double-encode.
    const rendered = data ? renderTemplate(template, data, { escapeHtml: true }) : template;
    const cleaned = cleanHtmlWhitespace(rendered);
    return autoLinkHtml(cleaned);
  }

  // For plain text templates, merge placeholders as plain text, then compile plain text to HTML with escaping.
  const rendered = data ? renderTemplate(template, data, { escapeHtml: false }) : template;
  const compiled = compilePlainText(rendered);
  return autoLinkHtml(compiled);
}

