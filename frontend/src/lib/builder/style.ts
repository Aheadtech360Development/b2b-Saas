/**
 * A builder site's look, as CSS.
 *
 * Every element is drawn with a data-b attribute holding its id, and its
 * styles become rules scoped to that attribute — desktop first, then what
 * changes on a tablet, then on a phone. One element's settings can therefore
 * never reach another, and a phone layout is a set of overrides rather than a
 * second page.
 *
 * Breakpoints are container queries on the site's own wrapper, not media
 * queries on the window. On the storefront they behave the same — the site
 * is the width of the window — but in the editor the canvas is a 390px phone
 * inside a 1600px window, and only a container query knows that. One set of
 * rules, so what the merchant sees on the phone canvas is what a phone gets.
 *
 * Values are checked again here even though the server checked them at
 * publish: a draft in the editor has not been published, and a style that
 * breaks out of its rule would break the editor's own page.
 */
import { fontStack } from "./fonts";
import type { BuilderNode, NodeStyle, SiteSettings } from "./types";

export const TABLET_MAX = 1024;
export const MOBILE_MAX = 640;

/** The query a breakpoint rule sits in. */
const Q = (cond: string) => `@container bsite ${cond}`;

/** Properties where a bare number means pixels. */
const PX = new Set([
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "gap", "width", "maxWidth", "minHeight", "height", "borderRadius", "borderWidth", "fontSize",
  "rowGap", "columnGap", "minWidth", "flexBasis",
]);

