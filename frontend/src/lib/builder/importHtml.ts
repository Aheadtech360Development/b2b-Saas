/**
 * A finished HTML design, turned into the builder's own elements: Site
 * builder → Pages → "Import a design".
 *
 * The design is opened in a hidden frame with its scripts off, so the browser
 * lays it out with the design's own CSS. Every visible element is then read
 * as it is drawn (colours, type, spacing, layout) and written as the
 * builder's own elements: a band of the page becomes a Section, a box of
 * things a Stack (down, across or a grid, as the design lays it out), a title
 * a Heading, a paragraph Text or Rich text, a picture an Image, a link that
 * looks like a button a Button. The same is read again at a tablet's and a
 * phone's width, and what changes there is kept for those devices, the way
 * the builder keeps it. So the result is edited like anything made in the
 * builder, and it has a phone layout, not a shrunk desktop.
 *
 * Where the builder has a working element, that element is used, so the shop
 * works: the header's links become a real menu (a drawer on phones), its
 * cart, search and account links the shop's own, a grid of product cards a
 * Product grid of the shop's products, an email box the shop's signup.
 *
 * Nothing is uploaded or saved here. Pictures the design carries inside it
 * (data: addresses) or beside it (files picked with it) are listed for the
 * dialog to upload; applyImport() then writes the result into the draft.
 */
import { RESERVED_SLUGS } from "./doc";
import { GOOGLE_FONTS } from "./fonts";
import { BY_TYPE } from "./registry";
import { TRACKS_OK } from "./style";
import { cleanHtml, safeHref } from "./sanitize";
import { newId } from "./tree";
import type { BuilderNode, MenuItem, SiteDoc, Template } from "./types";

/** The widths a design is read at: a laptop, a tablet, a phone. */
export const IMPORT_WIDTHS = { desktop: 1280, tablet: 820, mobile: 390 } as const;
/** A design bigger than this would not fit a site (the server's limit is 3000 elements). */
export const IMPORT_MAX_NODES = 2600;
/** Relative addresses in the design resolve under this, so they can be told apart. */
const LOCAL = "https://local.invalid/";

type Style = Record<string, string | number>;
type At = "style" | "tablet" | "mobile";

/** Where an uploaded picture's address goes once it has one. */
export interface AssetUse { node: BuilderNode; prop?: string; at?: At; key?: string; from?: string }
/** A picture to upload: one the design carries inside itself, or a file picked with it. */
export interface ImportAsset { key: string; name: string; source: string | File; uses: AssetUse[] }

export interface ImportedPage { title: string; key: string; tree: BuilderNode; sections: number }

export interface ImportedDesign {
  pages: ImportedPage[];
  announcement: BuilderNode | null;
  header: BuilderNode | null;
  footer: BuilderNode | null;
  /** The header's links, for a menu of the shop's own, and the element to point at it. */
  menu: { node: BuilderNode; items: MenuItem[] } | null;
  fonts: { family: string; weights: number[] }[];
  headingFont: string | null;
  bodyFont: string | null;
  containerWidth: number | null;
  colors: { background?: string; text?: string; primary?: string; surface?: string; border?: string; muted?: string };
  assets: ImportAsset[];
  warnings: string[];
  count: number;
}

// ── Small readers ────────────────────────────────────────────────────────────

const num = (v: string | null | undefined): number => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : 0;
};
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const px = (n: number) => `${round(n)}px`;

/** A computed colour as #RRGGBB, or #RRGGBBAA when see-through; null when invisible. */
export function hexColour(v: string): string | null {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec((v || "").trim());
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? num(m[4]) / 100 : num(m[4]);
  if (a <= 0.004) return null;
  const hex = [m[1], m[2], m[3]]
    .map((x) => Math.max(0, Math.min(255, Math.round(num(x)))).toString(16).padStart(2, "0")).join("");
  return a >= 0.996 ? `#${hex}`.toUpperCase() : `#${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`.toUpperCase();
}

/** Two colours mixed: `t` of the way from `a` to `b`, as #RRGGBB. */
export function mixHex(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}

const tag = (el: Element) => el.tagName.toLowerCase();
const isEl = (n: Node | null | undefined): n is Element => !!n && n.nodeType === 1;
const classOf = (el: Element) => (typeof el.className === "string" ? el.className : el.getAttribute("class") || "");

/** Text as a person reads it: spaces collapsed, a <br> a new line. */
function readText(el: Element, cs?: CSSStyleDeclaration): string {
  const pre = cs && /^pre/.test(cs.whiteSpace);
  let out = "";
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 3) out += pre ? c.textContent ?? "" : (c.textContent ?? "").replace(/\s+/g, " ");
      else if (isEl(c)) {
        const t = tag(c);
        if (t === "br") { out += "\n"; continue; }
        if (t === "script" || t === "style" || t === "svg" || t === "template") continue;
        // Words in boxes of their own ("Exit 1" over "Cards & mail") are apart, as
        // a person reads them; words the design hides are not read at all.
        const display = c.ownerDocument?.defaultView?.getComputedStyle(c).display ?? "";
        if (display === "none") continue;
        const apart = /^(block|flex|grid|list-item|table|flow-root)/.test(display);
        if (apart) out += " ";
        walk(c);
        if (apart) out += " ";
      }
    }
  };
  walk(el);
  return out.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escapeAttr(s: string) { return escapeHtml(s).replace(/"/g, "&quot;"); }
function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ── The design's declared sizes ──────────────────────────────────────────────
// Computed widths are always pixels: they cannot tell "50%" from "600px" or
// from "as wide as its words". The design's own rules can, so sizes are read
// from them (inline style first, then the matching rule with the most weight).

const SIZE_PROPS = ["width", "max-width", "min-width", "height", "min-height", "flex-basis", "aspect-ratio",
  "margin-left", "margin-right", "margin-top", "margin-bottom", "grid-template-columns"];

function specificity(sel: string): number {
  const s = sel.replace(/::?(before|after|first-line|first-letter|placeholder|selection|marker)\b/g, "");
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!not|is|where)[\w-]+(\([^)]*\))?/g) ?? []).length;
  const els = (s.replace(/\[[^\]]*\]|\([^)]*\)/g, "").match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) ?? []).length;
  return ids * 10000 + cls * 100 + els;
}

function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

class Declared {
  private rules: { parts: { sel: string; spec: number }[]; style: CSSStyleDeclaration; order: number }[] = [];
  private cache = new Map<Element, { spec: number; order: number; style: CSSStyleDeclaration }[]>();

  constructor(private doc: Document, private win: Window) { this.refresh(); }

  /** Read the rules again: at another width other media rules apply. */
  refresh() {
    this.rules = [];
    this.cache.clear();
    let order = 0;
    const visit = (list: CSSRuleList) => {
      for (const r of Array.from(list)) {
        order++;
        if (r.type === 1) {
          const st = (r as CSSStyleRule).style;
          if (SIZE_PROPS.some((p) => st.getPropertyValue(p))) {
            const parts = splitSelectors((r as CSSStyleRule).selectorText)
              .filter((p) => !/::/.test(p)).map((sel) => ({ sel, spec: specificity(sel) }));
            if (parts.length) this.rules.push({ parts, style: st, order });
          }
        } else if (r.type === 4) {
          const m = r as CSSMediaRule;
          if (this.win.matchMedia(m.media.mediaText).matches) visit(m.cssRules);
        } else if ("cssRules" in r) {
          try { visit((r as CSSGroupingRule).cssRules); } catch { /* not readable */ }
        }
      }
    };
    for (const sheet of Array.from(this.doc.styleSheets)) {
      try { visit(sheet.cssRules); } catch { /* another site's stylesheet: nothing to read */ }
    }
  }

  get(el: Element, prop: string): string {
    const inline = (el as HTMLElement).style?.getPropertyValue(prop);
    if (inline) return inline.trim();
    let list = this.cache.get(el);
    if (!list) {
      list = [];
      for (const r of this.rules) {
        let best = -1;
        for (const p of r.parts) {
          try { if (p.spec > best && el.matches(p.sel)) best = p.spec; } catch { /* a selector this browser does not know */ }
        }
        if (best >= 0) list.push({ spec: best, order: r.order, style: r.style });
      }
      list.sort((a, b) => b.spec - a.spec || b.order - a.order);
      this.cache.set(el, list);
    }
    for (const r of list) {
      const v = r.style.getPropertyValue(prop);
      if (v) return v.trim();
    }
    return "";
  }
}

// ── Pictures ─────────────────────────────────────────────────────────────────

class Assets {
  readonly list = new Map<string, ImportAsset>();
  constructor(private files: Map<string, File>, private warn: (m: string) => void, private blobs: Map<string, File> = new Map()) {}

