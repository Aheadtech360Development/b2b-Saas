/**
 * Working on a whole site document: which tree an element lives in, opening
 * and adding pages and templates, shared and saved sections, and the fonts a
 * choice needs. Pure, like tree.ts — every change is a new document, which
 * is what undo keeps.
 *
 * A site is several trees: the header, footer and announcement bar; one per
 * template; one per page; one per shared ("global") section; one per saved
 * section. The editor shows one of them in the canvas — the target — with the
 * header and footer around it, and any of them can be edited from there.
 */
import type { BuilderNode, PartKey, SiteDoc, TemplateType } from "./types";
import { findNode, newId, updateNode, walk, withFreshIds } from "./tree";
import { menuColumn, simpleFooter } from "./registry";
import { GOOGLE_FONTS } from "./fonts";

export type Target =
  | { kind: "template"; type: TemplateType; id: string }
  | { kind: "page"; slug: string }
  | { kind: "part"; key: PartKey }
  | { kind: "global"; id: string }
  | { kind: "saved"; id: string };

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  home: "Home page", page: "Pages", product: "Product pages", collection: "Collection pages",
  search: "Search results", cart: "Cart", not_found: "Page not found",
};

export const PART_LABELS: Record<PartKey, string> = {
  announcement: "Announcement bar", header: "Header", footer: "Footer",
};

/** Mirrors the server's reserved list: paths the shop already uses. */
export const RESERVED_SLUGS = new Set([
  "products", "product", "collections", "collection", "cart", "checkout", "account",
  "login", "logout", "signup", "create-account", "admin", "api", "platform", "search",
  "gang-sheets", "wholesale", "quick-order", "orders", "track-order", "blog", "reviews",
  "register", "forgot-password", "reset-password", "activate-account", "site-builder",
  "theme-editor", "theme-preview", "ui-preview", "sitemap.xml", "robots.txt",
]);

/**
 * The kind of page a target is drawn as, for deciding which elements fit it.
 * The header, footer and shared or saved sections are on every kind of page,
 * so nothing that belongs to one kind fits them.
 */
export function templateTypeOf(t: Target): TemplateType | null {
  if (t.kind === "template") return t.type;
  if (t.kind === "page") return "page";
  return null;
}

