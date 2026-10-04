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
import { findNode, newId, withFreshIds } from "./tree";
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
export function addTemplate(doc: SiteDoc, type: TemplateType, name: string, from = "default"): { doc: SiteDoc; id: string } {
  const group = doc.templates?.[type] ?? {};
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "template";
  let id = base;
  let n = 2;
  while (group[id]) id = `${base}_${n++}`;
  const source = group[from]?.tree ?? null;
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