  /**
   * An address the shop can show. A web address is kept; one inside the
   * design or beside it is listed for upload and stands in until then; one
   * that cannot be had is "" (and said so).
   */
  use(raw: string, use: AssetUse): string {
    const url = (raw || "").trim();
    if (!url) return "";
    // A picture of the design's folder, shown while reading from this page's own copy of the file.
    if (url.startsWith("blob:")) {
      const file = this.blobs.get(url);
      if (!file) return "";
      this.add(`file:${file.name.toLowerCase()}`, file.name, file, { ...use, from: url });
      return url;
    }
    if (url.startsWith(LOCAL)) {
      const name = decodeURIComponent(url.slice(LOCAL.length).split(/[?#]/)[0]!.split("/").pop() || "");
      const file = this.files.get(name.toLowerCase());
      if (!file) {
        this.warn(`The picture “${name || "(no name)"}” sits beside the HTML file. Pick it together with the HTML file to bring it in.`);
        return "";
      }
      this.add(`file:${name.toLowerCase()}`, file.name, file, { ...use, from: url });
      return url;
    }
    if (/^data:image\//i.test(url)) {
      const type = /^data:image\/([a-z0-9.+-]+)/i.exec(url)?.[1] ?? "png";
      this.add(url, `picture.${type.replace("svg+xml", "svg").replace("jpeg", "jpg")}`, url, { ...use, from: url });
      return url;
    }
    if (/^https:\/\//i.test(url)) return url;
    if (/^http:\/\//i.test(url)) return url.replace(/^http:/i, "https:");
    return "";
  }

  private add(key: string, name: string, source: string | File, use: AssetUse) {
    const found = this.list.get(key);
    if (found) found.uses.push(use);
    else this.list.set(key, { key, name, source, uses: [use] });
  }
}

// ── Reading one element ──────────────────────────────────────────────────────

interface Env {
  win: Window;
  doc: Document;
  declared: Declared;
  assets: Assets;
  warn: (m: string) => void;
  fonts: Map<string, Set<number>>;
  link: (href: string | null, label?: string) => string;
  /** Every element written, with how to read it again at another width. */
  recs: Rec[];
  /** The width being read now. */
  at: At;
}

interface Rec {
  el: Element;
  node: BuilderNode;
  read: (cs: CSSStyleDeclaration) => Style;
  /** A store element (menu, cart): it has its own phone behaviour, so it is never hidden or restyled per device. */
  keep?: boolean;
  /** Columns of a product grid at this width. */
  columns?: () => number;
}

const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif",
  "ui-serif", "-apple-system", "blinkmacsystemfont", "segoe ui", "inherit", "initial"]);

/** Fonts a site can have: the design's own Google Fonts and the builder's catalogue. Set when a design is read. */
let LOADABLE: Set<string> = new Set();

/**
 * The font an element is drawn in: the first in its stack the site can have.
 * A design's stack often starts with a small local font for a few signs
 * ("Sep", then Overpass): the words themselves are in the one after it.
 */
function familyOf(cs: CSSStyleDeclaration): string {
  const stack = (cs.fontFamily || "").split(",").map((f) => f.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  return stack.find((f) => LOADABLE.has(f)) ?? stack[0] ?? "";
}

function family(cs: CSSStyleDeclaration, env: Env): string | null {
  const first = familyOf(cs);
  if (!first || GENERIC_FAMILIES.has(first.toLowerCase())) return null;
  const set = env.fonts.get(first) ?? new Set<number>();
  set.add(Math.round(num(cs.fontWeight) / 100) * 100 || 400);
  env.fonts.set(first, set);
  return first;
}

/** Type, as drawn: what a text element always carries, so the builder's defaults never show through. */
function typeStyle(cs: CSSStyleDeclaration, env: Env, opts: { decoration?: boolean } = {}): Style {
  const s: Style = {};
  const c = hexColour(cs.color);
  if (c) s.color = c;
  const f = family(cs, env);
  if (f) s.fontFamily = f;
  const size = num(cs.fontSize);
  if (size) s.fontSize = px(size);
  s.fontWeight = Math.round(num(cs.fontWeight)) || 400;
  if (cs.fontStyle === "italic") s.fontStyle = "italic";
  const lh = cs.lineHeight;
  if (lh && lh !== "normal" && size) s.lineHeight = String(round(num(lh) / size, 2));
  const ls = cs.letterSpacing;
  if (ls && ls !== "normal" && num(ls) !== 0) s.letterSpacing = px(num(ls));
  if (cs.textTransform && cs.textTransform !== "none") s.textTransform = cs.textTransform;
  const align = cs.textAlign;
  s.textAlign = align === "center" || align === "right" || align === "justify" ? align : align === "end" ? "right" : "left";
  if (opts.decoration) s.textDecoration = /underline/.test(cs.textDecorationLine || cs.textDecoration) ? "underline" : "none";
  return s;
}

/** Nothing of its own to draw: no colour, picture, line, shadow, corner or padding. */
function plainBox(cs: CSSStyleDeclaration): boolean {
  if (hexColour(cs.backgroundColor) || (cs.backgroundImage && cs.backgroundImage !== "none")) return false;
  if (cs.boxShadow && cs.boxShadow !== "none") return false;
  for (const side of ["top", "right", "bottom", "left"]) {
    if (cs.getPropertyValue(`border-${side}-style`) !== "none" && num(cs.getPropertyValue(`border-${side}-width`)) > 0) return false;
    if (num(cs.getPropertyValue(`padding-${side}`)) > 0) return false;
  }
  return num(cs.borderTopLeftRadius) === 0;
}

/** Padding, background, border, corners, shadow: the box an element draws. */
function boxStyle(cs: CSSStyleDeclaration, env: Env, node: BuilderNode): Style {
  const s: Style = {};
  const pad = ["Top", "Right", "Bottom", "Left"].map((side) => num(cs.getPropertyValue(`padding-${side.toLowerCase()}`)));
  if (pad.every((p) => p === pad[0])) s.padding = px(pad[0]!);
  else ["Top", "Right", "Bottom", "Left"].forEach((side, i) => { s[`padding${side}`] = px(pad[i]!); });

  s.backgroundColor = hexColour(cs.backgroundColor) ?? "transparent";
  const image = cs.backgroundImage;
  s.backgroundImage = "none";
  if (image && image !== "none") {
    let value = image;
    let lost = false;
    for (const m of Array.from(image.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g))) {
      const got = env.assets.use(m[2] ?? "", { node, at: env.at, key: "backgroundImage" });
      if (!got) lost = true;
      else if (got !== m[2]) value = value.replace(m[2]!, got);
    }
    if (!lost) {
      s.backgroundImage = value.replace(/url\("([^"]*)"\)/g, "url($1)");
      s.backgroundSize = cs.backgroundSize || "auto";
      s.backgroundPosition = cs.backgroundPosition || "0% 0%";
      s.backgroundRepeat = cs.backgroundRepeat || "repeat";
    }
  }

  const sides = ["top", "right", "bottom", "left"].map((side) => ({
    w: cs.getPropertyValue(`border-${side}-style`) === "none" ? 0 : num(cs.getPropertyValue(`border-${side}-width`)),
    style: cs.getPropertyValue(`border-${side}-style`),
    color: hexColour(cs.getPropertyValue(`border-${side}-color`)) ?? "transparent",
  }));
  const [top, right, bottom, left] = sides as [typeof sides[0], typeof sides[0], typeof sides[0], typeof sides[0]];
  const same = sides.every((b) => b.w === top.w && b.style === top.style && b.color === top.color);
  s.border = "0px solid transparent";
  if (same && top.w > 0) s.border = `${px(top.w)} ${top.style} ${top.color}`;
  else if (!same && (top.w > 0 || bottom.w > 0) && right.w === 0 && left.w === 0) {
    if (top.w > 0) s.borderTopWidth = px(top.w);
    if (bottom.w > 0) s.borderBottomWidth = px(bottom.w);
    s.borderColor = (top.w > 0 ? top : bottom).color;
  } else if (!same) {
    const thick = sides.reduce((a, b) => (b.w > a.w ? b : a));
    if (thick.w > 0) s.border = `${px(thick.w)} ${thick.style} ${thick.color}`;
  }

  const radius = (cs.borderRadius || "").replace(/\s+/g, " ");
  s.borderRadius = radius.split(" ").some((r) => num(r) > 0) ? radius : "0px";
  s.boxShadow = cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow : "none";
  const o = num(cs.opacity);
  if (cs.opacity !== "" && o > 0 && o < 1) s.opacity = String(round(o, 2));
  if (cs.overflow === "hidden" || cs.overflowX === "hidden") s.overflow = "hidden";
  return s;
}

/** A value written with the design's own variables (height: var(--hdr)), as those variables hold it here. */
function resolveVars(v: string, cs: CSSStyleDeclaration): string {
  for (let i = 0; i < 5 && v.includes("var("); i++) {
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_m, name: string, fallback?: string) =>
      cs.getPropertyValue(name).trim() || (fallback ?? "").trim());
  }
  return v.trim();
}

/** A grid's columns as the design wrote them, when some are as wide as their content (auto); else null. */
function declaredTracks(el: Element, cs: CSSStyleDeclaration, env: Env): string | null {
  let v = resolveVars(env.declared.get(el, "grid-template-columns"), cs);
  if (!v || !/\b(auto|min-content|max-content)\b/.test(v)) return null;
  v = v.replace(/repeat\(\s*(\d+)\s*,\s*([^()]+?)\s*\)/g, (_m, n: string, t: string) => Array(Math.min(12, Number(n))).fill(t).join(" "));
  v = v.replace(/\s+/g, " ").trim();
  return TRACKS_OK.test(v) ? v : null;
}

/** Sizes the design set on purpose: a width, a cap, a least height, a shape. */
function sizeStyle(el: Element, cs: CSSStyleDeclaration, env: Env): Style {
  const s: Style = {};
  const d = (p: string) => resolveVars(env.declared.get(el, p), cs);
  const keep = (v: string) => /^-?\d+(\.\d+)?(px|%|vh|vw|rem|em)$/.test(v) || /^calc\(/.test(v);
  const w = d("width");
  if (w && keep(w)) s.width = /%|vw|vh|calc/.test(w) ? w.replace(/\s+/g, " ") : px(num(cs.width));
  const mw = cs.maxWidth;
  if (mw && mw !== "none") s.maxWidth = /%$/.test(mw) ? mw : px(num(mw));
  const mh = cs.minHeight;
  if (mh && mh !== "auto" && num(mh) > 0) s.minHeight = /vh$/.test(d("min-height")) ? d("min-height") : px(num(mh));
  const h = d("height");
  if (h && keep(h) && !/%/.test(h)) s.height = /vh/.test(h) ? h : px(num(cs.height));
  const ar = cs.aspectRatio;
  if (ar && ar !== "auto" && !/^auto$/.test(ar)) s.aspectRatio = ar.replace(/^auto\s+/, "");
  return s;
}

const flexWord = (v: string) => v.replace(/^start$/, "flex-start").replace(/^end$/, "flex-end").replace(/^self-start$/, "flex-start")
  .replace(/^self-end$/, "flex-end").replace(/^left$/, "flex-start").replace(/^right$/, "flex-end");

/** How a container lays out what is in it, as the builder's layout keys. */
function layoutStyle(cs: CSSStyleDeclaration): { style: Style; direction: "row" | "column" } {
  const s: Style = {};
  const display = cs.display;
  const gapR = cs.rowGap === "normal" ? 0 : num(cs.rowGap);
  const gapC = cs.columnGap === "normal" ? 0 : num(cs.columnGap);
  if (display.includes("grid")) {
    const tracks = cs.gridTemplateColumns.split(/\s+(?![^(]*\))/).filter((t) => t && t !== "none").map(num);
    s.display = "grid";
    if (tracks.length > 1) {
      const min = Math.min(...tracks.filter((t) => t > 0));
      const equal = tracks.every((t) => Math.abs(t - tracks[0]!) <= 2);
      if (equal || tracks.length > 12) s.gridColumns = Math.min(12, tracks.length);
      else s.gridTemplate = tracks.map((t) => `${round(t / (min || 1), 2)}fr`).join(" ");
    } else s.gridColumns = 1;
    s.rowGap = px(gapR);
    s.columnGap = px(gapC);
    const ai = cs.alignItems;
    s.alignItems = ai === "normal" || ai === "stretch" ? "stretch" : flexWord(ai);
    if (cs.justifyItems && !/normal|legacy|stretch/.test(cs.justifyItems)) s.justifyItems = cs.justifyItems;
    // "Across": a grid's cells are not the builder's column of things, which
    // stretches every child whatever the grid says.
    return { style: s, direction: "row" };
  }
  if (display.includes("flex")) {
    const across = cs.flexDirection.startsWith("row");
    s.display = "flex";
    s.flexDirection = across ? "row" : "column";
    s.flexWrap = /wrap/.test(cs.flexWrap) && cs.flexWrap !== "nowrap" ? "wrap" : "nowrap";
    s.justifyContent = cs.justifyContent === "normal" ? "flex-start" : flexWord(cs.justifyContent);
    const ai = cs.alignItems;
    s.alignItems = ai === "normal" || ai === "stretch" ? "stretch" : flexWord(ai);
    s.rowGap = px(gapR);
    s.columnGap = px(gapC);
    return { style: s, direction: across ? "row" : "column" };
  }
  return { style: { display: "flex", flexDirection: "column", alignItems: "stretch" }, direction: "column" };
}

/** Where a child sits in its parent: grown, spanned, aligned, spaced. */
function placeStyle(el: Element, cs: CSSStyleDeclaration, env: Env): Style {
  const s: Style = {};
  const parent = el.parentElement;
  if (!parent) return s;
  const pcs = env.win.getComputedStyle(parent);
  const r = el.getBoundingClientRect();
  if (cs.position === "absolute" || cs.position === "fixed") {
    // A label that floated over its box: now the first thing in it, on its side.
    s.marginTop = "0px";
    s.marginBottom = "8px";
    alignInColumn(el, parent, pcs, r, s);
    if (s.alignSelf === "stretch") s.alignSelf = "flex-start";
    return s;
  }
  const margin = (side: string) => (env.declared.get(el, `margin-${side}`) === "auto" ? "auto" : px(num(cs.getPropertyValue(`margin-${side}`))));
  if (pcs.display.includes("flex")) {
    const grow = num(cs.flexGrow);
    if (grow > 0) s.flexGrow = Math.min(100, Math.round(grow));
    if (num(cs.flexShrink) === 0) s.flexShrink = 0;
    const basis = env.declared.get(el, "flex-basis");
    if (basis && basis !== "auto" && basis !== "content") s.flexBasis = /%$/.test(basis) ? basis : px(num(cs.flexBasis));
    if (cs.alignSelf && cs.alignSelf !== "auto" && cs.alignSelf !== "normal") s.alignSelf = flexWord(cs.alignSelf);
    s.marginTop = margin("top");
    s.marginRight = margin("right");
    s.marginBottom = margin("bottom");
    s.marginLeft = margin("left");
    if (!pcs.flexDirection.startsWith("row") && !s.alignSelf) alignInColumn(el, parent, pcs, r, s);
    // In HTML a thing in a row is never narrower than its longest word; the
    // builder lets it shrink further, which breaks words in two. Its least
    // width is measured here and kept.
    if (pcs.flexDirection.startsWith("row") && cs.minWidth === "auto" && cs.overflow === "visible") {
      const least = minContent(el);
      if (least > 1) s.minWidth = px(Math.ceil(least));
    }
  } else if (pcs.display.includes("grid")) {
    const span = /span\s+(\d+)/.exec(cs.gridColumnEnd)?.[1] ?? /span\s+(\d+)/.exec(cs.gridColumnStart)?.[1];
    const a = parseInt(cs.gridColumnStart, 10);
    const b = parseInt(cs.gridColumnEnd, 10);
    const n = span ? Number(span) : a > 0 && b > a ? b - a : 1;
    if (n > 1) s.gridColumnSpan = Math.min(12, n);
    s.marginTop = margin("top");
    s.marginRight = margin("right");
    s.marginBottom = margin("bottom");
    s.marginLeft = margin("left");
    if (cs.alignSelf && cs.alignSelf !== "auto" && cs.alignSelf !== "normal") s.alignSelf = flexWord(cs.alignSelf);
    else if (!/normal|stretch/.test(pcs.alignItems)) s.alignSelf = flexWord(pcs.alignItems);
  } else {
    // Block flow became a column of the builder's: the space between things is
    // measured (margins that collapse into each other in HTML do not in a
    // column), and a thing narrower than the column keeps its side.
    const prev = previousShown(el, env);
    const pr = parent.getBoundingClientRect();
    const top = prev ? prev.getBoundingClientRect().bottom : pr.top + num(pcs.borderTopWidth) + num(pcs.paddingTop);
    s.marginTop = px(Math.max(-200, r.top - top));
    s.marginBottom = "0px";
    if (!nextShown(el, env)) {
      const gap = pr.bottom - num(pcs.borderBottomWidth) - num(pcs.paddingBottom) - r.bottom;
      if (gap > 0.5) s.marginBottom = px(gap);
    }
    s.marginLeft = "0px";
    s.marginRight = "0px";
    alignInColumn(el, parent, pcs, r, s);
  }
  return s;
}

/** How narrow an element can be without breaking a word: its width at min-content. */
function minContent(el: Element): number {
  const h = el as HTMLElement;
  if (!h.style) return 0;
  const was = h.style.getPropertyValue("width");
  const priority = h.style.getPropertyPriority("width");
  h.style.setProperty("width", "min-content", "important");
  const w = h.getBoundingClientRect().width;
  if (was) h.style.setProperty("width", was, priority);
  else h.style.removeProperty("width");
  return w;
}

function alignInColumn(el: Element, parent: Element, pcs: CSSStyleDeclaration, r: DOMRect, s: Style) {
  const pr = parent.getBoundingClientRect();
  const left = pr.left + num(pcs.borderLeftWidth) + num(pcs.paddingLeft);
  const right = pr.right - num(pcs.borderRightWidth) - num(pcs.paddingRight);
  if (r.width >= right - left - 1.5) { s.alignSelf = "stretch"; return; }
  const gl = r.left - left;
  const gr = right - r.right;
  if (Math.abs(gl - gr) <= 2) s.alignSelf = "center";
  else if (gl < gr) { s.alignSelf = "flex-start"; if (gl > 1) s.marginLeft = px(gl); }
  else s.alignSelf = "flex-end";
  void el;
}

function shown(el: Element, env: Env, allowPlaced = false): boolean {
  const cs = env.win.getComputedStyle(el);
  // A see-through element counts: a design that fades things in as they
  // scroll into view starts them at opacity 0.
  if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
  if (!allowPlaced && (cs.position === "absolute" || cs.position === "fixed")) return false;
  if (cs.display === "contents") return true;
  const r = el.getBoundingClientRect();
  return r.width > 0.5 && r.height > 0.5;
}

function previousShown(el: Element, env: Env): Element | null {
  for (let p = el.previousElementSibling; p; p = p.previousElementSibling) if (shown(p, env)) return p;
  return null;
}
function nextShown(el: Element, env: Env): Element | null {
  for (let p = el.nextElementSibling; p; p = p.nextElementSibling) if (shown(p, env)) return p;
  return null;
}

// ── What an element is ───────────────────────────────────────────────────────

const INLINE = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "dfn", "em", "i", "kbd", "mark", "q", "s",
  "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "br", "del", "ins", "label", "font"]);
const SKIP = new Set(["script", "style", "link", "meta", "noscript", "template", "head", "title", "base", "dialog", "object",
  "embed", "canvas", "map", "area", "audio", "track", "source", "param"]);

/** Only words (and inline marks around them) inside: one text element, not a box of things. */
function isTextLeaf(el: Element, env: Env): boolean {
  let words = false;
  const ok = (n: Node): boolean => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 3) { if ((c.textContent ?? "").trim()) words = true; continue; }
      if (!isEl(c)) continue;
      const t = tag(c);
      if (t === "br") continue;
      if (!INLINE.has(t)) return false;
      const cs = env.win.getComputedStyle(c);
      if (cs.display === "none") continue;
      if (/block|flex|grid|table|list-item/.test(cs.display) && !/inline/.test(cs.display)) return false;
      if (c.querySelector("img,svg,video,iframe,input,select,textarea,button,picture,canvas")) return false;
      // A link that looks like a button is a button of its own, not part of the words.
      if (t === "a" && looksLikeButton(c, cs, env)) return false;
      if (!ok(c)) return false;
    }
    return true;
  };
  return ok(el) && words;
}

function looksLikeButton(el: Element, cs: CSSStyleDeclaration, env: Env): boolean {
  const t = tag(el);
  if (t === "button" || (t === "input" && /^(submit|button)$/i.test(el.getAttribute("type") || ""))) return true;
  const bg = hexColour(cs.backgroundColor);
  const parentBg = el.parentElement ? hexColour(env.win.getComputedStyle(el.parentElement).backgroundColor) : null;
  const padX = num(cs.paddingLeft) + num(cs.paddingRight);
  const padY = num(cs.paddingTop) + num(cs.paddingBottom);
  const bordered = ["top", "right", "bottom", "left"].every((s) => num(cs.getPropertyValue(`border-${s}-width`)) >= 1
    && cs.getPropertyValue(`border-${s}-style`) !== "none");
  if ((bg && bg !== parentBg || cs.backgroundImage !== "none") && padX >= 12) return true;
  return bordered && padX >= 16 && padY >= 6;
}

/** Words with their marks, as safe rich text: bold, links, colours that differ. */
function richHtml(el: Element, base: CSSStyleDeclaration, env: Env): string {
  return richNodes(Array.from(el.childNodes), base, env);
}