export function sameTarget(a: Target | null | undefined, b: Target | null | undefined): boolean {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

export function treeAt(doc: SiteDoc, t: Target): BuilderNode | null {
  switch (t.kind) {
    case "template": return doc.templates?.[t.type]?.[t.id]?.tree ?? null;
    case "page": return doc.pages?.[t.slug]?.tree ?? null;
    case "part": return doc.parts?.[t.key] ?? null;
    case "global": return doc.globals?.[t.id]?.tree ?? null;
    case "saved": return doc.saved?.[t.id]?.tree ?? null;
  }
}

export function exists(doc: SiteDoc, t: Target): boolean {
  switch (t.kind) {
    case "template": return !!doc.templates?.[t.type]?.[t.id];
    case "page": return !!doc.pages?.[t.slug];
    case "part": return true;
    case "global": return !!doc.globals?.[t.id];
    case "saved": return !!doc.saved?.[t.id];
  }
}

/** The same document with one tree replaced. */
export function setTreeAt(doc: SiteDoc, t: Target, tree: BuilderNode | null): SiteDoc {
  switch (t.kind) {
    case "template": {
      const group = { ...(doc.templates?.[t.type] ?? {}) };
      const current = group[t.id] ?? { name: "Template", tree: null };
      group[t.id] = { ...current, tree };
      return { ...doc, templates: { ...doc.templates, [t.type]: group } };
    }
    case "page": {
      const page = doc.pages?.[t.slug];
      if (!page) return doc;
      return { ...doc, pages: { ...doc.pages, [t.slug]: { ...page, tree } } };
    }
    case "part":
      return { ...doc, parts: { ...doc.parts, [t.key]: tree } };
    case "global": {
      const g = doc.globals?.[t.id];
      if (!g) return doc;
      return { ...doc, globals: { ...doc.globals, [t.id]: { ...g, tree } } };
    }
    case "saved": {
      const s = doc.saved?.[t.id];
      if (!s) return doc;
      return { ...doc, saved: { ...doc.saved, [t.id]: { ...s, tree } } };
    }
  }
}

/** Every tree in the document, with where it is. */
export function allTargets(doc: SiteDoc): Target[] {
  const out: Target[] = [];
  for (const key of ["announcement", "header", "footer"] as PartKey[]) out.push({ kind: "part", key });
  for (const [type, group] of Object.entries(doc.templates ?? {})) {
    for (const id of Object.keys(group ?? {})) out.push({ kind: "template", type: type as TemplateType, id });
  }
  for (const slug of Object.keys(doc.pages ?? {})) out.push({ kind: "page", slug });
  for (const id of Object.keys(doc.globals ?? {})) out.push({ kind: "global", id });
  for (const id of Object.keys(doc.saved ?? {})) out.push({ kind: "saved", id });
  return out;
}

/** Which tree holds an element. */
export function locate(doc: SiteDoc, id: string): Target | null {
  for (const t of allTargets(doc)) if (findNode(treeAt(doc, t), id)) return t;
  return null;
}

export function targetLabel(doc: SiteDoc, t: Target): string {
  switch (t.kind) {
    case "template": {
      const name = doc.templates?.[t.type]?.[t.id]?.name ?? t.id;
      return t.type === "home" || t.type === "search" || t.type === "cart" || t.type === "not_found"
        ? TEMPLATE_LABELS[t.type] : `${TEMPLATE_LABELS[t.type]} · ${name}`;
    }
    case "page": return `${doc.pages?.[t.slug]?.title || t.slug} (/${t.slug})`;
    case "part": return PART_LABELS[t.key];
    case "global": return `Shared · ${doc.globals?.[t.id]?.name ?? "section"}`;
    case "saved": return `Saved · ${doc.saved?.[t.id]?.name ?? "section"}`;
  }
}

/** What the preview should render for a target. */
export function previewFor(doc: SiteDoc, t: Target, sample: { product?: string; collection?: string }): {
  route: string; slug?: string; template?: string;
} {
  if (t.kind === "template") {
    if (t.type === "product") return { route: "product", slug: sample.product, template: t.id };
    if (t.type === "collection") return { route: "collection", slug: sample.collection, template: t.id };
    if (t.type === "page") {
      const slug = Object.keys(doc.pages ?? {})[0];
      return { route: "page", slug, template: t.id };
    }
    return { route: t.type, template: t.id };
  }
  if (t.kind === "page") return { route: "page", slug: t.slug };
  return { route: "home" };
}

/** A URL path for a title, not already taken by a page or the shop. */
export function slugify(title: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";
  let slug = RESERVED_SLUGS.has(base) ? `${base}-page` : base;
  let n = 2;
  while (used.has(slug) || RESERVED_SLUGS.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

export function addPage(doc: SiteDoc, title: string): { doc: SiteDoc; slug: string } {
  const slug = slugify(title, Object.keys(doc.pages ?? {}));
  const tree: BuilderNode = { id: newId(), type: "stack", children: [] };
  return {
    slug,
    doc: {
      ...doc,
      pages: { ...doc.pages, [slug]: { title: title.trim() || "New page", template: doc.assignments?.page?.default || "default",
                                       seo: { title: "", description: "", image: "" }, tree } },
    },
  };
}

/** Move a page to a new address. Refuses a taken or reserved one. */
export function renameSlug(doc: SiteDoc, from: string, to: string): SiteDoc | null {
  const clean = to.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(clean) || RESERVED_SLUGS.has(clean)) return null;
  if (clean === from) return doc;
  if (doc.pages?.[clean] || !doc.pages?.[from]) return null;
  const pages: SiteDoc["pages"] = {};
  for (const [slug, page] of Object.entries(doc.pages)) pages[slug === from ? clean : slug] = page;
  return { ...doc, pages };
}

export function removePage(doc: SiteDoc, slug: string): SiteDoc {
  const pages = { ...doc.pages };
  delete pages[slug];
  return { ...doc, pages };
}

/** A new template of a type, copied from one that exists (fresh ids, so nothing collides). */
/**
 * A new template of a kind. It starts as a copy of another of that kind —
 * the default unless told otherwise — or, with from = null, empty.
 */
export function addTemplate(doc: SiteDoc, type: TemplateType, name: string, from: string | null = "default"): { doc: SiteDoc; id: string } {
  const group = doc.templates?.[type] ?? {};
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "template";
  let id = base;
  let n = 2;
  while (group[id]) id = `${base}_${n++}`;
  const source = from === null ? null : group[from]?.tree ?? null;
  const tree = source ? withFreshIds(source) : { id: newId(), type: "stack", children: [] };
  return { id, doc: { ...doc, templates: { ...doc.templates, [type]: { ...group, [id]: { name: name.trim() || "Template", tree } } } } };
}

/**
 * Remove a template. The default one stays — every page of its kind falls back
 * to it — and anything assigned to the one going is moved to the default.
 */
export function removeTemplate(doc: SiteDoc, type: TemplateType, id: string): SiteDoc {
  if (id === "default") return doc;
  const group = { ...(doc.templates?.[type] ?? {}) };
  delete group[id];
  const next: SiteDoc = { ...doc, templates: { ...doc.templates, [type]: group } };
  if (type === "page") {
    const pages: SiteDoc["pages"] = {};
    for (const [slug, page] of Object.entries(doc.pages ?? {})) {
      pages[slug] = page.template === id ? { ...page, template: "default" } : page;
    }
    next.pages = pages;
  }
  const a = { ...(doc.assignments ?? {}) } as SiteDoc["assignments"];
  for (const kind of ["product", "collection", "page"] as const) {
    const rule = a[kind];
    if (!rule) continue;
    const copy = { ...rule } as { default?: string; byId?: Record<string, string> };
    if (copy.default === id) copy.default = "default";
    if (copy.byId) copy.byId = Object.fromEntries(Object.entries(copy.byId).filter(([, v]) => v !== id));
    (a as Record<string, unknown>)[kind] = copy;
  }
  next.assignments = a;
  return next;
}

/** The products set to use one product template. */
/** A template's new name. Its id — what products and collections point at — stays. */
export function renameTemplate(doc: SiteDoc, type: TemplateType, id: string, name: string): SiteDoc {
  const group = doc.templates?.[type] ?? {};
  const tpl = group[id];
  const clean = name.trim().slice(0, 80);
  if (!tpl || !clean || clean === tpl.name) return doc;
  return { ...doc, templates: { ...doc.templates, [type]: { ...group, [id]: { ...tpl, name: clean } } } };
}

export function productsUsing(doc: SiteDoc, templateId: string): string[] {
  return Object.entries(doc.assignments?.product?.byId ?? {}).filter(([, t]) => t === templateId).map(([pid]) => pid);
}

/**
 * Set exactly which products use a product template. A product has one
 * template, so choosing it here moves it off any other; a product taken off
 * goes back to the default.
 */
export function assignProducts(doc: SiteDoc, templateId: string, productIds: string[]): SiteDoc {
  const byId = { ...(doc.assignments?.product?.byId ?? {}) };
  for (const [pid, t] of Object.entries(byId)) if (t === templateId && !productIds.includes(pid)) delete byId[pid];
  for (const pid of productIds) byId[pid] = templateId;
  return { ...doc, assignments: { ...doc.assignments, product: { ...(doc.assignments?.product ?? {}), byId } } };
}

export function collectionsUsing(doc: SiteDoc, templateId: string): string[] {
  return Object.entries(doc.assignments?.collection?.byId ?? {}).filter(([, t]) => t === templateId).map(([cid]) => cid);
}

/** Set exactly which collections use a collection template — as assignProducts does for products. */
export function assignCollections(doc: SiteDoc, templateId: string, collectionIds: string[]): SiteDoc {
  const byId = { ...(doc.assignments?.collection?.byId ?? {}) };
  for (const [cid, t] of Object.entries(byId)) if (t === templateId && !collectionIds.includes(cid)) delete byId[cid];
  for (const cid of collectionIds) byId[cid] = templateId;
  return { ...doc, assignments: { ...doc.assignments, collection: { ...(doc.assignments?.collection ?? {}), byId } } };
}

/** Which template a product or collection is drawn with: its own, else the kind's default. */
export function templateFor(doc: SiteDoc, kind: "product" | "collection", recordId: string): string {
  const rule = doc.assignments?.[kind];
  const own = rule?.byId?.[recordId];
  const group = doc.templates?.[kind] ?? {};
  if (own && group[own]) return own;
  const dflt = rule?.default;
  return dflt && group[dflt] ? dflt : "default";
}

/** The menus a footer shows, with the title each goes under — what a new footer should keep. */
function footerMenus(footer: BuilderNode | null): { title: string; menuId: string }[] {
  const out: { title: string; menuId: string }[] = [];
  walk(footer, (n) => {
    for (const [i, c] of (n.children ?? []).entries()) {
      if (c.type !== "menu") continue;
      const props = (c.props ?? {}) as Record<string, unknown>;
      // An older footer put a heading above the menu rather than a title on it.
      const before = n.children![i - 1];
      const heading = before?.type === "heading" ? String((before.props as Record<string, unknown> | undefined)?.text ?? "") : "";
      out.push({ title: String(props.title ?? "").trim() || heading.trim() || "Links", menuId: String(props.menuId ?? "") });
    }
  });
  return out;
}

/**
 * Add a menu column to the footer, beside the ones it has, and say which
 * element it is so it can be selected. Works for the simple footer (columns
 * are the children of one grid) and for an older one built from a row of
 * columns (a new column joins the row).
 */
export function addFooterColumn(doc: SiteDoc, title = "New column"): { doc: SiteDoc; id: string } | null {
  const footer = doc.parts?.footer ?? null;
  if (!footer) return null;
  const column = menuColumn(title);
  let host: BuilderNode | null = null;      // what holds the footer's menu columns
  let row: BuilderNode | null = null;       // an older footer: the row whose columns hold them
  walk(footer, (n) => {
    if (host || row) return;
    const kids = n.children ?? [];
    if (n.type === "row" && kids.some((col) => (col.children ?? []).some((c) => c.type === "menu"))) row = n;
    else if (n.type !== "row" && n.type !== "column" && kids.some((c) => c.type === "menu")) host = n;
  });
  let next: BuilderNode;
  if (row) {
    const r = row as BuilderNode;
    const count = (r.children ?? []).length + 1;
    next = updateNode(footer, r.id, (x) => ({
      ...x,
      style: { ...(x.style ?? {}), ...(x.style?.columns !== undefined ? { columns: Math.min(6, count) } : {}) },
      children: [...(x.children ?? []), { id: newId(), type: "column", props: {}, children: [column] }],
    }));
  } else {
    const target = (host as BuilderNode | null) ?? footer;
    next = updateNode(footer, target.id, (x) => ({ ...x, children: [...(x.children ?? []), column] }));
  }
  return { id: column.id, doc: { ...doc, parts: { ...doc.parts, footer: next } } };
}

/**
 * Replace the footer with the simple one — a brand column and a column for
 * each menu — keeping the menus the old footer showed, under their titles.
 */
export function withSimpleFooter(doc: SiteDoc, storeName = ""): SiteDoc {
  const kept = footerMenus(doc.parts?.footer ?? null);
  // A shop with one menu so far starts its footer with that one.
  let fallback = "";
  walk(doc.parts?.header ?? null, (n) => {
    if (!fallback && n.type === "menu") fallback = String((n.props as Record<string, unknown> | undefined)?.menuId ?? "");
  });
  const columns = kept.length ? kept : [{ title: "Shop", menuId: fallback }];
  return { ...doc, parts: { ...doc.parts, footer: simpleFooter(columns, storeName) } };
}

/** Keep a copy of a section to drop in again later. A copy: changing one never changes another. */
export function saveSection(doc: SiteDoc, node: BuilderNode, name: string): { doc: SiteDoc; id: string } {
  const id = `s${newId().slice(1, 8)}`;
  return { id, doc: { ...doc, saved: { ...doc.saved, [id]: { name: name.trim() || "Saved section", tree: withFreshIds(node) } } } };
}

/**
 * Turn a section into a shared one: it moves into the shared list, and where
 * it was a reference to it takes its place. Edit it once, it changes on every
 * page that uses it.
 */
export function makeShared(doc: SiteDoc, where: Target, nodeId: string, name: string): { doc: SiteDoc; id: string; refId: string } | null {
  const tree = treeAt(doc, where);
  const node = findNode(tree, nodeId);
  if (!tree || !node || node.id === tree.id || where.kind === "global" || node.type === "global_ref") return null;
  const id = `g${newId().slice(1, 8)}`;
  const ref: BuilderNode = { id: newId(), type: "global_ref", props: { ref: id } };
  const swap = (n: BuilderNode): BuilderNode =>
    n.id === nodeId ? ref : n.children ? { ...n, children: n.children.map(swap) } : n;
  let next = setTreeAt(doc, where, swap(tree));
  next = { ...next, globals: { ...next.globals, [id]: { name: name.trim() || "Shared section", tree: node } } };
  return { doc: next, id, refId: ref.id };
}

/** A shared section copied back in as an ordinary section — "detach". */
export function detachShared(doc: SiteDoc, where: Target, refId: string): SiteDoc | null {
  const tree = treeAt(doc, where);
  const ref = findNode(tree, refId);
  const gid = String((ref?.props as Record<string, unknown> | undefined)?.ref ?? "");
  const source = doc.globals?.[gid]?.tree;
  if (!tree || !ref || !source) return null;
  const copy = withFreshIds(source);
  const swap = (n: BuilderNode): BuilderNode =>
    n.id === refId ? copy : n.children ? { ...n, children: n.children.map(swap) } : n;
  return setTreeAt(doc, where, swap(tree));
}

/** Where a shared section is used. */
export function sharedUses(doc: SiteDoc, gid: string): Target[] {
  const out: Target[] = [];
  for (const t of allTargets(doc)) {
    let used = false;
    const visit = (n: BuilderNode | null | undefined) => {
      if (!n || used) return;
      if (n.type === "global_ref" && (n.props as Record<string, unknown> | undefined)?.ref === gid) used = true;
      n.children?.forEach(visit);
    };
    visit(treeAt(doc, t));
    if (used) out.push(t);
  }
  return out;
}

/**
 * The document with a font family the site can use. A Google family is added
 * to the site's font list at the weights it has (so the storefront loads it);
 * a system font needs nothing; an uploaded one is added by its upload.
 */
export function ensureFont(doc: SiteDoc, family: string, weight?: number): SiteDoc {
  const google = GOOGLE_FONTS.find((f) => f.family === family);
  if (!google) return doc;
  const fonts = [...(doc.settings?.fonts ?? [])];
  const at = fonts.findIndex((f) => f.family === family);
  const want = weight && google.weights.includes(weight) ? weight : undefined;
  if (at >= 0) {
    const f = fonts[at]!;
    if (!want || (f.weights ?? []).includes(want)) return doc;
    fonts[at] = { ...f, weights: [...(f.weights ?? []), want].sort((a, b) => a - b) };
  } else {
    const weights = google.weights.filter((w) => [400, 500, 600, 700].includes(w));
    if (want && !weights.includes(want)) weights.push(want);
    fonts.push({ family, source: "google", weights: (weights.length ? weights : [google.weights[0]!]).sort((a, b) => a - b), styles: ["normal"] });
  }
  return { ...doc, settings: { ...doc.settings, fonts } };
}

/** Families the site uses anywhere — in its typography or on any element. */
export function usedFamilies(doc: SiteDoc): Set<string> {
  const used = new Set<string>();
  const t = doc.settings?.typography ?? {};
  for (const role of [t.heading, t.body, t.button]) if (role?.family) used.add(role.family);
  for (const target of allTargets(doc)) {
    const visit = (n: BuilderNode | null | undefined) => {
      if (!n) return;
      for (const s of [n.style, n.tablet, n.mobile]) {
        const f = s?.fontFamily;
        if (typeof f === "string" && f) used.add(f.split(",")[0]!.trim().replace(/^['"]|['"]$/g, ""));
      }
      n.children?.forEach(visit);
    };
    visit(treeAt(doc, target));
  }
  return used;
}

/** The element a server issue points at, from its path ("templates.home.default.tree.children[0]…"). */
export function nodeForIssue(doc: SiteDoc, path: string): { target: Target; id: string } | null {
  for (const t of allTargets(doc)) {
    const base = t.kind === "part" ? `parts.${t.key}`
      : t.kind === "template" ? `templates.${t.type}.${t.id}.tree`
      : t.kind === "page" ? `pages.${t.slug}.tree`
      : t.kind === "global" ? `globals.${t.id}.tree` : `saved.${t.id}.tree`;
    if (path !== base && !path.startsWith(`${base}.`)) continue;
    let node: BuilderNode | null = treeAt(doc, t);
    if (!node) return null;
    const rest = path.slice(base.length);
    for (const m of rest.matchAll(/\.children\[(\d+)\]/g)) {
      const next: BuilderNode | undefined = node?.children?.[Number(m[1])];
      if (!next) break;
      node = next;
    }
    return node ? { target: t, id: node.id } : null;
  }
  return null;
}
