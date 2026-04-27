import DOMPurify from "dompurify";

/**
 * Markdown-lite renderer for message bubbles.
 *
 * Supports:
 *   - **bold**          → <strong>
 *   - _italic_          → <em>
 *   - `code`            → <code>
 *   - ```code block```  → <pre><code>
 *   - URLs              → <a target="_blank" rel="noopener noreferrer">
 *   - newlines          → <br>
 *
 * Stored content stays raw — render is purely client-side and is run through
 * DOMPurify with an explicit allowlist before reaching the DOM.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const URL_RE = /\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g;

interface Token {
  start: number;
  end: number;
  html: string;
}

function tokensFor(content: string): Token[] {
  const tokens: Token[] = [];

  // Code blocks (triple backtick) win over everything else; capture them first.
  const blockRe = /```([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(content))) {
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      html: `<pre><code>${escapeHtml(m[1])}</code></pre>`,
    });
  }

  // Helper to test whether a span overlaps any earlier token.
  function overlaps(start: number, end: number): boolean {
    return tokens.some((t) => !(end <= t.start || start >= t.end));
  }

  // Inline code
  const codeRe = /`([^`\n]+?)`/g;
  while ((m = codeRe.exec(content))) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      html: `<code>${escapeHtml(m[1])}</code>`,
    });
  }

  // Bold
  const boldRe = /\*\*(.+?)\*\*/g;
  while ((m = boldRe.exec(content))) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    tokens.push({
      start: m.index,
      end: m.index + m[0].length,
      html: `<strong>${escapeHtml(m[1])}</strong>`,
    });
  }

  // Italic — underscore form (avoid colliding with snake_case URLs which we
  // already escaped). We're conservative: require word boundaries around `_`.
  const italicRe = /(^|[^\w])_([^_\n]+?)_(?=$|[^\w])/g;
  while ((m = italicRe.exec(content))) {
    const start = m.index + m[1].length;
    const end = start + m[0].length - m[1].length;
    if (overlaps(start, end)) continue;
    tokens.push({
      start,
      end,
      html: `<em>${escapeHtml(m[2])}</em>`,
    });
  }

  // URLs
  while ((m = URL_RE.exec(content))) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    const url = m[0];
    tokens.push({
      start: m.index,
      end: m.index + url.length,
      html: `<a href="${escapeHtml(
        url,
      )}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`,
    });
  }

  return tokens.sort((a, b) => a.start - b.start);
}

function applyTokens(content: string, tokens: Token[]): string {
  let out = "";
  let cursor = 0;
  for (const t of tokens) {
    if (t.start < cursor) continue; // skip nested overlaps
    out += escapeHtml(content.slice(cursor, t.start));
    out += t.html;
    cursor = t.end;
  }
  out += escapeHtml(content.slice(cursor));
  return out.replace(/\n/g, "<br>");
}

export function renderMarkdownLite(content: string): string {
  if (!content) return "";
  const tokens = tokensFor(content);
  const html = applyTokens(content, tokens);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "strong",
      "em",
      "code",
      "pre",
      "a",
      "br",
      "span",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
    ALLOW_DATA_ATTR: false,
  });
}

/** Pre-compile a memoised cache so the same content renders only once. */
const cache = new Map<string, string>();
export function renderMarkdownLiteMemo(content: string): string {
  const cached = cache.get(content);
  if (cached !== undefined) return cached;
  const out = renderMarkdownLite(content);
  if (cache.size >= 200) cache.clear();
  cache.set(content, out);
  return out;
}
