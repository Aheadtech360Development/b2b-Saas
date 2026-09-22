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

export interface ThemeSection {
  id: string;
  label: string;
  html: string;
  fields: ThemeField[];
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
}

export interface ThemeState {
  pages: Record<string, ThemePageState>;
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

/** The sections a page shows, in its order, with values applied. */
export function renderPage(def: ThemeDefinition, state: ThemeState, pageKey: string) {
  const page = def.pages[pageKey];
  if (!page) return null;
  const byId = new Map(page.sections.map((s) => [s.id, s]));
  const pageState = state.pages?.[pageKey] ?? { order: [], hidden: [], values: {} };
  const order = [
    ...(pageState.order ?? []).filter((id) => byId.has(id)),
    ...page.sections.map((s) => s.id).filter((id) => !(pageState.order ?? []).includes(id)),
  ];
  const hidden = new Set(pageState.hidden ?? []);
  return {
    key: pageKey,
    css: def.css,
    stylesheets: def.stylesheets ?? [],
    svg_defs: def.svg_defs ?? "",
    sections: order
      .filter((id) => !hidden.has(id))
      .map((id) => ({ id, html: applyValues(byId.get(id)!.html, pageState.values?.[id]) })),
  };
}