function richNodes(nodes: Node[], base: CSSStyleDeclaration, env: Env): string {
  const out: string[] = [];
  const walk = (list: Node[], parentCs: CSSStyleDeclaration) => {
    for (const c of list) {
      if (c.nodeType === 3) { out.push(escapeHtml((c.textContent ?? "").replace(/\s+/g, " "))); continue; }
      if (!isEl(c)) continue;
      const t = tag(c);
      if (t === "br") { out.push("<br>"); continue; }
      const cs = env.win.getComputedStyle(c);
      if (cs.display === "none") continue;
      const close: string[] = [];
      const open: string[] = [];
      if (t === "a") {
        open.push(`<a href="${escapeAttr(env.link(c.getAttribute("href"), readText(c)))}">`);
        close.push("</a>");
      }
      // A mark the design restyled (an <em> drawn upright, in another colour)
      // is written as it is drawn, not as the tag usually is.
      const bold = (t === "strong" || t === "b") && num(cs.fontWeight) >= 600;
      const italic = (t === "em" || t === "i") && /italic|oblique/.test(cs.fontStyle);
      if (bold) { open.push("<strong>"); close.unshift("</strong>"); }
      if (italic) { open.push("<em>"); close.unshift("</em>"); }
      const css: string[] = [];
      const col = hexColour(cs.color);
      if (col && col !== hexColour(parentCs.color)) css.push(`color: ${col}`);
      const fam = familyOf(cs);
      if (fam && fam !== familyOf(parentCs)) { const f = family(cs, env); if (f) css.push(`font-family: '${f.replace(/'/g, "")}'`); }
      if (cs.fontWeight !== parentCs.fontWeight && !bold) css.push(`font-weight: ${Math.round(num(cs.fontWeight))}`);
      if (cs.fontStyle !== parentCs.fontStyle && !italic) css.push(`font-style: ${cs.fontStyle}`);
      if (Math.abs(num(cs.fontSize) - num(parentCs.fontSize)) > 0.5) css.push(`font-size: ${round(num(cs.fontSize) / (num(parentCs.fontSize) || 16), 3)}em`);
      // Set beside the words ("S/Q" then a small "SUPPLY" in the middle of the line, a little apart).
      if (/^(middle|top|bottom|text-top|text-bottom|super|sub)$/.test(cs.verticalAlign)) css.push(`vertical-align: ${cs.verticalAlign}`);
      for (const side of ["left", "right"]) {
        const m = num(cs.getPropertyValue(`margin-${side}`));
        if (Math.abs(m) >= 1) css.push(`margin-${side}: ${px(m)}`);
      }
      const bg = hexColour(cs.backgroundColor);
      if (bg) css.push(`background-color: ${bg}`, `padding: ${cs.padding}`, `border-radius: ${cs.borderRadius}`);
      if (t !== "a" && (cs.textDecorationLine || "none") !== (parentCs.textDecorationLine || "none")) css.push(`text-decoration: ${cs.textDecorationLine || "none"}`);
      if (cs.textTransform !== parentCs.textTransform) css.push(`text-transform: ${cs.textTransform}`);
      if (cs.letterSpacing !== parentCs.letterSpacing && cs.letterSpacing !== "normal") css.push(`letter-spacing: ${cs.letterSpacing}`);
      if (/text/.test(cs.backgroundClip || cs.getPropertyValue("-webkit-background-clip")) && cs.backgroundImage !== "none") {
        css.push(`background-image: ${cs.backgroundImage}`, "-webkit-background-clip: text", "background-clip: text", "-webkit-text-fill-color: transparent");
      }
      if (css.length) { open.push(`<span style="${escapeAttr(css.join("; "))}">`); close.unshift("</span>"); }
      out.push(...open);
      walk(Array.from(c.childNodes), cs);
      out.push(...close);
    }
  };
  walk(nodes, base);
  return out.join("").replace(/\s{2,}/g, " ").trim();
}

// ── Writing elements ─────────────────────────────────────────────────────────

function make(type: string, props: Record<string, unknown> = {}): BuilderNode {
  return { id: newId(), type, props, style: {} };
}

/** What every element already is in the builder: not written, so the site stays small. */
const DEFAULTS: Record<string, string | number> = {
  backgroundColor: "transparent", backgroundImage: "none", border: "0px solid transparent", borderRadius: "0px",
  boxShadow: "none", padding: "0px", marginTop: "0px", marginRight: "0px", marginBottom: "0px", marginLeft: "0px",
  textAlign: "left", alignSelf: "stretch",
};
/** A button is drawn with a border and a colour by default: it always says its own. */
const KEEP_FOR: Record<string, Set<string>> = { button: new Set(["backgroundColor", "border", "borderRadius", "padding"]) };

