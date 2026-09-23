/**
 * Putting the admin's values into a theme section, in the browser.
 *
 * The storefront does this on the server (backend services/theme_render.py);
 * the customizer does the same thing here so the preview changes while
 * somebody types, with no round trip. Both work the same way: a field carries
 * the position of its element inside the section ("2-0-1"), and the value goes
 * back into that element — the design's markup is never rewritten.
 */

export interface ThemeField {
  key: string;
  type: "text" | "link" | "image";
  path: string;
  label: string;
  hint?: string;
  default: string;
}

/** A row of identical cards in the design — its products or collections. */
export interface ThemeRepeater {
  key: string;
  path: string;
  kind: "products" | "collections" | "menu";
  label: string;
  count: number;
}

/** What one row of cards should show. */
export interface SlotSpec {
  source: "products" | "collections" | "menu" | "none";
  collection?: string;
  /** Which store menu a menu row shows; empty means the store's collections. */
  menu?: string;
  sort?: string;
  limit: number;
  ids?: string[];
}

/** One card's worth of real data, as the server sends it. */
export interface SlotItem {
  title: string;
  url: string;
  image: string;
  price: string;
  badge: string;
  text: string;
}

export interface ThemeSection {
  id: string;
  label: string;
  html: string;
  fields: ThemeField[];
  repeaters?: ThemeRepeater[];
  /** "product_block" — where the store's own buying controls go. */
  role?: string;
}

export interface ThemePageDefinition {
  label: string;
  kind: string;
  sections: ThemeSection[];
}

export interface ThemeDefinition {
  name?: string;
  css: string;
  stylesheets: string[];
  svg_defs?: string;
  pages: Record<string, ThemePageDefinition>;
}

export interface ThemePageState {
  order: string[];
  hidden: string[];
  values: Record<string, Record<string, string>>;
  /** Per section, per row of cards: what that row shows. */
  dynamic?: Record<string, Record<string, SlotSpec>>;
}

/** The brand's own logo, in the place the design keeps its logo. */
export interface ThemeLogo {
  url: string;
  width?: string;
  height?: string;
  padding?: { top?: string; right?: string; bottom?: string; left?: string };
}

export interface ThemeState {
  pages: Record<string, ThemePageState>;
  logo?: ThemeLogo;
}

function elementAt(root: Element, path: string): Element | null {
  let node: Element | null = root;
  for (const step of path.split("-")) {
    if (!node) return null;
    const index = Number(step);
    if (!Number.isInteger(index)) return null;
    node = node.children[index] ?? null;
  }
  return node;
}

function setText(el: Element, value: string) {
  // Keep any icon or image that sits inside the element; replace the words.
  const keep = Array.from(el.children).filter((c) => ["SVG", "IMG", "BR"].includes(c.tagName));
  el.innerHTML = "";
  keep.forEach((k) => el.appendChild(k));
  el.appendChild(el.ownerDocument.createTextNode(value));
}

function setImage(el: Element, url: string) {
  if (el.tagName === "IMG") {
    el.setAttribute("src", url);
    return;
  }
  el.classList.remove("placeholder");
  el.setAttribute("style", `${el.getAttribute("style") ?? ""};overflow:hidden;padding:0;border:0;background:none`);
  el.innerHTML = "";
  const img = el.ownerDocument.createElement("img");
  img.src = url;
  img.alt = "";
  img.loading = "lazy";
  img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block";
  el.appendChild(img);
}

/** One section's HTML with these values in it. */
export function applyValues(html: string, values: Record<string, string> | undefined): string {
  if (!values || Object.keys(values).length === 0) return html;
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html");
  const wrapper = doc.getElementById("__root");
  const root = wrapper?.firstElementChild;
  if (!root) return html;

  for (const [key, raw] of Object.entries(values)) {
    const value = (raw ?? "").toString();
    if (!value.trim()) continue;
    const [kind, path] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const target = elementAt(root, path);
    if (!target) continue;
    if (kind === "txt") setText(target, value);
    else if (kind === "href") target.setAttribute("href", value);
    else if (kind === "img") setImage(target, value);
  }
  return wrapper?.innerHTML ?? html;
}

function roleOf(card: Element, selectors: string[], tags: string[]): Element | null {
  for (const sel of selectors) {
    const found = card.querySelector(`.${sel}`);
    if (found) return found;
  }
  for (const tag of tags) {
    const found = card.querySelector(tag);
    if (found) return found;
  }
  return null;
}

/** One card of the design, carrying one real product or collection.
 *  Mirrors backend services/theme_render._fill_card. */
function fillCard(template: Element, item: SlotItem): Element {
  const card = template.cloneNode(true) as Element;

  const image = card.querySelector("img") ?? card.querySelector(".placeholder");
  if (image) {
    if (item.image) setImage(image, item.image);
    else if (image.tagName !== "IMG") image.innerHTML = "";
  }

  const title = roleOf(card, ["title", "product-title", "name"], ["h1", "h2", "h3", "h4", "h5", "h6"]);
  if (title && item.title) setText(title, item.title);

  const price = roleOf(card, ["price", "product-price"], []);
  if (price) { if (item.price) setText(price, item.price); else price.remove(); }

  const badge = roleOf(card, ["badge", "tag"], []);
  if (badge) { if (item.badge) setText(badge, item.badge); else badge.remove(); }

  card.querySelectorAll(".rating, .reviews").forEach((n) => n.remove());

  const text = roleOf(card, ["description", "excerpt"], ["p"]);
  if (text) { if (item.text) setText(text, item.text); else text.remove(); }

  if (item.url) {
    if (card.tagName === "A") card.setAttribute("href", item.url);
    else {
      const link = card.ownerDocument.createElement("a");
      link.setAttribute("href", item.url);
      link.setAttribute("class", card.getAttribute("class") ?? "");
      link.setAttribute("style", `${card.getAttribute("style") ?? ""};display:block;color:inherit;text-decoration:none`);
      link.innerHTML = card.innerHTML;
      return link;
    }
  }
  return card;
}

