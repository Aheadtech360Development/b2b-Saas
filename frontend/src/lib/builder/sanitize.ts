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
  "frame", "frameset", "applet", "math",
]);

/** Drawings — icons, stars, logos — as the server allows them: shapes and colours only, inside an <svg>. */
const SVG_TAGS = new Set([
  "svg", "g", "path", "polygon", "polyline", "circle", "ellipse", "rect", "line",
  "defs", "lineargradient", "radialgradient", "stop", "clippath", "mask", "symbol",
  "use", "title", "desc", "text", "tspan",
]);
const SVG_ATTRS = new Set([
  "viewbox", "xmlns", "xmlns:xlink", "version", "width", "height", "fill", "fill-opacity",
  "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "stroke-dashoffset", "stroke-miterlimit", "stroke-opacity", "opacity", "d", "points", "cx",
  "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "dx", "dy", "fx", "fy", "transform",
  "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "spreadmethod",
  "preserveaspectratio", "id", "clip-path", "clip-rule", "mask", "maskunits", "clippathunits",
  "href", "xlink:href", "focusable", "vector-effect", "text-anchor", "dominant-baseline",
  "font-size", "font-weight", "font-family", "letter-spacing", "shape-rendering", "color",
  "visibility", "pathlength",
]);
const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_VALUE_DANGER = /javascript:|vbscript:|data:|expression\s*\(|url\(\s*['"]?(?!#)/i;
const FONT_LINK = /^https:\/\/fonts\.googleapis\.com\/css2?\?/i;

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

// Mirrors ALLOWED_CSS_PROPERTIES in backend/app/services/builder/sanitize.py.
const ALLOWED_CSS = new Set([
  "align-items", "align-self", "background", "background-color", "background-image",
  "background-position", "background-repeat", "background-size", "border", "border-bottom",
  "border-color", "border-left", "border-radius", "border-right", "border-style", "border-top",
  "border-width", "box-shadow", "color", "column-gap", "display", "flex", "flex-basis",
  "flex-direction", "flex-grow", "flex-shrink", "flex-wrap", "font-family", "font-size",
  "font-style", "font-weight", "gap", "grid-column", "grid-row", "grid-template-columns",
  "grid-template-rows", "height", "justify-content", "letter-spacing", "line-height", "list-style",
  "margin", "margin-bottom", "margin-left", "margin-right", "margin-top", "max-height",
  "max-width", "min-height", "min-width", "object-fit", "object-position", "opacity", "overflow",
  "padding", "padding-bottom", "padding-left", "padding-right", "padding-top", "position",
  "row-gap", "text-align", "text-decoration", "text-transform", "transform", "transition",
  "vertical-align", "white-space", "width", "word-break", "z-index", "top", "left", "right",
  "bottom", "aspect-ratio", "font-variant", "text-shadow", "filter", "inset", "box-sizing",
  "cursor", "outline", "outline-color", "outline-offset", "outline-style", "outline-width",
  "-webkit-font-smoothing", "-moz-osx-font-smoothing", "text-rendering",
  "-webkit-tap-highlight-color", "align-content", "justify-items", "justify-self", "place-items",
  "place-content", "place-self", "order", "flex-flow", "grid-area", "grid-template",
  "grid-template-areas", "grid-auto-flow", "grid-auto-rows", "grid-auto-columns",
  "grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end", "clip-path", "clip",
  "container", "container-type", "container-name", "border-collapse", "border-spacing",
  "table-layout", "caption-side", "content", "counter-reset", "counter-increment", "quotes",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "stroke-dashoffset", "overflow-x", "overflow-y", "overflow-wrap", "word-wrap", "text-overflow",
  "text-wrap", "hyphens", "text-indent", "text-decoration-color", "text-decoration-line",
  "text-decoration-style", "text-decoration-thickness", "text-underline-offset", "list-style-type",
  "list-style-position", "font", "font-feature-settings", "font-variant-numeric", "font-stretch",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius",
  "border-bottom-right-radius", "border-top-color", "border-right-color", "border-bottom-color",
  "border-left-color", "border-top-width", "border-right-width", "border-bottom-width",
  "border-left-width", "border-top-style", "border-right-style", "border-bottom-style",
  "border-left-style", "background-clip", "-webkit-background-clip", "-webkit-text-fill-color",
  "background-attachment", "background-origin", "background-blend-mode", "backdrop-filter",
  "-webkit-backdrop-filter", "mix-blend-mode", "isolation", "transform-origin", "will-change",
  "transition-property", "transition-duration", "transition-timing-function", "transition-delay",
  "pointer-events", "user-select", "visibility", "-webkit-line-clamp", "-webkit-box-orient",
  "line-clamp", "margin-inline", "margin-block", "padding-inline", "padding-block", "accent-color",
  "caret-color", "float", "clear", "columns", "column-count", "column-width",
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
      if (name === "link") {
        const href = el.getAttribute("href") || "";
        if (/stylesheet/i.test(el.getAttribute("rel") || "") && FONT_LINK.test(href)) {
          for (const a of Array.from(el.attributes)) el.removeAttribute(a.name);
          el.setAttribute("rel", "stylesheet");
          el.setAttribute("href", href);
          continue;
        }
      }
      if (SVG_TAGS.has(name) && el.namespaceURI === SVG_NS) {
        strip(el);
        for (const attr of Array.from(el.attributes)) {
          const low = attr.name.toLowerCase();
          let keep = (SVG_ATTRS.has(low) || ALLOWED_ATTRS["*"]!.has(low)) && !low.startsWith("on");
          if (keep && (low === "href" || low === "xlink:href") && !attr.value.trim().startsWith("#")) keep = false;
          if (keep && SVG_VALUE_DANGER.test(attr.value)) keep = false;
          if (keep && low === "style") {
            const styled = cleanStyle(attr.value);
            if (styled) { el.setAttribute(attr.name, styled); continue; }
            keep = false;
          }
          if (!keep) el.removeAttribute(attr.name);
        }
        continue;
      }
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
 * the block's own attribute. @media, @supports and @container are kept with
 * their contents scoped; every other at-rule is dropped.
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
    if (/^@(media|supports|container)\s[^{]+$/i.test(header)) {
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
