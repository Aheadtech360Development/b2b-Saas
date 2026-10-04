/**
 * Custom HTML and CSS made safe — the editor's copy of the server's rules
 * (backend/app/services/builder/sanitize.py).
 *
 * The storefront never relies on this: what a shopper gets was cleaned by the
 * server on the way out. This is for the editor, which draws the draft as the
 * merchant types it, before any of it has been to the server — and a script
 * pasted into a block would otherwise run in the admin's own session.
 *
 * Allowlists, as on the server: what is not recognised is removed.
 */

const ALLOWED_TAGS = new Set([
  "a", "abbr", "article", "aside", "b", "blockquote", "br", "caption", "cite",
  "code", "col", "colgroup", "dd", "del", "details", "div", "dl", "dt", "em",
  "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "i", "img", "ins", "kbd", "li", "main", "mark", "nav", "ol",
  "p", "picture", "pre", "q", "s", "section", "small", "source", "span",
  "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th",
  "thead", "time", "tr", "u", "ul",
]);

const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "noscript", "template",
  "form", "input", "button", "select", "textarea", "link", "meta", "base",
  "frame", "frameset", "applet", "svg", "math",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  "*": new Set(["class", "style", "title", "dir", "lang", "role", "aria-label", "aria-hidden"]),
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading", "srcset", "sizes"]),
  source: new Set(["srcset", "media", "type", "sizes"]),
  td: new Set(["colspan", "rowspan", "align"]),
  th: new Set(["colspan", "rowspan", "align", "scope"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  time: new Set(["datetime"]),
  ol: new Set(["start", "reversed", "type"]),
  details: new Set(["open"]),
};

const SAFE_URL = /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i;

const ALLOWED_CSS = new Set([
  "align-items", "align-self", "background", "background-color", "background-image",
  "background-position", "background-repeat", "background-size", "border",
  "border-bottom", "border-color", "border-left", "border-radius", "border-right",
  "border-style", "border-top", "border-width", "box-shadow", "color", "column-gap",
  "display", "flex", "flex-basis", "flex-direction", "flex-grow", "flex-shrink",
  "flex-wrap", "font-family", "font-size", "font-style", "font-weight", "gap",
  "grid-column", "grid-row", "grid-template-columns", "grid-template-rows", "height",
  "justify-content", "letter-spacing", "line-height", "list-style", "margin",
  "margin-bottom", "margin-left", "margin-right", "margin-top", "max-height",
  "max-width", "min-height", "min-width", "object-fit", "object-position", "opacity",
  "overflow", "padding", "padding-bottom", "padding-left", "padding-right",
  "padding-top", "position", "row-gap", "text-align", "text-decoration",
  "text-transform", "transform", "transition", "vertical-align", "white-space",
  "width", "word-break", "z-index", "top", "left", "right", "bottom", "aspect-ratio",
  "font-variant", "text-shadow", "filter", "inset",
]);

const CSS_DANGER = /expression\s*\(|javascript:|vbscript:|@import|behaviou?r\s*:|-moz-binding|<\//i;
const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

/** An inline style, with only the safe declarations kept. */
export function cleanStyle(style: string): string {
  const kept: string[] = [];
  for (const decl of (style || "").split(";")) {
    if (!decl.trim() || !decl.includes(":")) continue;
    const at = decl.indexOf(":");
    const prop = decl.slice(0, at).trim().toLowerCase();
    const value = decl.slice(at + 1).trim();
    if (!ALLOWED_CSS.has(prop) || CSS_DANGER.test(value)) continue;
    if (prop === "position" && /^(fixed|sticky)$/i.test(value)) continue;
    let badUrl = false;
    for (const m of value.matchAll(CSS_URL)) if (!/^https:\/\//i.test((m[2] ?? "").trim())) badUrl = true;
    if (badUrl) continue;
    kept.push(`${prop}: ${value}`);
  }
  return kept.join("; ");
}

/** Pasted markup, reduced to content that cannot run anything. */
export function cleanHtml(html: string): string {
  if (!html) return "";
  // Parsed into a document that is never shown: nothing in it loads or runs.
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, "text/html");

  const strip = (root: Node) => {
    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType === 8) { child.parentNode?.removeChild(child); continue; } // a comment
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const name = el.tagName.toLowerCase();
      if (DROP_WITH_CONTENT.has(name)) { el.remove(); continue; }
      strip(el);
      if (!ALLOWED_TAGS.has(name)) { el.replaceWith(...Array.from(el.childNodes)); continue; }
      const allowed = new Set([...ALLOWED_ATTRS["*"]!, ...(ALLOWED_ATTRS[name] ?? [])]);
      for (const attr of Array.from(el.attributes)) {
        const low = attr.name.toLowerCase();
        if (low.startsWith("on")) { el.removeAttribute(attr.name); continue; }
        if (low.startsWith("data-")) continue;
        if (!allowed.has(low)) { el.removeAttribute(attr.name); continue; }
        if ((low === "href" || low === "src") && !SAFE_URL.test(attr.value.trim())) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (low === "srcset" && !attr.value.split(",").every((p) => !p.trim() || SAFE_URL.test(p.trim().split(/\s+/)[0] ?? ""))) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (low === "style") {
          const styled = cleanStyle(attr.value);
          if (styled) el.setAttribute("style", styled);
          else el.removeAttribute("style");
        }
      }
      if (name === "a" && (el.getAttribute("target") || "").toLowerCase() === "_blank") {
        el.setAttribute("rel", "noopener noreferrer");
      }
    }
  };
  strip(doc.body);
  return doc.body.innerHTML;
}

