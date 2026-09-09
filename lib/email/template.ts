/**
 * Email template compilation and placeholder replacement.
 * Canonical path: Template -> compileTemplate() -> Final HTML
 */

/**
 * Checks if a string contains HTML block-level elements or root tags.
 * If true, the template is considered pre-formatted HTML (e.g. from DOCX or rich email editor).
 */
export function isHtml(text: string): boolean {
  if (!text) return false;
  return /<\s*(?:p|div|table|tr|td|th|tbody|thead|tfoot|h[1-6]|ul|ol|li|blockquote|header|footer|section|article|html|body|head|style)\b[^>]*>/i.test(text);
}

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

/**
 * Compiles a plain text draft into canonical email HTML:
 * - HTML characters (&, <, >, ", ') are safely escaped.
 * - Paragraphs separated by blank lines (2+ newlines) become <p> blocks with consistent inline spacing.
 * - Single newlines within a paragraph become <br />.
 * - Multiple consecutive spaces are preserved as non-breaking spaces.
 */
export function compilePlainText(text: string): string {
  if (!text) return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/);

  return paragraphs
    .map(para => {
      if (!para.trim()) return "";
      // 1. Safely escape HTML characters in raw text
      const escaped = escapeHtml(para);
      // 2. Preserve runs of 2+ spaces as non-breaking spaces so intentional indentation/spacing is kept
      const preservedSpaces = escaped.replace(/ {2}/g, " &nbsp;");
      // 3. Convert single newlines inside paragraph to <br />
      const withBr = preservedSpaces.replace(/\n/g, "<br />");
      return `<p style="margin: 0 0 12px 0; line-height: 1.5;">${withBr}</p>`;
    })
    .filter(Boolean)
    .join("");
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
    return cleanHtmlWhitespace(rendered);
  }

  // For plain text templates, merge placeholders as plain text, then compile plain text to HTML with escaping.
  const rendered = data ? renderTemplate(template, data, { escapeHtml: false }) : template;
  return compilePlainText(rendered);
}