function clean(s: Style, type: string): Style {
  const out: Style = {};
  const keep = KEEP_FOR[type];
  for (const [k, v] of Object.entries(s)) {
    if (v === "" || v === undefined || v === null) continue;
    if (DEFAULTS[k] === v && !keep?.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Write a node, and remember how to read its look at the other widths. */
function record(env: Env, el: Element, node: BuilderNode, read: (cs: CSSStyleDeclaration) => Style, extra: Partial<Rec> = {}): BuilderNode {
  node.style = clean(read(env.win.getComputedStyle(el)), node.type) as BuilderNode["style"];
  env.recs.push({ el, node, read, ...extra });
  return node;
}

interface Walk { href?: string; depth: number }

/** Whether a child flows in its parent's lines with words: a link, a mark, a plain button, not a box or a picture. */
function flowsInLine(el: Element, env: Env): boolean {
  const cs = env.win.getComputedStyle(el);
  if (!/^inline/.test(cs.display) || cs.position === "absolute" || cs.position === "fixed") return false;
  if (el.querySelector("img,svg,video,iframe,picture,input,select,textarea")) return false;
  if (/^(img|svg|video|iframe|picture|input|select|textarea)$/.test(tag(el))) return false;
  if ((tag(el) === "a" || tag(el) === "button") && looksLikeButton(el, cs, env) && tag(el) !== "button") return false;
  return !hexColour(cs.backgroundColor) && !/flex|grid/.test(cs.display);
}

function convertChildren(parent: Element, env: Env, w: Walk): BuilderNode[] {
  const out: BuilderNode[] = [];
  const pcs = env.win.getComputedStyle(parent);
  // In a box laid out down the page, words and links that run on in one line
  // beside a block of their own ("Shortcuts" then "Track an order · Start a
  // return") stay one line of rich text, as the design draws them.
  const flowing = !/flex|grid/.test(pcs.display);
  let run: Node[] = [];
  const one = (c: Node) => {
    if (c.nodeType === 3) {
      const text = (c.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) return;
      // Words loose in a box beside other things: a text element of their own.
      const node = make("text", { text });
      node.style = clean(typeStyle(pcs, env), "text") as BuilderNode["style"];
      out.push(node);
      return;
    }
    if (!isEl(c)) return;
    const got = convert(c, env, w);
    if (Array.isArray(got)) out.push(...got);
    else if (got) out.push(got);
  };
  const flush = () => {
    const elements = run.filter(isEl);
    const words = run.map((n) => n.textContent ?? "").join("").replace(/\s+/g, " ").trim();
    if (flowing && words && elements.length >= 1 && run.filter((n) => isEl(n) || (n.textContent ?? "").trim()).length >= 2) {
      const node = make("rich_text", { html: cleanHtml(`<p>${richNodes(run, pcs, env).replace(/<\/?button[^>]*>/gi, "")}</p>`) });
      node.style = clean({ ...typeStyle(pcs, env), overflow: "visible" }, "rich_text") as BuilderNode["style"];
      out.push(node);
    } else run.forEach(one);
    run = [];
  };
  for (const c of Array.from(parent.childNodes)) {
    if (c.nodeType === 3 || (isEl(c) && flowing && (tag(c) === "br" || flowsInLine(c, env)))) { run.push(c); continue; }
    flush();
    one(c);
  }
  flush();
  return out;
}

function convert(el: Element, env: Env, w: Walk): BuilderNode | BuilderNode[] | null {
  const t = tag(el);
  if (SKIP.has(t)) return null;
  const cs = env.win.getComputedStyle(el);
  if (cs.position === "absolute" || cs.position === "fixed") {
    // A picture laid over its whole box (the usual way to fill a card or a
    // hero with a photo) is that box's picture: kept, filling it.
    if ((t === "img" || t === "picture") && fillsParent(el)) return image(t === "picture" ? el.querySelector("img") ?? el : el, el, env, w, true);
    // Shapes laid over other things are decoration and stay out; a short
    // label laid over a card ("Most popular") is kept, at the top of it.
    const label = readText(el);
    if (!shown(el, env, true) || !label || label.length > 60 || el.querySelector("img,video,iframe") || el.getBoundingClientRect().height > 80) return null;
  } else if (!shown(el, env)) return null;
  if (cs.display === "contents") return convertChildren(el, env, w);

  // ── Things with a builder element of their own ──
  if (t === "img") return image(el, el, env, w);
  if (t === "picture") { const img = el.querySelector("img"); return img ? image(img, el, env, w) : null; }
  if (t === "svg") return icon(el, env, w.href);
  if (t === "hr") {
    const node = make("divider");
    return record(env, el, node, (c) => ({ ...placeStyle(el, c, env), borderColor: hexColour(c.borderTopColor) ?? "transparent" }));
  }
  if (t === "iframe" || t === "video") {
    const src = el.getAttribute("src") || el.querySelector("source")?.getAttribute("src") || "";
    if (/youtube|youtu\.be|vimeo/i.test(src) || /^https:/i.test(src)) {
      const node = make("video", { url: src.replace(/^\/\//, "https://") });
      return record(env, el, node, (c) => ({ ...sizeStyle(el, c, env), ...placeStyle(el, c, env), borderRadius: c.borderRadius }));
    }
    env.warn("A video that is not on YouTube, Vimeo or a web address was left out.");
    return null;
  }
  if (t === "table") return rich(el, inlined(el, env), env);
  if (t === "form" || t === "input" || t === "textarea" || t === "select") return form(el, env);
  if (el.querySelectorAll(":scope > details").length >= 2) return faq(el, env);

  // ── Links and buttons ──
  if ((t === "a" || t === "button") && !readText(el) && el.querySelector("svg")) {
    return icon(el, env, t === "a" ? env.link(el.getAttribute("href"), el.getAttribute("aria-label") || "") : w.href);
  }
  if ((t === "a" || t === "button") && looksLikeButton(el, cs, env) && !el.querySelector("img")) return button(el, env, w);

  // ── Words ──
  if (isTextLeaf(el, env)) return words(el, cs, env, w);
  if (t === "a") return box(el, env, { ...w, href: env.link(el.getAttribute("href"), readText(el)) });
  if ((t === "ul" || t === "ol") && isWordList(el, env)) return rich(el, listHtml(el, cs, env), env);

  // ── Product cards: the shop's own products ──
  const grid = productGrid(el, env);
  if (grid) return grid;

  return box(el, env, w);
}

function isWordList(el: Element, env: Env): boolean {
  const items = Array.from(el.children).filter((c) => shown(c, env));
  return items.length > 0 && items.every((li) => tag(li) === "li" && isTextLeaf(li, env));
}

function listHtml(el: Element, cs: CSSStyleDeclaration, env: Env): string {
  const t = tag(el);
  const items = Array.from(el.children).filter((c) => shown(c, env));
  const plain = cs.listStyleType === "none" ? ' style="list-style: none; padding-left: 0"' : "";
  return `<${t}${plain}>${items.map((li) => `<li>${richHtml(li, env.win.getComputedStyle(li), env)}</li>`).join("")}</${t}>`;
}

function words(el: Element, cs: CSSStyleDeclaration, env: Env, w: Walk): BuilderNode {
  const t = tag(el);
  const text = readText(el, cs);
  const level = /^h[1-6]$/.test(t) ? Number(t[1]) : 0;
  const marked = Array.from(el.querySelectorAll("*")).some((c) => {
    const ct = tag(c);
    if (ct === "br") return false;
    const ccs = env.win.getComputedStyle(c);
    if (ccs.display === "none") return false;
    return (ct === "a" && t !== "a") || ccs.color !== cs.color || ccs.fontWeight !== cs.fontWeight || ccs.fontStyle !== cs.fontStyle
      || hexColour(ccs.backgroundColor) !== null || Math.abs(num(ccs.fontSize) - num(cs.fontSize)) > 0.5
      || (/text/.test(ccs.backgroundClip) && ccs.backgroundImage !== "none");
  });
  const gradient = /text/.test(cs.backgroundClip || cs.getPropertyValue("-webkit-background-clip")) && cs.backgroundImage !== "none";
  // A title broken over lines on purpose ("Moving<br>fast") keeps its lines.
  const broken = !!el.querySelector("br");
  let node: BuilderNode;
  if (t === "a" && !marked) {
    node = make("link", { text, href: env.link(el.getAttribute("href"), text), newTab: el.getAttribute("target") === "_blank" });
  } else if (level && !marked && !gradient && !broken) {
    node = make("heading", { text, level, ...(w.href ? { href: w.href } : {}) });
  } else if (!marked && !gradient && !w.href) {
    node = make("text", { text });
  } else {
    // Mixed marks (a word in another colour, a gradient title, a link inside):
    // rich text keeps them; the look of the whole is on the element.
    let html = richHtml(el, cs, env);
    if (gradient) html = `<span style="${escapeAttr(`background-image: ${cs.backgroundImage}; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent`)}">${html}</span>`;
    // A link with marks (a logo "S/Q SUPPLY" going home) stays a link.
    const href = t === "a" ? env.link(el.getAttribute("href"), text) : w.href;
    if (href) html = `<a href="${escapeAttr(href)}" style="color: inherit; text-decoration: none">${html}</a>`;
    node = make("rich_text", { html: cleanHtml(`<p>${html}</p>`) });
  }
  return record(env, el, node, (c) => {
    const s: Style = { ...typeStyle(c, env, { decoration: t === "a" }), ...boxStyle(c, env, node), ...sizeStyle(el, c, env), ...placeStyle(el, c, env) };
    if (gradient) { s.backgroundImage = "none"; }
    // Rich text scrolls when something in it is wider than its box (a table);
    // a title drawn with a tight line height would show a scrollbar instead.
    if (node.type === "rich_text" && s.overflow !== "hidden") s.overflow = "visible";
    // Words placed inside their own box (a number in a circle, a badge).
    if (/flex|grid/.test(c.display)) {
      const grid = c.display.includes("grid");
      const across = grid ? (/center/.test(c.justifyItems) || /center/.test(c.justifyContent) ? "center" : "flex-start") : flexWord(c.justifyContent === "normal" ? "flex-start" : c.justifyContent);
      s.display = "flex";
      s.alignItems = /normal|stretch/.test(c.alignItems) ? "flex-start" : flexWord(c.alignItems);
      s.justifyContent = across;
    }
    return s;
  });
}

/** A table with its look written into it: cells' colours, padding, lines and alignment, as drawn. */
function inlined(el: Element, env: Env): string {
  const copy = el.cloneNode(true) as Element;
  const from = [el, ...Array.from(el.querySelectorAll("*"))];
  const to = [copy, ...Array.from(copy.querySelectorAll("*"))];
  from.forEach((orig, i) => {
    const c = to[i];
    if (!c) return;
    const cs = env.win.getComputedStyle(orig);
    const decl: string[] = [];
    const bg = hexColour(cs.backgroundColor);
    if (bg) decl.push(`background-color: ${bg}`);
    const col = hexColour(cs.color);
    if (col) decl.push(`color: ${col}`);
    decl.push(`font-size: ${cs.fontSize}`, `font-weight: ${cs.fontWeight}`);
    if (cs.textTransform !== "none") decl.push(`text-transform: ${cs.textTransform}`);
    if (cs.letterSpacing !== "normal") decl.push(`letter-spacing: ${cs.letterSpacing}`);
    if (/^(table|thead|tbody|tfoot|tr|th|td|caption)$/.test(tag(orig))) {
      if (/^t[hd]$/.test(tag(orig))) decl.push(`padding: ${cs.padding}`, `text-align: ${cs.textAlign}`, `vertical-align: ${cs.verticalAlign}`);
      for (const side of ["top", "right", "bottom", "left"]) {
        const bw = num(cs.getPropertyValue(`border-${side}-width`));
        const st = cs.getPropertyValue(`border-${side}-style`);
        if (bw > 0 && st !== "none") decl.push(`border-${side}: ${px(bw)} ${st} ${hexColour(cs.getPropertyValue(`border-${side}-color`)) ?? "transparent"}`);
      }
    }
    if (tag(orig) === "table") decl.push("width: 100%", `border-collapse: ${cs.borderCollapse}`);
    c.setAttribute("style", decl.join("; "));
    c.removeAttribute("class");
    c.removeAttribute("id");
  });
  return copy.outerHTML;
}

/** A table, or a list of words, as rich text. A table may be wider than a phone and scrolls sideways; a list never needs to. */
function rich(el: Element, html: string, env: Env): BuilderNode {
  const node = make("rich_text", { html: cleanHtml(html) });
  const table = tag(el) === "table";
  return record(env, el, node, (c) => {
    const s: Style = { ...typeStyle(c, env), ...boxStyle(c, env, node), ...sizeStyle(el, c, env), ...placeStyle(el, c, env) };
    if (!table && s.overflow !== "hidden") s.overflow = "visible";
    return s;
  });
}

function button(el: Element, env: Env, w: Walk): BuilderNode {
  const label = readText(el) || el.getAttribute("value") || el.getAttribute("aria-label") || "Button";
  const guess = env.link(tag(el) === "a" ? el.getAttribute("href") : null, label);
  const href = guess !== "#" ? guess : w.href ?? "#";
  const solid = !!hexColour(env.win.getComputedStyle(el).backgroundColor);
  const node = make("button", { text: label, href, variant: solid ? "solid" : "outline", newTab: el.getAttribute("target") === "_blank" });
  return record(env, el, node, (c) => {
    const s: Style = { ...typeStyle(c, env), ...boxStyle(c, env, node), ...sizeStyle(el, c, env), ...placeStyle(el, c, env) };
    // A least height is kept (a button's words sit in the middle of it already).
    delete s.width;
    delete s.height;
    const dw = env.declared.get(el, "width");
    if (dw === "100%") s.width = "100%";
    else if (dw && /px$/.test(dw)) s.width = px(num(c.width));
    s.textDecoration = "none";
    return s;
  });
}

/** Whether an element laid over its box covers (nearly) all of it. */
function fillsParent(el: Element): boolean {
  const p = el.parentElement;
  if (!p) return false;
  const r = el.getBoundingClientRect();
  const pr = p.getBoundingClientRect();
  return pr.width > 0 && pr.height > 0 && r.width >= pr.width * 0.9 && r.height >= pr.height * 0.9;
}

function image(img: Element, outer: Element, env: Env, w: Walk, cover = false): BuilderNode | null {
  // A picture filling its box: in the flow, as wide as the box and its shape.
  if (cover) {
    const raw = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src || img.getAttribute("src") || "";
    const node = make("image", { src: "", alt: img.getAttribute("alt") || "", fit: "cover", ...(w.href ? { href: w.href } : {}) });
    const src = env.assets.use(raw, { node, prop: "src" });
    if (!src) return null;
    (node.props as Record<string, unknown>).src = src;
    return record(env, outer, node, (c) => {
      const box = outer.parentElement?.getBoundingClientRect();
      const s: Style = { width: "100%", height: "auto", objectFit: /contain|scale-down/.test(c.objectFit) ? "contain" : "cover", borderRadius: c.borderRadius };
      if (box && box.width > 0 && box.height > 0) s.aspectRatio = `${round(box.width, 0)} / ${round(box.height, 0)}`;
      return s;
    });
  }
  const raw = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src || img.getAttribute("src") || "";
  const node = make("image", { src: "", alt: img.getAttribute("alt") || "", fit: "cover", ...(w.href ? { href: w.href } : {}) });
  const src = env.assets.use(raw, { node, prop: "src" });
  if (!src) return null;
  const props = node.props as Record<string, unknown>;
  props.src = src;
  props.fit = /contain|scale-down/.test(env.win.getComputedStyle(img).objectFit) ? "contain" : "cover";
  return record(env, img, node, (c) => {
    const r = img.getBoundingClientRect();
    const s: Style = { ...boxStyle(c, env, node), ...placeStyle(outer, env.win.getComputedStyle(outer), env) };
    for (const k of ["padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) delete s[k];
    const parent = outer.parentElement;
    const pr = parent?.getBoundingClientRect();
    const pcs = parent ? env.win.getComputedStyle(parent) : null;
    const inner = pr && pcs ? pr.width - num(pcs.paddingLeft) - num(pcs.paddingRight) - num(pcs.borderLeftWidth) - num(pcs.borderRightWidth) : r.width;
    const dw = env.declared.get(img, "width");
    if (dw && /%$/.test(dw)) s.width = dw;
    else if (r.width < inner - 1.5) s.width = px(r.width);
    else s.width = "100%";
    const el = img as HTMLImageElement;
    const nat = el.naturalWidth && el.naturalHeight ? el.naturalWidth / el.naturalHeight : 0;
    const drawn = r.height ? r.width / r.height : 0;
    if (drawn && (!nat || Math.abs(nat - drawn) / drawn > 0.02)) s.aspectRatio = `${round(r.width, 0)} / ${round(r.height, 0)}`;
    s.height = "auto";
    s.objectFit = /contain|scale-down/.test(c.objectFit) ? "contain" : "cover";
    return s;
  });
}

/** An inline drawing (an icon): kept as it is drawn, its colours written into it. */
function icon(el: Element, env: Env, href?: string): BuilderNode | null {
  const svg = tag(el) === "svg" ? el : el.querySelector("svg");
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  const svgCs = env.win.getComputedStyle(svg);
  const colour = hexColour(svgCs.color) ?? "#000000";
  const paint = (v: string) => (v === "none" ? "none" : /^url\(/.test(v) ? null : hexColour(v));
  const copy = svg.cloneNode(true) as Element;
  // Colours from the design's stylesheet are written onto the shapes it has.
  const shapes = Array.from(svg.querySelectorAll("path,circle,rect,line,polyline,polygon,ellipse"));
  const copies = Array.from(copy.querySelectorAll("path,circle,rect,line,polyline,polygon,ellipse"));
  shapes.forEach((s, i) => {
    const c = copies[i];
    if (!c) return;
    const scs = env.win.getComputedStyle(s);
    const f = paint(scs.fill);
    const st = paint(scs.stroke);
    if (f) c.setAttribute("fill", f);
    if (st) c.setAttribute("stroke", st);
    if (st && st !== "none") c.setAttribute("stroke-width", String(num(scs.strokeWidth) || 1));
  });
  // A sprite icon (<use href="#i-cart">) is drawn from the shape it points at.
  for (const u of Array.from(copy.querySelectorAll("use"))) {
    const ref = (u.getAttribute("href") || u.getAttribute("xlink:href") || "").replace(/^#/, "");
    const target = ref ? env.doc.getElementById(ref) : null;
    if (!target) { u.remove(); continue; }
    const g = env.doc.createElementNS("http://www.w3.org/2000/svg", "g");
    for (const k of Array.from(target.childNodes)) g.appendChild(k.cloneNode(true));
    if (!copy.getAttribute("viewBox") && target.getAttribute("viewBox")) copy.setAttribute("viewBox", target.getAttribute("viewBox")!);
    u.replaceWith(g);
  }
  if (!shapes.length) {
    const f = paint(svgCs.fill);
    const st = paint(svgCs.stroke);
    if (f) copy.setAttribute("fill", f);
    if (st) { copy.setAttribute("stroke", st); if (st !== "none") copy.setAttribute("stroke-width", String(num(svgCs.strokeWidth) || 1)); }
  }
  copy.setAttribute("width", String(round(r.width, 0)));
  copy.setAttribute("height", String(round(r.height, 0)));
  copy.removeAttribute("class");
  copy.removeAttribute("style");
  let markup = new XMLSerializer().serializeToString(copy).replace(/currentColor/gi, colour);
  const label = (el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
  if (href) markup = `<a href="${escapeAttr(href)}"${label ? ` aria-label="${escapeAttr(label)}"` : ""} style="display: inline-flex; color: inherit">${markup}</a>`;
  const node = make("html", { html: cleanHtml(markup), css: "", js: "" });
  const holder = tag(el) === "svg" ? svg : el;
  return record(env, holder, node, (c) => {
    const s: Style = { ...placeStyle(holder, c, env), color: colour, lineHeight: "0", width: px(svg.getBoundingClientRect().width) };
    // An icon button is a box bigger than its drawing (a 44px square with the
    // heart in its middle): it keeps that box, so it lines up with the shop's
    // own icons beside it, the drawing where the design has it.
    const hr = holder.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    if (holder !== svg && (hr.width > sr.width + 2 || hr.height > sr.height + 2)) {
      const where = (before: number, after: number) => (Math.abs(before - after) < 2 ? "center" : before < after ? "flex-start" : "flex-end");
      s.width = px(hr.width);
      s.height = px(hr.height);
      s.display = "flex";
      s.justifyContent = where(sr.left - hr.left, hr.right - sr.right);
      s.alignItems = where(sr.top - hr.top, hr.bottom - sr.bottom);
    }
    return s;
  });
}

function faq(el: Element, env: Env): BuilderNode | BuilderNode[] {
  // What sits around the questions (a "Quick answers" title) stays itself.
  const others = Array.from(el.children).filter((c) => tag(c) !== "details" && shown(c, env));
  if (others.length) {
    const firstDetails = el.querySelector(":scope > details")!;
    const before = others.filter((c) => c.compareDocumentPosition(firstDetails) & Node.DOCUMENT_POSITION_FOLLOWING);
    const after = others.filter((c) => !before.includes(c));
    const conv = (list: Element[]) => list.flatMap((c) => { const got = convert(c, env, { depth: 1 }); return Array.isArray(got) ? got : got ? [got] : []; });
    return [...conv(before), questions(el, env), ...conv(after)];
  }
  return questions(el, env);
}

function questions(el: Element, env: Env): BuilderNode {
  const items = Array.from(el.querySelectorAll(":scope > details")).map((d) => {
    const q = readText(d.querySelector("summary") ?? d);
    const copy = d.cloneNode(true) as Element;
    copy.querySelector("summary")?.remove();
    return { q, a: readText(copy) };
  });
  const node = make("faq", { items });
  // The questions' type is the list's: they are what a reader sees first.
  const summary = el.querySelector(":scope > details > summary") ?? el;
  return record(env, el, node, (c) => ({
    ...typeStyle(env.win.getComputedStyle(summary), env), ...sizeStyle(el, c, env), ...placeStyle(el, c, env),
  }));
}

function form(el: Element, env: Env): BuilderNode | null {
  const inputs = tag(el) === "form" ? Array.from(el.querySelectorAll("input,textarea,select")) : [el];
  const visible = inputs.filter((i) => shown(i, env) && !/^(hidden|submit|button|checkbox|radio)$/i.test(i.getAttribute("type") || ""));
  if (!visible.length) return null;
  const submit = tag(el) === "form" ? el.querySelector("button,input[type=submit]") : null;
  const label = submit ? readText(submit) || submit.getAttribute("value") || "Send" : "Send";
  const first = visible[0]!;
  const email = visible.find((i) => /email/i.test(i.getAttribute("type") || "") || /e-?mail/i.test(`${i.getAttribute("placeholder")} ${i.getAttribute("name")}`));
  if (visible.length === 1 && /search/i.test(`${first.getAttribute("type")} ${first.getAttribute("placeholder")} ${first.getAttribute("name")}`)) {
    return record(env, first, make("search", { style: "field" }), (c) => placeStyle(first, c, env), { keep: true });
  }
  if (visible.length === 1 && email) {
    const node = make("newsletter", { placeholder: email.getAttribute("placeholder") || "Your email", button: label, success: "Thanks! You're on the list." });
    return record(env, el, node, (c) => ({ ...sizeStyle(el, c, env), ...placeStyle(el, c, env) }));
  }
  // Two fields side by side are half a row each, as the design lays them.
  const formWidth = el.getBoundingClientRect().width || 1;
  const fields = visible.map((i) => {
    const id = i.getAttribute("id");
    const lab = (id ? env.doc.querySelector(`label[for="${CSS.escape(id)}"]`) : null) ?? i.closest("label");
    const ty = (i.getAttribute("type") || "").toLowerCase();
    const type = tag(i) === "textarea" ? "textarea" : tag(i) === "select" ? "select" : ty === "email" ? "email" : ty === "tel" ? "tel" : "text";
    // The form says "(optional)" itself.
    const text = ((lab ? readText(lab) : "") || i.getAttribute("placeholder") || i.getAttribute("name") || "Field").replace(/\s*\(optional\)\s*$/i, "");
    const field: Record<string, unknown> = {
      label: text, type, placeholder: i.getAttribute("placeholder") || "", required: i.hasAttribute("required"),
      width: i.getBoundingClientRect().width < formWidth * 0.6 ? "half" : "full",
    };
    if (type === "select") {
      field.options = Array.from(i.querySelectorAll("option")).map((o) => readText(o)).filter((o) => o && !/^(choose|select)\b/i.test(o)).join("\n");
      field.placeholder = "";
    }
    return field;
  });
  // The form's look, from the design's fields, labels and button.
  const first0 = env.win.getComputedStyle(first);
  const labelEl = el.querySelector("label");
  const look: Record<string, unknown> = {};
  const colour = (v: string | null | undefined) => (v ? hexColour(v) ?? undefined : undefined);
  look.fieldBg = colour(first0.backgroundColor) ?? "transparent";
  look.fieldBorder = colour(first0.borderTopColor);
  look.fieldRadius = Math.round(num(first0.borderTopLeftRadius));
  if (labelEl) look.labelColor = colour(env.win.getComputedStyle(labelEl).color);
  if (submit) {
    const b = env.win.getComputedStyle(submit);
    look.buttonBg = colour(b.backgroundColor);
    look.buttonColor = colour(b.color);
    look.buttonRadius = Math.round(num(b.borderTopLeftRadius));
    look.buttonWidth = submit.getBoundingClientRect().width >= formWidth * 0.9 ? "full" : "auto";
  }
  for (const k of Object.keys(look)) if (look[k] === undefined) delete look[k];
  const node = make("contact_form", { formName: "Imported form", fields, button: label, success: "Thanks! We'll be in touch.", ...look });
  return record(env, el, node, (c) => ({ ...typeStyle(c, env), ...sizeStyle(el, c, env), ...placeStyle(el, c, env) }));
}

/** A row of cards that each show a picture and a price: the shop's products instead. */
function productGrid(el: Element, env: Env): BuilderNode | null {
  const kids = Array.from(el.children).filter((c) => shown(c, env));
  if (kids.length < 3) return null;
  const price = /(^|\s)[$£€]\s?\d|\d[.,]\d{2}(\s|$)/;
  const pictured = (k: Element) => !!k.querySelector("img") || Array.from(k.querySelectorAll("*")).slice(0, 12)
    .some((x) => env.win.getComputedStyle(x).backgroundImage !== "none" && num(env.win.getComputedStyle(x).height) > 60);
  const cards = kids.filter((k) => pictured(k) && price.test(readText(k)));
  if (cards.length < Math.max(3, Math.ceil(kids.length * 0.75))) return null;
  const across = () => {
    const rows = new Map<number, number>();
    for (const k of kids) {
      if (!shown(k, env)) continue;
      const top = Math.round(k.getBoundingClientRect().top / 8);
      rows.set(top, (rows.get(top) ?? 0) + 1);
    }
    return Math.max(1, Math.min(6, ...[Math.max(1, ...rows.values())]));
  };
  const node = make("product_grid", { source: "newest", limit: Math.min(48, Math.max(4, kids.length)), columns: across() });
  return record(env, el, node, (c) => ({ ...placeStyle(el, c, env), paddingTop: px(num(c.paddingTop)), paddingBottom: px(num(c.paddingBottom)) }),
    { columns: across });
}

/** A block whose children all flow in its lines (links, buttons, words), not one under another. */
function inlineRun(el: Element, env: Env): boolean {
  const cs = env.win.getComputedStyle(el);
  if (!/^(block|list-item|table-cell)$/.test(cs.display)) return false;
  const kids = Array.from(el.children).filter((k) => shown(k, env));
  return kids.length >= 2 && kids.every((k) => /^inline/.test(env.win.getComputedStyle(k).display));
}

function inlineRow(cs: CSSStyleDeclaration): { style: Style; direction: "row" } {
  const align = cs.textAlign;
  return {
    direction: "row",
    style: {
      display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center",
      justifyContent: align === "center" ? "center" : align === "right" || align === "end" ? "flex-end" : "flex-start",
      // The space a word space would leave between them.
      columnGap: px(Math.round(num(cs.fontSize) * 0.3)), rowGap: "4px",
    },
  };
}

/** A box of things: a stack laid out as the design lays it out. */
function box(el: Element, env: Env, w: Walk): BuilderNode | BuilderNode[] | null {
  const children = convertChildren(el, env, { ...w, depth: w.depth + 1 });
  const cs = env.win.getComputedStyle(el);
  const plain = plainBox(cs);
  if (!children.length && plain && !num(cs.minHeight) && el.getBoundingClientRect().height < 4) return null;
  // A wrapper that adds nothing of its own is left out: its one child stands in its place.
  if (children.length === 1 && plain && !cs.display.includes("grid") && w.depth > 0) {
    const only = children[0]!;
    const onlyEl = env.recs.find((r) => r.node === only)?.el;
    if (onlyEl && onlyEl.parentElement === el && !env.declared.get(el, "max-width") && !env.declared.get(el, "width")) return only;
  }
  const node = make("stack", { direction: inlineRun(el, env) ? "row" : layoutStyle(cs).direction });
  node.children = children;
  return record(env, el, node, (c) => {
    // Links and words in a line ("Track an order · Start a return"): a row that wraps.
    const lay = inlineRun(el, env) ? inlineRow(c) : layoutStyle(c);
    // Columns "as wide as their content" (a header's auto 1fr auto) stay so:
    // as fractions of the width, a narrower screen squeezed the logo in two.
    const own = /grid/.test(c.display) ? declaredTracks(el, c, env) : null;
    if (own) { lay.style.gridTemplate = own; delete lay.style.gridColumns; }
    // The direction is the computer's; a phone's own way down is a style of its own.
    if (env.at === "style") (node.props as Record<string, unknown>).direction = lay.direction;
    return { ...lay.style, ...boxStyle(c, env, node), ...sizeStyle(el, c, env), ...placeStyle(el, c, env) };
  });
}

// ── The page: bands, header, footer ──────────────────────────────────────────

const hintOf = (el: Element) => `${tag(el)} ${el.id} ${classOf(el)}`.toLowerCase();

function fullWidth(el: Element, root: Element): boolean {
  return el.getBoundingClientRect().width >= root.getBoundingClientRect().width - 2;
}

/** A bar fixed to the top of the window: a header that stays put. */
function topBar(el: Element, env: Env): boolean {
  const cs = env.win.getComputedStyle(el);
  if (cs.position !== "fixed" && cs.position !== "sticky") return false;
  const r = el.getBoundingClientRect();
  return r.top < 4 && r.height < 240 && el.querySelectorAll("a").length >= 2;
}

/** The bands of a page: what is stacked down it, through wrappers that only hold the rest. */
function bandsOf(root: Element, env: Env): Element[] {
  const visible = (el: Element) => Array.from(el.children).filter((c) => !SKIP.has(tag(c)) && (shown(c, env) || shown(c, env, true) && topBar(c, env)));
  const expand = (list: Element[], depth: number): Element[] => list.flatMap((el) => {
    if (depth > 3) return [el];
    const kids = visible(el);
    const wrapper = tag(el) === "main" || (/^(div|article)$/.test(tag(el)) && plainBox(env.win.getComputedStyle(el))
      && kids.length >= 2 && kids.every((k) => fullWidth(k, root)));
    return wrapper && fullWidth(el, root) && kids.length ? expand(kids, depth + 1) : [el];
  });
  let at = root;
  for (let i = 0; i < 6; i++) {
    const kids = visible(at);
    if (kids.length === 1 && /^(main|div|article)$/.test(tag(kids[0]!)) && kids[0]!.children.length > 0 && fullWidth(kids[0]!, root)) { at = kids[0]!; continue; }
    return expand(kids, 0);
  }
  return expand(visible(at), 0);
}

function isHeader(el: Element, index: number, env: Env): boolean {
  if (index > 2) return false;
  if (el.getAttribute("role") === "banner") return true;
  const h = hintOf(el);
  if (/^header\b|site-header|\bheader\b|navbar|\bnav\b|topnav|masthead/.test(h) && !/hero/.test(h)) return true;
  return topBar(el, env) || (!!el.querySelector("nav") && el.getBoundingClientRect().height < 220 && el.querySelectorAll("a").length >= 3);
}
function isFooter(el: Element, index: number, count: number): boolean {
  if (index < count - 3) return false;
  return /^footer\b|site-footer|\bfooter\b/.test(hintOf(el)) || el.getAttribute("role") === "contentinfo";
}
function isAnnouncement(el: Element, next: Element | undefined, env: Env): boolean {
  if (!next || !isHeader(next, 1, env)) return false;
  const r = el.getBoundingClientRect();
  const words = readText(el);
  return r.height < 70 && words.length > 0 && words.length < 240;
}

/** Content width: the centred wrapper a band keeps its content in. */
function containerOf(band: Element, env: Env): { el: Element; width: number } | null {
  const br = band.getBoundingClientRect();
  let at: Element | null = band;
  for (let i = 0; i < 3 && at; i++) {
    const kids: Element[] = Array.from(at.children).filter((c) => shown(c, env));
    if (kids.length !== 1) return null;
    const k: Element = kids[0]!;
    const kcs = env.win.getComputedStyle(k);
    const mw = kcs.maxWidth;
    const r = k.getBoundingClientRect();
    if (mw !== "none" && num(mw) > 400 && r.width < br.width - 20 && Math.abs((r.left - br.left) - (br.right - r.right)) < 4) {
      // The width its content gets: the cap, less the wrapper's own side padding.
      const sides = kcs.boxSizing === "border-box" ? num(kcs.paddingLeft) + num(kcs.paddingRight) : 0;
      return { el: k, width: Math.round(num(mw) - sides) };
    }
    at = k;
  }
  return null;
}

/** A band that is itself narrower than the page, in its middle (Tailwind's "max-w-3xl mx-auto"): its cap. */
function cappedBand(band: Element, env: Env): number | null {
  const cs = env.win.getComputedStyle(band);
  const page = band.parentElement?.getBoundingClientRect();
  const r = band.getBoundingClientRect();
  if (!page || cs.maxWidth === "none" || num(cs.maxWidth) <= 0 || r.width >= page.width - 2) return null;
  return Math.abs((r.left - page.left) - (page.right - r.right)) < 4 ? num(cs.maxWidth) : null;
}

/** The width a band's content gets, for the site's own content width. */
function contentWidthOf(band: Element, env: Env): number | null {
  const found = containerOf(band, env);
  if (found) return found.width;
  const cap = cappedBand(band, env);
  if (!cap) return null;
  const cs = env.win.getComputedStyle(band);
  return Math.round(cap - (cs.boxSizing === "border-box" ? num(cs.paddingLeft) + num(cs.paddingRight) : 0));
}

/** One band as a Section: its background and padding on the section, its content inside. */
function section(band: Element, env: Env, name: string, containerWidth: number | null): BuilderNode {
  const cap = cappedBand(band, env);
  const found = containerOf(band, env);
  // The site's width: the wrapper is the section's own content width. A
  // narrower (or wider) wrapper stays, as a box of that width in the middle.
  const contained = !!found && (!containerWidth || Math.abs(found.width - containerWidth) <= 40);
  const box_ = contained ? found : null;
  const inner = box_?.el ?? band;
  const node = make("section", { width: contained || (found && containerWidth && found.width < containerWidth) ? "contained" : "full" });
  if (name) node.name = name;
  const ics = env.win.getComputedStyle(inner);
  const laidOut = ics.display.includes("grid") || (ics.display.includes("flex") && ics.flexDirection.startsWith("row"));
  // The wrapper's own layout (a grid, a row) is a stack inside the section;
  // a wrapper that only stacks things down hands them to the section.
  let innerPadding = false;
  if (laidOut && inner !== band) {
    const st = box(inner, env, { depth: 1 });
    node.children = st ? (Array.isArray(st) ? st : [st]) : [];
    // The wrapper's cap and side padding are the section's content width now.
    const rec = !Array.isArray(st) && st ? env.recs.find((r) => r.node === st && r.el === inner) : undefined;
    if (rec && contained) {
      const read = rec.read;
      const strip = (s: Style): Style => {
        const out = { ...s };
        if (out.padding !== undefined) { out.paddingTop = out.padding; out.paddingBottom = out.padding; delete out.padding; }
        for (const k of ["maxWidth", "width", "paddingLeft", "paddingRight", "alignSelf", "marginLeft", "marginRight", "marginTop", "marginBottom"]) delete out[k];
        return out;
      };
      rec.read = (c) => strip(read(c));
      rec.node.style = clean(strip(rec.node.style as Style), rec.node.type) as BuilderNode["style"];
    }
  } else if (laidOut) {
    const st = make("stack", { direction: layoutStyle(ics).direction });
    st.children = convertChildren(band, env, { depth: 1 });
    record(env, band, st, (c) => {
      const lay = layoutStyle(c);
      if (env.at === "style") (st.props as Record<string, unknown>).direction = lay.direction;
      return lay.style;
    });
    node.children = [st];
  } else {
    node.children = convertChildren(inner, env, { depth: 1 });
    innerPadding = inner !== band;
  }
  return record(env, band, node, (c) => {
    const s: Style = { ...boxStyle(c, env, node) };
    const ic = env.win.getComputedStyle(inner);
    const pad = (side: string) => num(c.getPropertyValue(`padding-${side}`)) + (innerPadding ? num(ic.getPropertyValue(`padding-${side}`)) : 0);
    for (const k of ["padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) delete s[k];
    s.paddingTop = px(pad("top"));
    s.paddingBottom = px(pad("bottom"));
    if (!contained) {
      const side = num(c.paddingLeft) + (inner !== band ? num(ic.paddingLeft) : 0);
      s.paddingLeft = px(side);
      s.paddingRight = px(num(c.paddingRight) + (inner !== band ? num(ic.paddingRight) : 0));
    }
    const mh = num(c.minHeight);
    if (mh > 0) s.minHeight = /vh$/.test(env.declared.get(band, "min-height")) ? env.declared.get(band, "min-height") : px(mh);
    const col = hexColour(c.color);
    if (col) { s.color = col; s.linkColor = col; s.headingColor = col; }
    // A band narrower than the page keeps its width, in the middle.
    if (cap) { s.maxWidth = px(num(c.maxWidth)); s.alignSelf = "center"; s.marginLeft = "auto"; s.marginRight = "auto"; }
    // Its content one under another, each keeping its side (a centred title,
    // a button on the right): what the design's own flow does.
    s.display = "flex";
    s.flexDirection = "column";
    return s;
  });
}

/** The header's working parts: a menu of the shop's own, its cart, search and account, its logo. */
function storeParts(header: BuilderNode, headerEl: Element, env: Env): { node: BuilderNode; items: MenuItem[] } | null {
  const byEl = new Map(env.recs.map((r) => [r.el, r] as const));
  const textLinks = (c: Element) => Array.from(c.querySelectorAll("a")).filter((a) => shown(a, env) && readText(a)
    && !looksLikeButton(a, env.win.getComputedStyle(a), env) && !/cart|basket|log ?in|sign ?(in|up)|account|search/i.test(readText(a)));
  // The navigation: a <nav>, else the list or box that is mostly links.
  let navEl: Element | null = Array.from(headerEl.querySelectorAll("nav")).find((n) => shown(n, env) && textLinks(n).length >= 2) ?? null;
  if (!navEl) {
    const boxes = Array.from(headerEl.querySelectorAll("ul, div")).filter((c) => shown(c, env) && !c.querySelector("img"))
      .map((c) => ({ c, links: textLinks(c).length, kids: Array.from(c.children).filter((k) => shown(k, env)).length }))
      .filter((x) => x.links >= 3 && x.links >= x.kids * 0.7);
    boxes.sort((a, b) => b.links - a.links);
    navEl = boxes[0]?.c ?? null;
  }
  let menu: { node: BuilderNode; items: MenuItem[] } | null = null;
  if (navEl) {
    const items = menuItems(navEl, env);
    const first = textLinks(navEl)[0]!;
    const lcs = env.win.getComputedStyle(first);
    const node = make("menu", { menuId: "", layout: "horizontal", mobile: "drawer" });
    node.style = clean({
      color: hexColour(lcs.color) ?? "", linkColor: hexColour(lcs.color) ?? "", fontSize: px(num(lcs.fontSize)),
      fontWeight: Math.round(num(lcs.fontWeight)), fontFamily: family(lcs, env) ?? "",
      textTransform: lcs.textTransform !== "none" ? lcs.textTransform : "", letterSpacing: lcs.letterSpacing !== "normal" ? px(num(lcs.letterSpacing)) : "",
    }, "menu") as BuilderNode["style"];
    replaceFor(header, navEl, node, byEl);
    env.recs.push({ el: navEl, node, read: () => ({}), keep: true });
    menu = { node, items };
  }
  // Icons and links that are the shop's own pieces.
  const pieces = Array.from(headerEl.querySelectorAll("a, button")).filter((a) => shown(a, env) && !(navEl && navEl.contains(a)));
  const wordsOf = (a: Element) => `${readText(a)} ${a.getAttribute("href") || ""} ${a.getAttribute("aria-label") || ""} ${a.getAttribute("title") || ""} ${classOf(a)} ${a.querySelector("use")?.getAttribute("href") || ""}`.toLowerCase();
  const login = pieces.find((a) => /log ?in|sign ?in/.test(wordsOf(a)));
  const signup = pieces.find((a) => /sign ?up|register|create (an )?account/.test(wordsOf(a)));
  const lookOf = (a: Element | undefined) => {
    if (!a) return undefined;
    const cs = env.win.getComputedStyle(a);
    return !looksLikeButton(a, cs, env) ? "text" : hexColour(cs.backgroundColor) ? "solid" : "outline";
  };
  for (const a of pieces) {
    const words = wordsOf(a);
    let type = "";
    if (/cart|basket|\bbag\b/.test(words)) type = "cart_link";
    else if (/search/.test(words)) type = "search";
    else if (a === login || a === signup) type = "auth_buttons";
    else if (/account|profile|\buser\b/.test(words)) type = "account_link";
    if (!type) continue;
    if (type === "auth_buttons" && findType(header, "auth_buttons")) { removeFor(header, a, byEl); continue; }
    const cs = env.win.getComputedStyle(a);
    // Log in and Sign up as the design has them: one or both, as buttons or as words.
    const props: Record<string, unknown> = type === "cart_link" ? { showCount: true } : type === "search" ? { style: "icon" } : type === "account_link" ? {}
      : { show: login && signup ? "" : login ? "login" : "signup",
          loginLabel: (login && readText(login)) || "Log in", signupLabel: (signup && readText(signup)) || "Sign up", accountLabel: "My account",
          loginStyle: lookOf(login) ?? "outline", signupStyle: lookOf(signup) ?? "solid" };
    const node = make(type, props);
    node.style = clean({ color: hexColour(cs.color) ?? "" }, type) as BuilderNode["style"];
    replaceFor(header, a, node, byEl);
    env.recs.push({ el: a, node, read: () => ({}), keep: true });
  }
  // The logo: the header's first picture, linked home; else its first link goes home.
  const logoImg = Array.from(headerEl.querySelectorAll("img")).find((i) => shown(i, env));
  const rec = logoImg ? byEl.get(logoImg) : undefined;
  if (logoImg && rec && rec.node.type === "image") {
    const p = rec.node.props as Record<string, unknown>;
    const logo = make("logo", { image: p.src, alt: p.alt || "", href: "/", fallback: "name" });
    logo.style = { height: px(logoImg.getBoundingClientRect().height) };
    for (const asset of env.assets.list.values()) for (const u of asset.uses) if (u.node === rec.node) { u.node = logo; u.prop = "image"; }
    replaceFor(header, logoImg, logo, byEl, rec.node);
  } else {
    const firstLink = Array.from(headerEl.querySelectorAll("a")).find((a) => shown(a, env) && !(navEl && navEl.contains(a)));
    const n = firstLink ? byEl.get(firstLink)?.node : undefined;
    if (n && (n.type === "link" || n.type === "heading")) (n.props as Record<string, unknown>).href = "/";
  }
  return menu;
}

function findType(root: BuilderNode, type: string): BuilderNode | null {
  if (root.type === type) return root;
  for (const c of root.children ?? []) { const f = findType(c, type); if (f) return f; }
  return null;
}

/** Put `node` where the element (or the written things inside it) sit in the tree. */
function replaceFor(root: BuilderNode, el: Element, node: BuilderNode, byEl: Map<Element, Rec>, direct?: BuilderNode) {
  const own = direct ?? byEl.get(el)?.node;
  if (own && inTree(root, own)) { swap(root, own, node); return; }
  // The element itself was folded away: replace the written things inside it.
  const inside = [...byEl.entries()].filter(([e]) => el.contains(e) && inTree(root, byEl.get(e)!.node)).map(([, r]) => r.node);
  const top = inside.filter((n) => !inside.some((o) => o !== n && contains(o, n)));
  if (!top.length) return;
  swap(root, top[0]!, node);
  for (const n of top.slice(1)) remove(root, n);
}
function removeFor(root: BuilderNode, el: Element, byEl: Map<Element, Rec>) {
  const n = byEl.get(el)?.node;
  if (n) remove(root, n);
}
function inTree(root: BuilderNode, n: BuilderNode): boolean { return root === n || contains(root, n); }
function contains(a: BuilderNode, b: BuilderNode): boolean { return (a.children ?? []).some((c) => c === b || contains(c, b)); }
function swap(root: BuilderNode, from: BuilderNode, to: BuilderNode): boolean {
  const kids = root.children ?? [];
  const i = kids.indexOf(from);
  if (i >= 0) {
    // The new piece keeps where the old one sat in its row.
    const place: Record<string, unknown> = {};
    for (const k of ["marginTop", "marginRight", "marginBottom", "marginLeft", "flexGrow", "alignSelf", "flexBasis"]) {
      const v = (from.style as Record<string, unknown> | undefined)?.[k];
      if (v !== undefined && (to.style as Record<string, unknown> | undefined)?.[k] === undefined) place[k] = v;
    }
    to.style = { ...(to.style ?? {}), ...place } as BuilderNode["style"];
    kids[i] = to;
    return true;
  }
  return kids.some((c) => swap(c, from, to));
}
function remove(root: BuilderNode, n: BuilderNode): boolean {
  const kids = root.children ?? [];
  const i = kids.indexOf(n);
  if (i >= 0) { kids.splice(i, 1); return true; }
  return kids.some((c) => remove(c, n));
}

function menuItems(nav: Element, env: Env): MenuItem[] {
  const label = (a: Element) => readText(a).split("\n")[0]!.trim();
  const tops = Array.from(nav.querySelectorAll("li")).filter((li) => {
    const up = li.parentElement?.closest("li");
    return !up || !nav.contains(up);
  });
  if (tops.length) {
    return tops.map((li) => {
      const a = li.querySelector("a, button, summary, span");
      const text = a ? label(a) : label(li);
      const kids = Array.from(li.querySelectorAll("li a")).filter((x) => x !== a)
        .map((x) => ({ label: label(x), href: env.link(x.getAttribute("href"), label(x)) })).filter((x) => x.label);
      const item: MenuItem = { label: text, href: env.link(a?.getAttribute("href") ?? null, text) };
      if (kids.length) item.children = kids;
      return item;
    }).filter((i) => i.label).slice(0, 12);
  }
  return Array.from(nav.querySelectorAll("a")).filter((a) => shown(a, env) && label(a))
    .map((a) => ({ label: label(a), href: env.link(a.getAttribute("href"), label(a)) })).slice(0, 12);
}

// ── Links ────────────────────────────────────────────────────────────────────

/** A design's link, as a link on the shop: a page of the import, a shop page by its words, or as it was. */
function linkMaker(pages: Map<string, string>) {
  return (href: string | null, label = ""): string => {
    const raw = (href || "").trim();
    const words = label.toLowerCase().replace(/\s+/g, " ").trim();
    if (raw && !raw.startsWith("#") && !raw.startsWith(LOCAL) && !/^javascript:/i.test(raw)) {
      if (/^(https?:|mailto:|tel:)/i.test(raw)) return safeHref(raw) || "#";
      if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
      const name = raw.split(/[?#]/)[0]!.replace(/\.html?$/i, "").split("/").pop() || "";
      if (name === "index") return "/";
      if (pages.has(name.toLowerCase())) return `/${pages.get(name.toLowerCase())}`;
    }
    if (raw.startsWith("#") && pages.has(raw.slice(1).toLowerCase())) return `/${pages.get(raw.slice(1).toLowerCase())}`;
    // A placeholder link: where its words say it goes, on this shop.
    if (/design (your|my) own|start design|customi[sz]e|create (your|a) design|design now|design it|personali[sz]e|design yours/.test(words)) return "/design";
    if (/^(shop|shop all|shop now|all products|products|browse|catalog|catalogue|buy now|order now|start shopping)\b/.test(words)) return "/products";
    if (/collections?\b|categor/.test(words)) return "/collections";
    if (/^contact|get in touch|talk to us/.test(words)) return "/contact";
    if (/quote/.test(words)) return "/quote";
    if (/track/.test(words)) return "/track-order";
    if (/log ?in|sign ?in/.test(words)) return "/login";
    if (/sign ?up|register|create (an )?account/.test(words)) return "/create-account?next=/account";
    if (/account/.test(words)) return "/account";
    if (/^(cart|bag|basket)$/.test(words)) return "/cart";
    if (/^home$/.test(words)) return "/";
    for (const [key, slug] of pages) if (words && (words === key || (key.length > 3 && words.includes(key)))) return `/${slug}`;
    return "#";
  };
}

// ── The whole design ─────────────────────────────────────────────────────────

/**
 * What belongs to the document we were sent, not to a shop: review notes and
 * their switches, and the demo stores' "Plan features" tour button (its tour
 * is the demo's own script; the bar's words stay).
 */
const FURNITURE = /(^|\s)(wn|wf-note|wf-notes|notes-btn|annotation|section-badge|devbar|wireframe-note|pcp-demo-bar__btn|pcp-feat)(\s|$)/;

interface PagePlan { el: Element; title: string; key: string }

function planPages(doc: Document, env: Env): { pages: PagePlan[]; remove: Element[] } {
  const remove: Element[] = [];
  for (const el of Array.from(doc.body.querySelectorAll("[class]"))) if (FURNITURE.test(` ${classOf(el).toLowerCase()} `)) remove.push(el);
  // Pages: sibling panels of which one shows (a design with tabs for its pages).
  const groups = new Map<Element, Element[]>();
  for (const el of Array.from(doc.body.querySelectorAll("[id]"))) {
    const id = el.id.toLowerCase();
    const cls = classOf(el).toLowerCase();
    if (!/(^|-)(page|panel|screen|view|tab)(-|$)/.test(id) && !/(^|\s|-)(page|tab-panel|screen|view)(\s|-|$)/.test(cls)) continue;
    if (!el.parentElement) continue;
    const list = groups.get(el.parentElement) ?? [];
    list.push(el);
    groups.set(el.parentElement, list);
  }
  let best: Element[] = [];
  for (const list of groups.values()) if (list.length > best.length && list.length >= 2) best = list;
  if (best.length < 2) return { pages: [{ el: doc.body, title: "Home", key: "home" }], remove };

  const visible = best.find((p) => env.win.getComputedStyle(p).display !== "none") ?? best[0]!;
  const ordered = [visible, ...best.filter((p) => p !== visible)];
  const switches = Array.from(doc.querySelectorAll("button, a, [onclick], [data-onclick], [data-tab], [data-target], [data-page]"));
  const pages = ordered.map((p) => {
    const key = p.id.toLowerCase().replace(/^(tab|page|panel|screen|view)-/, "").replace(/-(tab|page|panel|screen|view)$/, "") || p.id.toLowerCase();
    // Its name: the button that shows it, else its id in words. That button
    // (and the bar it sits in) is the document's, not the shop's.
    let title = "";
    const pattern = new RegExp(`['"#]${escapeRe(p.id)}['"\\s)]|['"]${escapeRe(key)}['"]|^#${escapeRe(p.id)}$`);
    for (const b of switches) {
      if (best.some((x) => x.contains(b))) continue;
      const attrs = `${b.getAttribute("onclick") || b.getAttribute("data-onclick") || ""} ${b.getAttribute("data-tab") || ""} ${b.getAttribute("data-target") || ""} ${b.getAttribute("data-page") || ""} ${b.getAttribute("href") || ""}`;
      if (pattern.test(` ${attrs} `)) {
        title = readText(b);
        let bar: Element = b;
        while (bar.parentElement && bar.parentElement !== doc.body && !bar.parentElement.contains(p)) bar = bar.parentElement;
        if (!bar.contains(p)) remove.push(bar);
        break;
      }
    }
    if (!title) title = key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { el: p, title, key };
  });
  return { pages, remove };
}

async function settle(win: Window) {
  await new Promise<void>((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => r())));
}

async function setWidth(frame: HTMLIFrameElement, width: number) {
  frame.style.width = `${width}px`;
  await settle(frame.contentWindow!);
}

/**
 * A design whose look its own scripts make (Tailwind's CDN, a page built by a
 * framework) is first run once in a frame of its own, sandboxed with scripts
 * and nothing else: an opaque origin with no way into this page, its cookies
 * or its storage. Once it has drawn, it hands back its HTML as it then is,
 * with the styles its scripts wrote; that is what gets read. null when it
 * does not answer in time (the design is then read as written).
 */
/**
 * Whether a design needs its scripts to look like itself. Most designs do
 * not, and are read as written: running a page's code is the one risky step
 * (a misbehaving page can stall the tab it runs in), so it is only taken for
 * pages styled by Tailwind's CDN, pages packed by a design tool, and pages
 * whose markup has hardly any words (their script draws them).
 */
export function needsScripts(html: string): boolean {
  if (!/<script\b/i.test(html)) return false;
  if (/cdn\.tailwindcss\.com|__bundler\/manifest/i.test(html)) return true;
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const words = body.replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ").replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return words.length < 200;
}

/**
 * A design tool's packed file holding several pages (a "board"): its pages,
 * unpacked here without running anything, in its own order and under the
 * names it gives them. null when the file is not one (a packed single page
 * is drawn as it is).
 */
export async function unpackBoard(html: string): Promise<{ title: string; html: string }[] | null> {
  const part = (type: string) => new RegExp(`<script type="__bundler/${type}">([\\s\\S]*?)</script>`).exec(html)?.[1];
  const manifestText = part("manifest");
  if (!manifestText) return null;
  let order: string[] = [];
  let template = "";
  let manifest: Record<string, { mime?: string; compressed?: boolean; data?: string }> = {};
  try {
    order = JSON.parse(part("page_order") ?? "[]");
    template = JSON.parse(part("template") ?? "\"\"");
    manifest = JSON.parse(manifestText);
  } catch { return null; }
  if (!Array.isArray(order) || !order.length) return null;
  const pages: { title: string; html: string }[] = [];
  for (const id of order) {
    const entry = manifest[id];
    if (!entry?.data || entry.mime !== "text/html") continue;
    const bytes = Uint8Array.from(atob(entry.data), (c) => c.charCodeAt(0));
    const text = entry.compressed
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : new TextDecoder().decode(bytes);
    const frameTag = new RegExp(`<iframe[^>]*${escapeRe(id)}[^>]*>`).exec(template)?.[0] ?? "";
    const title = /title="([^"]*)"/.exec(frameTag)?.[1] ?? "";
    pages.push({ title: title.replace(/&amp;/g, "&").replace(/&quot;/g, "\""), html: text });
  }
  return pages.length ? pages : null;
}

export interface Drawn {
  html: string;
  /** Pages the design draws inside frames of its own: a design board, one page per frame. */
  boards: { title: string; html: string }[];
}

export function renderWithScripts(html: string, frame: HTMLIFrameElement, timeout = 14000): Promise<Drawn | null> {
  return new Promise((resolve) => {
    let timer = 0;
    const done = (value: Drawn | null) => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      frame.srcdoc = "";
      resolve(value);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || !e.data || (e.data as { pcDesign?: boolean }).pcDesign !== true) return;
      const data = e.data as { html?: unknown; boards?: unknown };
      if (typeof data.html !== "string" || data.html.length > 30_000_000) { done(null); return; }
      const boards = Array.isArray(data.boards)
        ? (data.boards as { title?: unknown; html?: unknown }[])
          .filter((b) => typeof b?.html === "string" && (b.html as string).length < 30_000_000)
          .map((b) => ({ title: typeof b.title === "string" ? b.title.slice(0, 120) : "", html: b.html as string }))
        : [];
      done({ html: data.html, boards });
    };
    window.addEventListener("message", onMessage);
    timer = window.setTimeout(() => done(null), timeout);
    frame.srcdoc = withSnapshot(html);
  });
}

/**
 * The design with a last script: once the page has stopped changing (its
 * scripts have drawn it, a board has filled its frames), it sends its HTML,
 * the styles its scripts wrote, and each filled frame's page, to this page.
 */
function withSnapshot(html: string): string {
  const snap = `<script>(function(){
function snap(d){var extra="";for(var i=0;i<d.styleSheets.length;i++){var sh=d.styleSheets[i];try{var n=sh.ownerNode;if(n&&n.tagName==="STYLE"&&!(n.textContent||"").trim()&&sh.cssRules){for(var j=0;j<sh.cssRules.length;j++)extra+=sh.cssRules[j].cssText+"\\n";}}catch(e){}}
var out="<!DOCTYPE html>"+d.documentElement.outerHTML;if(extra)out=out.replace(/<\\/head>/i,"<style>"+extra.replace(/<\\//g,"<\\\\/")+"</style></head>");return out;}
function frames(){var f=document.querySelectorAll("iframe"),out=[];for(var i=0;i<f.length;i++){try{var d=f[i].contentDocument;if(!d||!d.body||!d.body.innerHTML.trim())continue;var t=f[i].getAttribute("title")||"";if(!t){var p=f[i].parentElement;while(p&&!t){var h=p.querySelector("h1,h2,h3");if(h)t=h.textContent||"";p=p.parentElement;}}out.push({title:(t||"").trim(),html:snap(d)});}catch(e){}}return out;}
function size(){var n=document.body?document.body.innerHTML.length:0,f=document.querySelectorAll("iframe");for(var i=0;i<f.length;i++){try{var d=f[i].contentDocument;if(d&&d.body)n+=d.body.innerHTML.length;}catch(e){}}return n;}
var last=-1,still=Date.now(),start=Date.now();
function send(){try{parent.postMessage({pcDesign:true,html:snap(document),boards:frames()},"*");}catch(e){parent.postMessage({pcDesign:true,html:null},"*");}}
function tick(){var n=size();if(n!==last){last=n;still=Date.now();}if(Date.now()-still>1200||Date.now()-start>10000)send();else setTimeout(tick,300);}
if(document.readyState==="complete")setTimeout(tick,300);else window.addEventListener("load",function(){setTimeout(tick,300);});
})();</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${snap}</body>`) : `${html}${snap}`;
}

/**
 * A design board (pages drawn side by side in frames, as design tools export
 * them): each frame read as a design of its own, together as one site. The
 * board whose name says "home" is the home page; the others are pages, at
 * the address their name gives ("New page: /retail") or after their name.
 */
export async function importBoards(boards: { title: string; html: string }[], frame: HTMLIFrameElement, files: File[] = [],
                                   onBoard?: (i: number, n: number) => void): Promise<ImportedDesign> {
  const homeAt = Math.max(0, boards.findIndex((b) => /\bhome\b/i.test(b.title)));
  const order = [homeAt, ...boards.map((_, i) => i).filter((i) => i !== homeAt)];
  const taken = new Set<string>();
  let merged: ImportedDesign | null = null;
  const fonts = new Map<string, Set<number>>();
  const warnings = new Set<string>();
  for (let n = 0; n < order.length; n++) {
    const b = boards[order[n]!]!;
    onBoard?.(n, order.length);
    const d = await importDesign(b.html, frame, files);
    d.fonts.forEach((f) => fonts.set(f.family, new Set([...(fonts.get(f.family) ?? []), ...f.weights])));
    d.warnings.forEach((w) => warnings.add(w));
    const name = b.title.replace(/^[^:]*:\s*/, "").trim() || b.title.trim() || `Page ${n + 1}`;
    const path = /\/([a-z0-9][a-z0-9-]*)/i.exec(b.title)?.[1];
    const pages = d.pages.map((p, i) => {
      if (n === 0 && i === 0) return p;
      const title = i === 0 ? (path ? path.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : name) : `${name}: ${p.title}`;
      return { ...p, title, key: slugFor(i === 0 && path ? path : title, taken) };
    });
    if (!merged) { merged = { ...d, pages }; continue; }
    merged.pages.push(...pages);
    merged.header ??= d.header;
    merged.footer ??= d.footer;
    merged.announcement ??= d.announcement;
    merged.menu ??= d.menu;
    merged.assets.push(...d.assets);
    merged.count += d.pages.reduce((c, p) => c + count(p.tree), 0);
  }
  if (!merged) throw new Error("The board has no pages in it.");
  merged.fonts = [...fonts.entries()].map(([family, ws]) => ({ family, weights: [...ws].sort((a, c) => a - c) }));
  merged.warnings = [...warnings];
  return merged;
}

// ── A design folder: several pages, their code and pictures ────────────────

/**
 * Pages every shop already has, working with its products, cart and orders.
 * A design's page of that name is not brought in: its links go to the shop's
 * own page, drawn in the site's look.
 */
export const SHOP_PAGES: Record<string, { path: string; label: string }> = {
  checkout: { path: "cart", label: "Checkout" }, cart: { path: "cart", label: "Cart" }, bag: { path: "cart", label: "Cart" },
  product: { path: "products", label: "Product page" }, products: { path: "products", label: "All products" },
  collection: { path: "products", label: "Collection page" }, collections: { path: "products", label: "Collections" },
  shop: { path: "products", label: "Shop" }, catalog: { path: "products", label: "Catalogue" },
  "gift-cards": { path: "gift-cards", label: "Gift cards" }, "gift-card": { path: "gift-cards", label: "Gift cards" },
  giftcards: { path: "gift-cards", label: "Gift cards" }, returns: { path: "returns", label: "Returns" },
  track: { path: "track-order", label: "Track order" }, "track-order": { path: "track-order", label: "Track order" },
  tracking: { path: "track-order", label: "Track order" }, account: { path: "account", label: "My account" },
  login: { path: "login", label: "Log in" }, signup: { path: "create-account?next=/account", label: "Sign up" },
  register: { path: "create-account?next=/account", label: "Sign up" }, search: { path: "search", label: "Search" },
  // A trade shop's own pages: the buyer's orders and invoices, quick order, a quote.
  orders: { path: "account/orders", label: "Your orders" }, invoices: { path: "account/invoices", label: "Invoices" },
  "quick-buy": { path: "quick-order", label: "Quick order" }, "quick-order": { path: "quick-order", label: "Quick order" },
  quote: { path: "quote", label: "Quote" }, quotes: { path: "quote", label: "Quote" }, "request-a-quote": { path: "quote", label: "Quote" },
};

const pageName = (f: File) => f.name.toLowerCase().replace(/\.html?$/, "");
const fileBase = (ref: string) => {
  let path = ref.split(/[?#]/)[0] ?? "";
  try { path = decodeURIComponent(path); } catch { /* keep as written */ }
  return (path.split("/").pop() ?? "").toLowerCase();
};
const relative = (ref: string) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref.trim());

/** The design's own stylesheets and scripts, written into the page (a page read on its own cannot fetch them). */
export function inlineCode(html: string, code: Map<string, string>): string {
  return html
    .replace(/<link\b[^>]*>/gi, (tag) => {
      if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
      const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      const css = href && relative(href) ? code.get(fileBase(href)) : undefined;
      return css === undefined ? tag : `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
    })
    .replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script\s*>/gi, (tag, a: string, src: string, b: string) => {
      const js = relative(src) ? code.get(fileBase(src)) : undefined;
      const attrs = `${a} ${b}`.replace(/\s+/g, " ").trim();
      return js === undefined ? tag : `<script${attrs ? ` ${attrs}` : ""}>${js.replace(/<\/script/gi, "<\\/script")}</script>`;
    });
}

/**
 * The design folder's pictures shown from this page's own copy of each file
 * (the frame that reads the design cannot open them by their names), and
 * which file each copy is, for the upload.
 */
export function localise(html: string, pictures: File[]): { html: string; blobs: Map<string, File> } {
  const byName = new Map(pictures.map((f) => [f.name.toLowerCase(), f] as const));
  const made = new Map<string, string>();
  const blobs = new Map<string, File>();
  const IMG = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(?:[?#]|$)/i;
  const swap = (ref: string): string => {
    if (!relative(ref)) return ref;
    const file = byName.get(fileBase(ref));
    if (!file) return ref;
    let url = made.get(file.name.toLowerCase());
    if (!url) {
      url = URL.createObjectURL(file);
      made.set(file.name.toLowerCase(), url);
      blobs.set(url, file);
    }
    return url;
  };
  const out = html
    .replace(/(\s(?:src|poster|href)\s*=\s*)(["'])([^"']+)\2/gi, (m, pre: string, q: string, ref: string) => (IMG.test(ref) ? `${pre}${q}${swap(ref)}${q}` : m))
    .replace(/(\ssrcset\s*=\s*)(["'])([^"']+)\2/gi, (_m, pre: string, q: string, list: string) =>
      `${pre}${q}${list.split(",").map((part) => { const [u = "", ...rest] = part.trim().split(/\s+/); return [swap(u), ...rest].join(" "); }).join(", ")}${q}`)
    // In a style attribute the quotes are written as &quot;.
    .replace(/url\(\s*(&quot;|&#39;|["']?)([^"')&]+?)\1\s*\)/gi, (m, q: string, ref: string) => (IMG.test(ref) ? `url(${q}${swap(ref)}${q})` : m));
  return { html: out, blobs };
}

export interface FolderPlan {
  /** The page that becomes the home page. */
  home: File | null;
  /** Other pages, brought in as pages of the site. */
  pages: File[];
  /** Pages the shop has its own of: not brought in. */
  shop: { file: File; label: string; path: string }[];
}

/** A design's page about its rewards program, by its file's name. */
const REWARDS_PAGE = /^(rewards?|loyalty|points|club|vip|members?|membership|referrals?|refer-a-friend)$/;

/**
 * A design's rewards page shows a pretend member: a balance, a referral link,
 * tiers and points it made up. On the shop it is the shop's own program: the
 * page's title and words stay, and what follows them is the builder's rewards
 * program and refer a friend, which show the program set in Marketing,
 * Loyalty, and a signed-in customer's own points and link. What it took out
 * is returned (its pictures are not uploaded).
 */
export function liveRewards(tree: BuilderNode): BuilderNode[] {
  const program: BuilderNode = { ...BY_TYPE.loyalty_program!.create(), style: { textAlign: "center", marginTop: "48px" } };
  const referral: BuilderNode = { ...BY_TYPE.loyalty_referral!.create(), style: { textAlign: "center", marginTop: "64px", marginBottom: "80px" } };
  const title = (n: BuilderNode): boolean => n.type === "heading" || /<h[1-6]\b/i.test(String(n.props?.html ?? ""))
    || ((n.type === "text" || n.type === "rich_text") && num(String(n.style?.fontSize ?? "")) >= 32) || (n.children ?? []).some(title);
  for (const band of tree.children ?? []) {
    // Through a box that only holds the rest, to where the title sits among what follows it.
    let box = band;
    while ((box.children ?? []).length === 1 && (box.children![0]!.children ?? []).length) box = box.children![0]!;
    const kids = box.children ?? [];
    const head = kids.findIndex(title);
    if (head < 0) continue;
    box.children = [...kids.slice(0, head + 1), program, referral];
    return kids.slice(head + 1);
  }
  // No title to keep: the program in a band of its own, after the page.
  const band = make("section", { width: "contained" });
  band.style = { paddingTop: "64px", paddingBottom: "64px" };
  band.children = [program, referral];
  tree.children = [...(tree.children ?? []), band];
  return [];
}

/** What a folder of design files holds, and what each page becomes. */
export function planFolder(files: File[]): FolderPlan {
  const htmls = files.filter((f) => /\.html?$/i.test(f.name));
  const home = htmls.find((f) => /^(index|home)$/.test(pageName(f))) ?? htmls[0] ?? null;
  const shop: FolderPlan["shop"] = [];
  const pages: File[] = [];
  for (const f of htmls) {
    if (f === home) continue;
    const known = SHOP_PAGES[pageName(f)];
    if (known) shop.push({ file: f, label: known.label, path: `/${known.path}` });
    else pages.push(f);
  }
  return { home, pages, shop };
}

/**
 * A folder of design files, as one site: the home page, its other pages, its
 * header and footer. Each page is drawn with the design's own scripts and
 * styles (in a sealed frame), then read; links between its pages go to where
 * each page is on the shop.
 */
export async function importFolder(files: File[], frame: HTMLIFrameElement, scripted: HTMLIFrameElement,
                                   onStep?: (msg: string) => void): Promise<ImportedDesign> {
  const plan = planFolder(files);
  if (!plan.home) throw new Error("the folder has no .html page.");
  const code = new Map<string, string>();
  for (const f of files) if (/\.(css|js|mjs)$/i.test(f.name)) code.set(f.name.toLowerCase(), await f.text());
  const pictures = files.filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(f.name));

  // Where every page of the design is on the shop.
  const taken = new Set<string>();
  const links: Record<string, string> = {};
  for (const s of plan.shop) links[pageName(s.file)] = s.path.slice(1);
  const slugs = new Map(plan.pages.map((f) => [f, slugFor(pageName(f), taken)] as const));
  for (const [f, slug] of slugs) links[pageName(f)] = slug;

  const designs: { file: File; design: ImportedDesign }[] = [];
  const order = [plan.home, ...plan.pages];
  for (let i = 0; i < order.length; i++) {
    const f = order[i]!;
    onStep?.(`Reading ${f.name} (${i + 1} of ${order.length})…`);
    let html = inlineCode(await f.text(), code);
    if (/<script\b/i.test(html)) html = (await renderWithScripts(html, scripted))?.html ?? html;
    const local = localise(html, pictures);
    designs.push({ file: f, design: await importDesign(local.html, frame, pictures, { links, blobs: local.blobs }) });
  }

  const merged = designs[0]!.design;
  const fonts = new Map(merged.fonts.map((f) => [f.family, new Set(f.weights)] as const));
  const warnings = new Set(merged.warnings);
  merged.pages = merged.pages.slice(0, 1);
  for (const { file, design } of designs.slice(1)) {
    design.fonts.forEach((f) => fonts.set(f.family, new Set([...(fonts.get(f.family) ?? []), ...f.weights])));
    design.warnings.forEach((w) => warnings.add(w));
    const first = design.pages[0];
    if (!first) continue;
    const title = /<title>([^<]*)<\/title>/i.exec(await file.text())?.[1]?.split(/[·|–-]/)[0]?.trim()
      || pageName(file).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const gone = REWARDS_PAGE.test(pageName(file)) ? liveRewards(first.tree) : [];
    merged.pages.push({ ...first, key: slugs.get(file)!, title });
    merged.header ??= design.header;
    merged.footer ??= design.footer;
    merged.announcement ??= design.announcement;
    merged.menu ??= design.menu;
    // A picture used on several pages is uploaded once, and goes everywhere it is used.
    for (const a of design.assets) {
      a.uses = a.uses.filter((u) => !gone.some((g) => g === u.node || contains(g, u.node)));
      if (!a.uses.length) continue;
      const same = merged.assets.find((x) => x.key === a.key);
      if (same) same.uses.push(...a.uses);
      else merged.assets.push(a);
    }
    merged.count += count(first.tree);
  }
  merged.fonts = [...fonts.entries()].map(([family, ws]) => ({ family, weights: [...ws].sort((a, b) => a - b) }));
  merged.warnings = [...warnings];
  return merged;
}

/** The design, ready for the frame: no scripts, relative addresses made recognisable. */
export function prepareHtml(html: string): string {
  let s = html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh[^>]*>/gi, "");
  // Every picture loads at once: the frame reading the design is off screen, so a lazy one never would.
  s = s.replace(/\sloading\s*=\s*(["'])lazy\1/gi, ' loading="eager"');
  // Inline handlers would not run (the frame allows no scripts); kept as data, they still say which button shows which page.
  s = s.replace(/(\s)on([a-z]+)\s*=(?=[^<>]*>)/gi, "$1data-on$2=");
  s = s.replace(/<base\b[^>]*>/gi, "");
  if (/<head[^>]*>/i.test(s)) s = s.replace(/<head([^>]*)>/i, `<head$1><base href="${LOCAL}">`);
  else s = `<head><base href="${LOCAL}"></head>${s}`;
  return s;
}

/** Fonts the design loads from Google, with their weights. */
function googleFonts(doc: Document): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  const hrefs = [
    ...Array.from(doc.querySelectorAll("link[href*='fonts.googleapis.com']")).map((l) => l.getAttribute("href") || ""),
    ...Array.from(doc.querySelectorAll("style")).flatMap((s) => Array.from((s.textContent || "").matchAll(/@import\s+url\(\s*['"]?([^'")]*fonts\.googleapis\.com[^'")]*)/g)).map((m) => m[1] ?? "")),
  ];
  for (const href of hrefs) {
    let url: URL;
    try { url = new URL(href, "https://fonts.googleapis.com/"); } catch { continue; }
    for (const fam of url.searchParams.getAll("family")) {
      for (const one of fam.split("|")) {
        const [name, spec = ""] = one.split(":");
        if (!name) continue;
        const weights = new Set<number>();
        for (const m of spec.matchAll(/\b([1-9]00)\b/g)) weights.add(Number(m[1]));
        const range = /([1-9]00)\.\.([1-9]00)/.exec(spec);
        if (range) for (let w = Number(range[1]); w <= Number(range[2]); w += 100) weights.add(w);
        out.set(name.replace(/\+/g, " ").trim(), weights.size ? weights : new Set([400, 700]));
      }
    }
  }
  return out;
}

function slugFor(title: string, taken: Set<string>): string {
  const base = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";
  let slug = RESERVED_SLUGS.has(base) ? `${base}-page` : base;
  let n = 2;
  while (taken.has(slug) || RESERVED_SLUGS.has(slug)) slug = `${base}-${n++}`;
  taken.add(slug);
  return slug;
}

/**
 * Read a design. `frame` is a hidden iframe the caller owns, in the page and
 * sandboxed with allow-same-origin and nothing else, so nothing in it runs.
 */
export interface ImportOptions {
  /** Where the design's other pages go on the shop, by file name: { "checkout": "cart", "contact": "contact" }. */
  links?: Record<string, string>;
  /** The design folder's pictures, by the address this page shows them at while reading (see localise). */
  blobs?: Map<string, File>;
}

export async function importDesign(html: string, frame: HTMLIFrameElement, files: File[] = [], opts: ImportOptions = {}): Promise<ImportedDesign> {
  const warnings = new Set<string>();
  const warn = (m: string) => { warnings.add(m); };
  frame.style.width = `${IMPORT_WIDTHS.desktop}px`;
  frame.style.height = "900px";
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = prepareHtml(html);
  });
  const win = frame.contentWindow!;
  const doc = frame.contentDocument!;
  // Pictures and fonts in, or a few seconds, whichever comes first.
  await Promise.race([
    Promise.all([
      (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve(),
      ...Array.from(doc.images).map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = r; i.onerror = r; }))),
    ]),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
  await settle(win);

  const assets = new Assets(new Map(files.map((f) => [f.name.toLowerCase(), f] as const)), warn, opts.blobs);
  const fonts = new Map<string, Set<number>>();
  const pageLinks = new Map<string, string>(Object.entries(opts.links ?? {}));
  LOADABLE = new Set([...googleFonts(doc).keys(), ...GOOGLE_FONTS.map((f) => f.family)]);
  const env: Env = { win, doc, declared: new Declared(doc, win), assets, warn, fonts, link: linkMaker(pageLinks), recs: [], at: "style" };

  const plan = planPages(doc, env);
  for (const el of plan.remove) (el as HTMLElement).style?.setProperty("display", "none", "important");
  const taken = new Set<string>();
  const slugs = plan.pages.map((p, i) => (i === 0 ? "" : slugFor(p.title, taken)));
  plan.pages.forEach((p, i) => {
    if (i === 0) return;
    pageLinks.set(p.key.toLowerCase(), slugs[i]!);
    pageLinks.set(p.title.toLowerCase(), slugs[i]!);
  });

  const result: ImportedDesign = {
    pages: [], announcement: null, header: null, footer: null, menu: null, fonts: [], headingFont: null, bodyFont: null,
    containerWidth: null, colors: {}, assets: [], warnings: [], count: 0,
  };

  for (let pi = 0; pi < plan.pages.length; pi++) {
    const page = plan.pages[pi]!;
    for (const p of plan.pages) {
      if (p.el === doc.body) continue;
      (p.el as HTMLElement).style.setProperty("display", p === page ? "block" : "none", "important");
    }
    env.at = "style";
    await setWidth(frame, IMPORT_WIDTHS.desktop);
    env.declared.refresh();
    env.recs = [];

    const bands = bandsOf(page.el, env);
    if (pi === 0) {
      // The site's content width: the centred wrapper most bands share.
      const widths = new Map<number, number>();
      for (const b of bands) { const c = contentWidthOf(b, env); if (c) widths.set(c, (widths.get(c) ?? 0) + 1); }
      result.containerWidth = [...widths.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }
    const sections: BuilderNode[] = [];
    let headerEl: Element | null = null;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i]!;
      if (pi === 0 && !result.header && !result.announcement && i === 0 && isAnnouncement(b, bands[i + 1], env)) {
        result.announcement = section(b, env, "Announcement", result.containerWidth);
        continue;
      }
      if (isHeader(b, i, env)) {
        if (pi === 0 && !result.header) {
          headerEl = b;
          result.header = section(b, env, "Header", result.containerWidth);
          (result.header.props as Record<string, unknown>).sticky = /sticky|fixed/.test(env.win.getComputedStyle(b).position);
        }
        continue;
      }
      if (isFooter(b, i, bands.length)) {
        if (pi === 0 && !result.footer) result.footer = section(b, env, "Footer", result.containerWidth);
        continue;
      }
      sections.push(section(b, env, "", result.containerWidth));
    }
    if (pi === 0 && result.header && headerEl) result.menu = storeParts(result.header, headerEl, env);

    // The same page at a tablet's and a phone's width: what changes there.
    await readAt(frame, env, "tablet", IMPORT_WIDTHS.tablet);
    await readAt(frame, env, "mobile", IMPORT_WIDTHS.mobile);
    env.at = "style";
    await setWidth(frame, IMPORT_WIDTHS.desktop);

    const tree = make("stack");
    tree.children = sections;
    result.pages.push({ title: pi === 0 ? "Home" : page.title, key: pi === 0 ? "home" : slugs[pi]!, tree, sections: sections.length });
  }

  // The site's look: fonts the design loads from Google (or ones Google has),
  // the body and heading fonts, the page colours.
  const loaded = googleFonts(doc);
  const catalog = new Set(GOOGLE_FONTS.map((f) => f.family));
  for (const [fam, ws] of fonts) {
    if (!loaded.has(fam) && !catalog.has(fam)) continue;
    const all = new Set([...(loaded.get(fam) ?? []), ...ws]);
    result.fonts.push({ family: fam, weights: [...all].filter((w) => w >= 100 && w <= 900).sort((a, b) => a - b) });
  }
  const usable = new Set(result.fonts.map((f) => f.family));
  const bodyCs = win.getComputedStyle(doc.body);
  const bf = familyOf(bodyCs);
  result.bodyFont = usable.has(bf) ? bf : null;
  const h = Array.from(doc.querySelectorAll("h1, h2, h3")).find((x) => shown(x, env));
  const hf = h ? familyOf(win.getComputedStyle(h)) : "";
  result.headingFont = usable.has(hf) ? hf : result.bodyFont;
  result.colors.background = hexColour(bodyCs.backgroundColor) ?? undefined;
  result.colors.text = hexColour(bodyCs.color) ?? undefined;
  // The brand colour: the first button the design fills (a code link in the
  // top bar, drawn as words, says nothing about the brand).
  const buttons: BuilderNode[] = [];
  const collect = (n: BuilderNode | null) => { if (!n) return; if (n.type === "button") buttons.push(n); (n.children ?? []).forEach(collect); };
  [result.header, ...result.pages.map((p) => p.tree)].forEach(collect);
  const pc = buttons.map((b) => b.style?.backgroundColor).find((c) => typeof c === "string" && /^#[0-9A-F]{6}$/i.test(c));
  if (typeof pc === "string") result.colors.primary = pc;
  // Cards, lines and quiet words, between the page and its words: the
  // builder's own pieces (product cards, a menu link pointed at, fields) then
  // sit in the design's palette, dark or light, not the starter's light one.
  const bg = result.colors.background, ink = result.colors.text;
  if (bg && ink && /^#[0-9A-F]{6}$/i.test(bg) && /^#[0-9A-F]{6}$/i.test(ink.slice(0, 7))) {
    result.colors.surface = mixHex(bg, ink, 0.06);
    result.colors.border = mixHex(bg, ink, 0.16);
    result.colors.muted = mixHex(bg, ink, 0.62);
  }

  // Families the site will not have are taken off the elements: its own fonts stand in.
  const strip = (n: BuilderNode | null) => {
    if (!n) return;
    for (const s of [n.style, n.tablet, n.mobile]) if (s && typeof s.fontFamily === "string" && !usable.has(s.fontFamily)) delete s.fontFamily;
    n.children?.forEach(strip);
  };
  for (const t of [result.announcement, result.header, result.footer, ...result.pages.map((p) => p.tree)]) strip(t);
  const missing = [...fonts.keys()].filter((f) => !usable.has(f));
  if (missing.length) warn(`These fonts are not on Google Fonts, so the site's own font stands in for them: ${missing.join(", ")}.`);

  result.assets = [...assets.list.values()];
  result.count = [result.announcement, result.header, result.footer, ...result.pages.map((p) => p.tree)].reduce((n, t) => n + count(t), 0);
  if (result.count > IMPORT_MAX_NODES) warn(`The design has ${result.count} elements; a site holds about ${IMPORT_MAX_NODES}. Bring in fewer pages.`);
  result.warnings = [...warnings];
  return result;
}

function count(n: BuilderNode | null): number {
  return n ? 1 + (n.children ?? []).reduce((a, c) => a + count(c), 0) : 0;
}

/** What to reset a setting to, on a device where the design no longer has it. */
const RESET: Record<string, string | number> = {
  display: "flex", flexDirection: "column", gridColumns: 1, gridTemplate: "1fr", flexWrap: "nowrap", justifyContent: "flex-start",
  alignItems: "stretch", alignSelf: "stretch", rowGap: "0px", columnGap: "0px", flexGrow: 0, flexBasis: "auto", flexShrink: 1,
  gridColumnSpan: 1, width: "auto", maxWidth: "none", minHeight: "0px", height: "auto", aspectRatio: "auto",
  backgroundColor: "transparent", backgroundImage: "none", borderRadius: "0px", boxShadow: "none", opacity: "1",
  padding: "0px", paddingTop: "0px", paddingRight: "0px", paddingBottom: "0px", paddingLeft: "0px",
  marginTop: "0px", marginRight: "0px", marginBottom: "0px", marginLeft: "0px", letterSpacing: "0px", textTransform: "none",
  border: "0px solid transparent", borderTopWidth: "0px", borderBottomWidth: "0px", overflow: "visible", textAlign: "left",
  fontStyle: "normal",
};

async function readAt(frame: HTMLIFrameElement, env: Env, at: "tablet" | "mobile", width: number) {
  env.at = at;
  await setWidth(frame, width);
  env.declared.refresh();
  for (const rec of env.recs) {
    if (rec.keep || !rec.el.isConnected) continue;
    const node = rec.node;
    if (!shown(rec.el, env, true)) {
      node.hide = { ...(node.hide ?? {}), [at]: true };
      continue;
    }
    // Before: what this device inherits (a phone gets the tablet's settings too).
    const before = { ...(node.style ?? {}), ...(at === "mobile" ? node.tablet ?? {} : {}) } as Style;
    const now = clean(rec.read(env.win.getComputedStyle(rec.el)), node.type);
    const diff: Style = {};
    for (const [k, v] of Object.entries(now)) if (before[k] !== v) diff[k] = v;
    for (const k of Object.keys(before)) if (!(k in now) && RESET[k] !== undefined && before[k] !== RESET[k]) diff[k] = RESET[k]!;
    // A grid's columns are always said for each device: where they are not,
    // the builder folds a grid by itself (3 → 2 → 1), which the design did not.
    if (now.display === "grid") {
      if (now.gridColumns !== undefined) diff.gridColumns = now.gridColumns;
      if (now.gridTemplate !== undefined) diff.gridTemplate = now.gridTemplate;
    }
    // A row says whether it wraps on each device too: the builder lets a row
    // that does not wrap on a computer wrap on a tablet unless told.
    if (now.display === "flex" && now.flexDirection === "row" && now.flexWrap) diff.flexWrap = now.flexWrap;
    if (rec.columns) diff.columns = rec.columns();
    if (Object.keys(diff).length) node[at] = { ...(node[at] ?? {}), ...diff } as BuilderNode["tablet"];
  }
}

// ── Into the draft ───────────────────────────────────────────────────────────

export interface ApplyChoice {
  /** Pages of the design to bring in, by key; "home" replaces the home page. */
  pages: string[];
  header: boolean;
  footer: boolean;
  /** The site's fonts, colours and content width from the design. */
  look: boolean;
}

/** The most elements a site may have: the server refuses to publish more (schema.MAX_NODES). */
export const SITE_MAX_NODES = 3000;

/** How many elements a site has, every tree counted, as the server counts them. */
export function siteSize(doc: SiteDoc): number {
  const trees: (BuilderNode | null | undefined)[] = [
    ...Object.values(doc.parts ?? {}),
    ...Object.values(doc.templates ?? {}).flatMap((group) => Object.values(group ?? {}).map((t) => t?.tree)),
    ...Object.values(doc.pages ?? {}).map((p) => p?.tree),
    ...Object.values(doc.globals ?? {}).map((g) => g?.tree),
    ...Object.values(doc.saved ?? {}).map((s) => s?.tree),
  ];
  return trees.reduce((n, t) => n + count(t ?? null), 0);
}

/** The site's size once the design is in, as chosen: what it replaces taken off, what it adds put on. */
export function sizeAfter(doc: SiteDoc, d: ImportedDesign, choice: ApplyChoice): number {
  let n = siteSize(doc);
  for (const p of d.pages) {
    if (!choice.pages.includes(p.key)) continue;
    if (p.key === "home") n -= count(doc.templates?.home?.default?.tree ?? null);
    n += count(p.tree);
  }
  if (choice.header && d.header) n += count(d.header) + count(d.announcement) - count(doc.parts?.header ?? null) - count(doc.parts?.announcement ?? null);
  if (choice.footer && d.footer) n += count(d.footer) - count(doc.parts?.footer ?? null);
  return n;
}

/** Every link in the imported trees and menu from one address to another. */
function relink(trees: (BuilderNode | null)[], from: string, to: string) {
  const visit = (n: BuilderNode | null) => {
    if (!n) return;
    const p = n.props as Record<string, unknown> | undefined;
    if (p) {
      for (const k of ["href"]) if (p[k] === from) p[k] = to;
      if (typeof p.html === "string") p.html = p.html.split(`href="${from}"`).join(`href="${to}"`);
    }
    n.children?.forEach(visit);
  };
  trees.forEach(visit);
}

/** The draft with the design in it. Pictures must have been uploaded (placeUpload) first. */
export function applyImport(doc: SiteDoc, d: ImportedDesign, choice: ApplyChoice): { doc: SiteDoc; slugs: string[] } {
  const next: SiteDoc = { ...doc, templates: { ...doc.templates }, pages: { ...doc.pages }, parts: { ...doc.parts } };
  const trees = [d.announcement, d.header, d.footer, ...d.pages.map((p) => p.tree)];
  const slugs: string[] = [];
  for (const page of d.pages) {
    if (!choice.pages.includes(page.key)) continue;
    if (page.key === "home") {
      const group = { ...(next.templates.home ?? {}) } as Record<string, Template>;
      group.default = { ...(group.default ?? { name: "Home" }), tree: page.tree };
      next.templates = { ...next.templates, home: group };
      continue;
    }
    let slug = page.key;
    let n = 2;
    while (next.pages[slug] || RESERVED_SLUGS.has(slug)) slug = `${page.key}-${n++}`;
    if (slug !== page.key) {
      relink(trees, `/${page.key}`, `/${slug}`);
      if (d.menu) for (const it of d.menu.items) { if (it.href === `/${page.key}`) it.href = `/${slug}`; for (const c of it.children ?? []) if (c.href === `/${page.key}`) c.href = `/${slug}`; }
    }
    const template = next.templates.page?.full_width ? "full_width" : "default";
    next.pages = { ...next.pages, [slug]: { title: page.title, template, seo: { title: "", description: "", image: "" }, tree: page.tree } };
    slugs.push(slug);
  }
  // The design's header is the top of every page: the bar above it is the
  // design's too, or none when it has none.
  if (choice.header && d.header) next.parts = { ...next.parts, header: d.header, announcement: d.announcement ?? null };
  if (choice.footer && d.footer) next.parts = { ...next.parts, footer: d.footer };
  if (choice.look) {
    const settings = { ...(next.settings ?? {}) };
    const fonts = [...(settings.fonts ?? [])];
    for (const f of d.fonts) {
      const at = fonts.findIndex((x) => x.family === f.family);
      if (at >= 0) fonts[at] = { ...fonts[at]!, weights: [...new Set([...(fonts[at]!.weights ?? []), ...f.weights])].sort((a, b) => a - b) };
      else fonts.push({ family: f.family, source: "google", weights: f.weights.length ? f.weights : [400, 700], styles: ["normal"] });
    }
    settings.fonts = fonts;
    const typography = { ...(settings.typography ?? {}) };
    if (d.headingFont) typography.heading = { ...(typography.heading ?? {}), family: d.headingFont };
    if (d.bodyFont) {
      typography.body = { ...(typography.body ?? {}), family: d.bodyFont };
      typography.button = { ...(typography.button ?? {}), family: d.bodyFont };
    }
    settings.typography = typography;
    if (d.containerWidth && d.containerWidth >= 640 && d.containerWidth <= 1800) settings.layout = { ...(settings.layout ?? {}), containerWidth: d.containerWidth };
    const colors = { ...(settings.colors ?? {}) };
    if (d.colors.background && /^#[0-9A-F]{6}$/i.test(d.colors.background)) colors.background = d.colors.background;
    if (d.colors.text && /^#[0-9A-F]{6}$/i.test(d.colors.text)) colors.text = d.colors.text;
    if (d.colors.primary) colors.primary = d.colors.primary;
    for (const k of ["surface", "border", "muted"] as const) if (d.colors[k]) colors[k] = d.colors[k];
    settings.colors = colors;
    next.settings = settings;
  } else {
    // Without the design's fonts, its elements use the site's own.
    const own = new Set((next.settings?.fonts ?? []).map((f) => f.family));
    const strip = (n: BuilderNode | null | undefined) => {
      if (!n) return;
      for (const s of [n.style, n.tablet, n.mobile]) if (s && typeof s.fontFamily === "string" && !own.has(s.fontFamily)) delete s.fontFamily;
      n.children?.forEach(strip);
    };
    trees.forEach(strip);
  }
  return { doc: next, slugs };
}

/** After uploading: every use of a picture gets its new address. */
export function placeUpload(asset: ImportAsset, url: string) {
  for (const u of asset.uses) {
    if (u.prop) (u.node.props as Record<string, unknown>)[u.prop] = url;
    if (u.at && u.key) {
      const style = (u.at === "style" ? u.node.style : u.node[u.at]) as Record<string, unknown> | undefined;
      const v = style?.[u.key];
      if (style && typeof v === "string" && u.from) style[u.key] = v.split(u.from).join(url);
    }
  }
}

/** A picture that could not be uploaded is taken out rather than left broken. */
export function dropAsset(asset: ImportAsset) {
  for (const u of asset.uses) {
    if (u.prop) (u.node.props as Record<string, unknown>)[u.prop] = "";
    if (u.at && u.key) {
      const style = (u.at === "style" ? u.node.style : u.node[u.at]) as Record<string, unknown> | undefined;
      if (style && typeof style[u.key] === "string" && u.from && String(style[u.key]).includes(u.from)) style[u.key] = "none";
    }
  }
}