/**
 * A block's custom CSS, confined to that block: every selector is put under
 * the block's own attribute. @media is kept with its contents scoped; every
 * other at-rule is dropped.
 */
export function scopeCss(css: string, scope: string): string {
  const text = (css || "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (CSS_DANGER.test(text.replace(/@import/gi, ""))) return "";

  const scoped = (chunk: string): string[] => {
    const rules: string[] = [];
    for (const m of chunk.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = (m[1] ?? "").trim();
      if (!selectors || selectors.startsWith("@")) continue;
      const body = cleanStyle(m[2] ?? "");
      if (!body) continue;
      const list = selectors.split(",").map((s) => s.trim()).filter(Boolean)
        .map((s) => (s === ":host" || s === "&" ? scope : `${scope} ${s}`));
      rules.push(`${list.join(", ")} { ${body} }`);
    }
    return rules;
  };

  const out: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    const at = text.indexOf("@", pos);
    if (at === -1) { out.push(...scoped(text.slice(pos))); break; }
    out.push(...scoped(text.slice(pos, at)));
    const brace = text.indexOf("{", at);
    const semi = text.indexOf(";", at);
    // A statement at-rule (@import, @charset) ends at its semicolon.
    if (semi !== -1 && (brace === -1 || semi < brace)) { pos = semi + 1; continue; }
    if (brace === -1) break;
    const header = text.slice(at, brace).trim();
    let depth = 0;
    let end = brace;
    for (; end < text.length; end++) {
      if (text[end] === "{") depth++;
      else if (text[end] === "}") { depth--; if (depth === 0) break; }
    }
    const inner = text.slice(brace + 1, end);
    if (/^@media\s[^{]+$/i.test(header)) {
      const rules = scoped(inner);
      if (rules.length) out.push(`${header} { ${rules.join(" ")} }`);
    }
    pos = end + 1;
  }
  return out.join("\n");
}

/** A link the page may point at: a path, a web address, mail, phone or an anchor. */
export function safeHref(href: unknown): string {
  const v = typeof href === "string" ? href.trim() : "";
  return v && SAFE_URL.test(v) ? v : "";
}

/** A picture address that may go into CSS or an img: https, or a path on the shop. */
export function safeSrc(src: unknown): string {
  const v = typeof src === "string" ? src.trim() : "";
  return /^(https:\/\/|\/(?!\/))[^\s"'()<>\\]+$/.test(v) ? v : "";
}