const UNSAFE = /[;{}<>\\]|expression\s*\(|javascript:|@import|url\(\s*['"]?\s*(?!https:)/i;
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;

// ── The layout engine ─────────────────────────────────────────────────────────
// A container's layout is ordinary style data — `display`, a column count, gaps,
// alignment — kept per breakpoint like every other setting, so a tablet or a
// phone inherits the desktop layout until somebody changes it there. These keys
// are not CSS one-to-one: style.ts turns them into the grid they describe.
const COMPOSITE = new Set([
  "gridColumns", "gridRows", "gridAuto", "gridMin", "gridTemplate",
  "gridColumn", "gridRow", "gridColumnSpan", "gridRowSpan",
]);

/** What lays out a container's children, as opposed to the box itself. A
 *  section's children sit in its inner wrapper, so these go there. */
const LAYOUT = new Set([
  "display", "flexDirection", "flexWrap", "justifyContent", "alignItems", "alignContent",
  "justifyItems", "gap", "rowGap", "columnGap", "gridAutoFlow",
  "gridColumns", "gridRows", "gridAuto", "gridMin", "gridTemplate",
]);

const ENUMS: Record<string, string[]> = {
  display: ["flex", "grid", "block"],
  gridAutoFlow: ["row", "column", "dense", "row dense", "column dense"],
};

/** Column widths a merchant can type: 2fr 1fr, 240px 1fr, minmax(200px,1fr) … */
const TRACK = String.raw`(?:\d+(?:\.\d+)?(?:fr|px|%|em|rem)|auto|min-content|max-content|minmax\(\s*\d+(?:\.\d+)?(?:px|%|em|rem)?\s*,\s*\d+(?:\.\d+)?(?:fr|px|%|em|rem)\s*\))`;
const TRACKS_OK = new RegExp(`^\\s*${TRACK}(?:\\s+${TRACK}){0,11}\\s*$`);
const SIZE_OK = /^\d+(?:\.\d+)?(?:px|rem|em|%)$/;

function int(raw: unknown, min: number, max: number): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function value(key: string, raw: string | number): string | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return PX.has(key) ? `${raw}px` : String(raw);
  }
  const v = String(raw).trim();
  if (!v || UNSAFE.test(v)) return null;
  if (key === "fontFamily") return fontStack(v.split(",")[0]!.trim().replace(/^['"]|['"]$/g, ""));
  if (ENUMS[key] && !ENUMS[key]!.includes(v)) return null;
  return v;
}

/** grid-template-columns for a container's layout settings, or null. */
export function gridTemplate(style: NodeStyle | undefined): string | null {
  const s = (style ?? {}) as Record<string, unknown>;
  if (typeof s.gridTemplate === "string" && TRACKS_OK.test(s.gridTemplate)) return s.gridTemplate.trim().replace(/\s+/g, " ");
  if (s.gridAuto === "fit" || s.gridAuto === "fill") {
    const raw = typeof s.gridMin === "number" ? `${s.gridMin}px` : String(s.gridMin ?? "").trim();
    const min = SIZE_OK.test(raw) ? raw : "240px";
    // min(…, 100%) keeps a single card from overflowing a narrow screen.
    return `repeat(auto-${s.gridAuto},minmax(min(${min},100%),1fr))`;
  }
  const n = int(s.gridColumns, 1, 12);
  return n ? `repeat(${n},minmax(0,1fr))` : null;
}

/** grid-column / grid-row for an item: a start, a span, or both. */
function placement(start: unknown, span: unknown): string | null {
  const st = start === "auto" ? "auto" : int(start, 1, 12);
  const sp = int(span, 1, 12);
  if (st && sp && sp > 1) return `${st} / span ${sp}`;
  if (st) return String(st);
  if (sp && sp > 1) return `span ${sp}`;
  return null;
}

type Part = "all" | "layout" | "box";

/** One breakpoint's declarations. `columns` becomes the grid it describes. */
export function declarations(style: NodeStyle | undefined, type: string, part: Part = "all"): string {
  if (!style) return "";
  const out: string[] = [];
  const s = style as Record<string, unknown>;
  const want = (key: string) => part === "all" || (part === "layout") === LAYOUT.has(key);
  const template = want("gridColumns") ? gridTemplate(style) : null;
  for (const [key, raw] of Object.entries(style)) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (key === "columns") {
      // The layout engine's own columns win over a row's older setting.
      if (template) continue;
      const n = Math.max(1, Math.min(6, Math.round(Number(raw)) || 1));
      if (type === "row" || type.endsWith("_grid") || type === "collection_products" || type === "testimonials" || type === "gallery") {
        out.push(`grid-template-columns:repeat(${n},minmax(0,1fr))`);
      }
      continue;
    }
    if (COMPOSITE.has(key) || !want(key)) continue;
    const v = value(key, raw as string | number);
    if (v !== null) out.push(`${kebab(key)}:${v}`);
  }
  if (template) out.push(`grid-template-columns:${template}`);
  if (want("gridRows") && s.gridRows !== undefined && s.gridRows !== "") {
    const rows = int(s.gridRows, 0, 12);
    if (rows === 0) out.push("grid-template-rows:none");
    else if (rows) out.push(`grid-template-rows:repeat(${rows},auto)`);
  }
  if (part !== "layout") {
    const col = placement(s.gridColumn, s.gridColumnSpan);
    if (col) out.push(`grid-column:${col}`);
    const row = placement(s.gridRow, s.gridRowSpan);
    if (row) out.push(`grid-row:${row}`);
  }
  return out.join(";");
}

function scope(id: string): string {
  return `.bsite [data-b="${id}"]`;
}

/** Whether a node set a layout mode at any breakpoint. */
export function hasLayout(node: BuilderNode): boolean {
  return [node.style, node.tablet, node.mobile].some((s) => s && (s as Record<string, unknown>).display);
}

/** Columns a grid falls to on a smaller screen nobody set columns for. */
function fewer(n: number, to: "tablet" | "mobile"): number {
  if (to === "tablet") return n >= 4 ? Math.min(3, Math.ceil(n / 2)) : Math.min(n, 2);
  return n >= 6 ? 2 : 1;
}

const setsColumns = (s: NodeStyle) => s.gridColumns !== undefined || !!s.gridAuto || !!s.gridTemplate;
const setsPlacement = (s: NodeStyle | undefined) =>
  !!s && (s.gridColumn !== undefined || s.gridRow !== undefined || s.gridColumnSpan !== undefined || s.gridRowSpan !== undefined);

/**
 * How many columns a grid container has on each device, the way its CSS lays
 * it out: what was set there, else what it collapsed to by itself, else what
 * it inherits. null where the columns are not a count (fit-to-width, custom
 * widths) or no grid columns are set at all.
 */
export function gridColumnsAt(node: BuilderNode): Record<"desktop" | "tablet" | "mobile", number | null> {
  const count = (s: NodeStyle | undefined): number | null | undefined => {
    if (!s || !setsColumns(s)) return undefined;
    return !s.gridAuto && !s.gridTemplate ? int(s.gridColumns, 1, 12) : null;
  };
  const desk = count(node.style) ?? null;
  const tSet = count(node.tablet);
  const tablet = tSet !== undefined ? tSet : desk && desk > 1 ? fewer(desk, "tablet") : desk;
  const mSet = count(node.mobile);
  const mobile = mSet !== undefined ? mSet
    : tablet && tablet > 1 ? Math.min(tablet, fewer(tSet !== undefined ? tablet : (desk ?? tablet), "mobile")) : tablet;
  return { desktop: desk, tablet, mobile };
}

/** Where a grid collapsed by itself, the columns it has there — for its children. */
export interface GridContext { tablet?: number; mobile?: number }

/** The rules for one element, at every breakpoint, including whether it shows. */
export function nodeCss(node: BuilderNode, parent?: GridContext): string {
  return nodeRules(node, parent).css;
}

function nodeRules(node: BuilderNode, parent?: GridContext): { css: string; grid: GridContext } {
  const grid: GridContext = {};
  if (!ID_OK.test(node.id)) return { css: "", grid };
  const sel = scope(node.id);
  const rules: string[] = [];

  // Grid-like elements take their column count from props as well, so a
  // product grid set to 4 columns is 4 columns without a style override.
  const props = (node.props ?? {}) as Record<string, unknown>;
  const base: NodeStyle = { ...(node.style ?? {}) };
  if (base.columns === undefined && typeof props.columns === "number") base.columns = props.columns;

  // Columns nobody set for a smaller screen still fit on one: four across on
  // a phone is four unreadable cards. What the merchant set always wins.
  const tablet: NodeStyle = { ...(node.tablet ?? {}) };
  const mobile: NodeStyle = { ...(node.mobile ?? {}) };
  const across = Math.round(Number(base.columns)) || 0;
  if (across > 1) {
    const single = node.type === "row" || node.type === "testimonials";
    if (tablet.columns === undefined && across > 3) tablet.columns = single ? 2 : 3;
    if (mobile.columns === undefined && across > (single ? 1 : 2)) mobile.columns = single ? 1 : 2;
  }

  // The same for the layout engine's grids: 3 across → 2 → 1 unless set.
  const desk = !base.gridAuto && !base.gridTemplate ? int(base.gridColumns, 1, 12) : null;
  if (desk && desk > 1) {
    let tabletCols = desk;
    if (!setsColumns(tablet)) {
      tabletCols = fewer(desk, "tablet");
      if (tabletCols < desk) {
        tablet.gridColumns = tabletCols;
        if (base.gridRows !== undefined && tablet.gridRows === undefined) tablet.gridRows = 0;
        grid.tablet = tabletCols;
      }
    } else {
      tabletCols = !tablet.gridAuto && !tablet.gridTemplate ? int(tablet.gridColumns, 1, 12) ?? 0 : 0;
    }
    if (tabletCols > 1 && !setsColumns(mobile)) {
      // From the desktop count while the tablet's was automatic too, so six
      // logos are two across on a phone, not one; from the tablet's when the
      // merchant chose it.
      const m = fewer(setsColumns(node.tablet ?? {}) ? tabletCols : desk, "mobile");
      if (m < tabletCols) {
        mobile.gridColumns = m;
        // Rows are already undone on a tablet that collapsed; a phone inherits that.
        if (tablet.gridRows === undefined && base.gridRows !== undefined && mobile.gridRows === undefined) mobile.gridRows = 0;
        grid.mobile = m;
      }
    }
  }

  // An item placed by hand stays where it was put — except on a screen where
  // its grid collapsed by itself, where cell 3 of 3 no longer exists: there it
  // flows with the rest, its span clipped to the columns there are.
  const reset = (at: NodeStyle, from: NodeStyle, cols: number) => {
    const span = int(from.gridColumnSpan, 1, 12) ?? 1;
    at.gridColumn = "auto";
    at.gridColumnSpan = Math.min(span, cols);
    at.gridRow = "auto";
    if (from.gridRowSpan !== undefined) at.gridRowSpan = from.gridRowSpan;
  };
  if (parent?.tablet && setsPlacement(node.style) && !setsPlacement(node.tablet)) reset(tablet, base, parent.tablet);
  if (parent?.mobile && (setsPlacement(node.style) || setsPlacement(node.tablet)) && !setsPlacement(node.mobile)) {
    reset(mobile, setsPlacement(node.tablet) ? (node.tablet as NodeStyle) : base, parent.mobile);
  }

  // A section lays its children out in its inner wrapper, so its layout goes
  // there — only once a layout is set, so every section made before the
  // layout engine renders exactly as it did.
  const inner = node.type === "section" && hasLayout(node) ? `${sel} > .b-in` : null;
  const emit = (style: NodeStyle, wrap: (body: string) => string) => {
    if (inner) {
      const box = declarations(style, node.type, "box");
      const lay = declarations(style, node.type, "layout");
      if (box) rules.push(wrap(`${sel}{${box}}`));
      if (lay) rules.push(wrap(`${inner}{${lay}}`));
    } else {
      const all = declarations(style, node.type);
      if (all) rules.push(wrap(`${sel}{${all}}`));
    }
  };
  emit(base, (r) => r);
  emit(tablet, (r) => `${Q(`(max-width:${TABLET_MAX}px)`)}{${r}}`);
  emit(mobile, (r) => `${Q(`(max-width:${MOBILE_MAX}px)`)}{${r}}`);

  // Hidden per device, in ranges that do not overlap, so hiding on one never
  // needs a rule to show it again on another.
  const hide = node.hide ?? {};
  if (hide.desktop) rules.push(`${Q(`(min-width:${TABLET_MAX + 1}px)`)}{${sel}{display:none!important}}`);
  if (hide.tablet) rules.push(`${Q(`(min-width:${MOBILE_MAX + 1}px) and (max-width:${TABLET_MAX}px)`)}{${sel}{display:none!important}}`);
  if (hide.mobile) rules.push(`${Q(`(max-width:${MOBILE_MAX}px)`)}{${sel}{display:none!important}}`);
  return { css: rules.join("\n"), grid };
}

/** Every element's rules for a set of trees, in one stylesheet. */
export function treeCss(...trees: (BuilderNode | null | undefined)[]): string {
  const out: string[] = [];
  const visit = (n: BuilderNode, parent?: GridContext) => {
    const { css, grid } = nodeRules(n, parent);
    if (css) out.push(css);
    for (const c of n.children ?? []) visit(c, grid);
  };
  for (const t of trees) if (t) visit(t);
  return out.join("\n");
}

const COLOR_OK = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * The site-wide look: colours as variables, the three fonts, and the type
 * scale at each breakpoint. Elements inherit all of it until they override.
 */
export function themeCss(settings: SiteSettings): string {
  const colors = settings.colors ?? {};
  const t = settings.typography ?? {};
  const layout = settings.layout ?? {};
  const vars: string[] = [];
  for (const [k, v] of Object.entries(colors)) {
    if (/^[a-z][a-z0-9-]{0,30}$/i.test(k) && typeof v === "string" && COLOR_OK.test(v)) vars.push(`--b-${k}:${v}`);
  }
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  vars.push(`--b-container:${num(layout.containerWidth, 1200)}px`);
  vars.push(`--b-radius:${num(layout.radius, 10)}px`);
  vars.push(`--b-btn-radius:${num(layout.buttonRadius, 10)}px`);
  vars.push(`--b-section:${num(layout.sectionSpacing, 64)}px`);
  vars.push(`--b-font-heading:${fontStack(t.heading?.family)}`);
  vars.push(`--b-font-body:${fontStack(t.body?.family)}`);
  vars.push(`--b-font-button:${fontStack(t.button?.family ?? t.body?.family)}`);

  const rules: string[] = [
    // A menu drawer is drawn outside the site, over the window: it carries the
    // same colours and fonts, without being a container of its own.
    `.bsite-layer{${vars.join(";")};font-family:var(--b-font-body);color:var(--b-text,#14161B)}`,
    `.bsite{${vars.join(";")};container-type:inline-size;container-name:bsite;font-family:var(--b-font-body);color:var(--b-text,#14161B);background:var(--b-background,#fff);font-weight:${num(t.body?.weight, 400)}}`,
    `.bsite h1,.bsite h2,.bsite h3,.bsite h4,.bsite h5,.bsite h6{font-family:var(--b-font-heading);font-weight:${num(t.heading?.weight, 700)};margin:0}`,
    `.bsite .b-btn{font-family:var(--b-font-button);font-weight:${num(t.button?.weight, 600)}}`,
  ];

  const scale = t.scale ?? {};
  const SELECTOR: Record<string, string> = {
    h1: ".bsite h1", h2: ".bsite h2", h3: ".bsite h3", h4: ".bsite h4", h5: ".bsite h5", h6: ".bsite h6",
    body: ".bsite .bsite-in", small: ".bsite small,.bsite .b-small", button: ".bsite .b-btn",
  };
  const tablet: string[] = [];
  const mobile: string[] = [];
  for (const [step, sel] of Object.entries(SELECTOR)) {
    const s = scale[step];
    if (!s) continue;
    const decl: string[] = [`font-size:${num(s.desktop, 16)}px`];
    if (s.lineHeight) decl.push(`line-height:${num(s.lineHeight, 1.4)}`);
    if (s.letterSpacing) decl.push(`letter-spacing:${num(s.letterSpacing, 0)}em`);
    if (s.transform && /^(none|uppercase|lowercase|capitalize)$/.test(s.transform)) decl.push(`text-transform:${s.transform}`);
    if (s.weight) decl.push(`font-weight:${num(s.weight, 400)}`);
    rules.push(`${sel}{${decl.join(";")}}`);
    if (s.tablet) tablet.push(`${sel}{font-size:${num(s.tablet, s.desktop)}px}`);
    if (s.mobile) mobile.push(`${sel}{font-size:${num(s.mobile, s.desktop)}px}`);
  }
  if (tablet.length) rules.push(`${Q(`(max-width:${TABLET_MAX}px)`)}{${tablet.join("")}}`);
  if (mobile.length) rules.push(`${Q(`(max-width:${MOBILE_MAX}px)`)}{${mobile.join("")}}`);
  return rules.join("\n");
}
