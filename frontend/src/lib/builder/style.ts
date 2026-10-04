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
]);

const UNSAFE = /[;{}<>\\]|expression\s*\(|javascript:|@import|url\(\s*['"]?\s*(?!https:)/i;
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;

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
  return v;
}

/** One breakpoint's declarations. `columns` becomes the grid it describes. */
export function declarations(style: NodeStyle | undefined, type: string): string {
  if (!style) return "";
  const out: string[] = [];
  for (const [key, raw] of Object.entries(style)) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (key === "columns") {
      const n = Math.max(1, Math.min(6, Math.round(Number(raw)) || 1));
      if (type === "row" || type.endsWith("_grid") || type === "collection_products" || type === "testimonials" || type === "gallery") {
        out.push(`grid-template-columns:repeat(${n},minmax(0,1fr))`);
      }
      continue;
    }
    const v = value(key, raw as string | number);
    if (v !== null) out.push(`${kebab(key)}:${v}`);
  }
  return out.join(";");
}

function scope(id: string): string {
  return `.bsite [data-b="${id}"]`;
}

/** The rules for one element, at every breakpoint, including whether it shows. */
export function nodeCss(node: BuilderNode): string {
  if (!ID_OK.test(node.id)) return "";
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

  const d = declarations(base, node.type);
  if (d) rules.push(`${sel}{${d}}`);
  const t = declarations(tablet, node.type);
  if (t) rules.push(`${Q(`(max-width:${TABLET_MAX}px)`)}{${sel}{${t}}}`);
  const m = declarations(mobile, node.type);
  if (m) rules.push(`${Q(`(max-width:${MOBILE_MAX}px)`)}{${sel}{${m}}}`);

  // Hidden per device, in ranges that do not overlap, so hiding on one never
  // needs a rule to show it again on another.
  const hide = node.hide ?? {};
  if (hide.desktop) rules.push(`${Q(`(min-width:${TABLET_MAX + 1}px)`)}{${sel}{display:none!important}}`);
  if (hide.tablet) rules.push(`${Q(`(min-width:${MOBILE_MAX + 1}px) and (max-width:${TABLET_MAX}px)`)}{${sel}{display:none!important}}`);
  if (hide.mobile) rules.push(`${Q(`(max-width:${MOBILE_MAX}px)`)}{${sel}{display:none!important}}`);
  return rules.join("\n");
}

/** Every element's rules for a set of trees, in one stylesheet. */
export function treeCss(...trees: (BuilderNode | null | undefined)[]): string {
  const out: string[] = [];
  const visit = (n: BuilderNode) => {
    const css = nodeCss(n);
    if (css) out.push(css);
    for (const c of n.children ?? []) visit(c);
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