/** One link of a menu, in the design's own markup. */
function fillNavItem(template: Element, item: SlotItem): Element | null {
  const node = template.cloneNode(true) as Element;
  const anchor = node.tagName === "A" ? node : node.querySelector("a");
  if (!anchor) return null;
  setText(anchor, item.title);
  anchor.setAttribute("href", item.url || "#");
  return node;
}

/** Put the store's own cards into this section's rows of cards. */
export function fillRepeaters(
  html: string,
  repeaters: ThemeRepeater[] | undefined,
  itemsByKey: Record<string, SlotItem[] | undefined>,
): string {
  if (!repeaters?.length) return html;
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html");
  const wrapper = doc.getElementById("__root");
  const root = wrapper?.firstElementChild;
  if (!root) return html;

  let changed = false;
  for (const repeater of repeaters) {
    const items = itemsByKey[repeater.key];
    if (!items) continue;
    const container = elementAt(root, repeater.path);
    const template = container?.firstElementChild;
    if (!container || !template) continue;
    const pattern = template.cloneNode(true) as Element;
    const isMenu = repeater.kind === "menu";
    container.innerHTML = "";
    items.forEach((item) => {
      const node = isMenu ? fillNavItem(pattern, item) : fillCard(pattern, item);
      if (node) container.appendChild(node);
    });
    changed = true;
  }
  return changed ? (wrapper?.innerHTML ?? html) : html;
}

function px(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw || raw.toLowerCase() === "auto") return "";
  return /(px|%|r?em|vw|vh)$/.test(raw) ? raw : `${raw}px`;
}

/** Put the brand's logo where the design keeps its own — nothing moves. */
export function applyLogo(sections: { id: string; html: string; role?: string }[], logo?: ThemeLogo) {
  const url = (logo?.url ?? "").trim();
  if (!url) return sections;

  const width = px(logo?.width) || "auto";
  const height = px(logo?.height) || "auto";
  const pad = logo?.padding ?? {};
  const padding = ["top", "right", "bottom", "left"]
    .map((side) => px((pad as Record<string, string | undefined>)[side]) || "0")
    .join(" ");
  const style = [
    "display:block", "max-width:100%", "object-fit:contain",
    `width:${width}`, `height:${height}`,
    padding === "0 0 0 0" ? "" : `padding:${padding}`,
  ].filter(Boolean).join(";");

  let done = false;
  return sections.map((section) => {
    if (done) return section;
    const doc = new DOMParser().parseFromString(`<div id="__root">${section.html}</div>`, "text/html");
    const wrapper = doc.getElementById("__root");
    const holder = wrapper?.querySelector(".logo, .site-logo, .brand-logo, .logo-wrap")
      ?? wrapper?.querySelector("header a");
    if (!wrapper || !holder) return section;

    const img = doc.createElement("img");
    img.src = url;
    img.alt = "";
    img.setAttribute("style", style);
    if (holder.tagName === "IMG") holder.replaceWith(img);
    else {
      holder.innerHTML = "";
      holder.setAttribute("style", `${holder.getAttribute("style") ?? ""};display:inline-flex;align-items:center`);
      holder.appendChild(img);
    }
    done = true;
    return { ...section, html: wrapper.innerHTML };
  });
}

/** The sections a page shows, in its order, with values applied. */
export function renderPage(
  def: ThemeDefinition,
  state: ThemeState,
  pageKey: string,
  items?: Record<string, SlotItem[] | undefined>,
) {
  const page = def.pages[pageKey];
  if (!page) return null;
  const byId = new Map(page.sections.map((s) => [s.id, s]));
  const pageState = state.pages?.[pageKey] ?? { order: [], hidden: [], values: {} };
  const order = [
    ...(pageState.order ?? []).filter((id) => byId.has(id)),
    ...page.sections.map((s) => s.id).filter((id) => !(pageState.order ?? []).includes(id)),
  ];
  const hidden = new Set(pageState.hidden ?? []);
  const sections = order
    .filter((id) => !hidden.has(id))
    .map((id) => {
      const section = byId.get(id)!;
      let html = applyValues(section.html, pageState.values?.[id]);
      if (items) {
        const mine: Record<string, SlotItem[] | undefined> = {};
        for (const [key, rows] of Object.entries(items)) {
          if (key.startsWith(`${id}|`)) mine[key.slice(id.length + 1)] = rows;
        }
        html = fillRepeaters(html, section.repeaters, mine);
      }
      return { id, html, role: section.role ?? "" };
    });

  return {
    key: pageKey,
    css: def.css,
    stylesheets: def.stylesheets ?? [],
    svg_defs: def.svg_defs ?? "",
    sections: applyLogo(sections, state.logo),
  };
}
