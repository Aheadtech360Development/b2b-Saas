/**
 * Product and collection templates: several of each, and which record uses which.
 *
 * The rule the storefront follows (resolve.py) is the one tested here from the
 * editor's side: a product or collection is drawn with the template chosen
 * for it, else its kind's default.
 */
import { describe, expect, it } from "vitest";
import starter from "./fixtures/starter-doc.json";
import {
  addTemplate, assignCollections, assignProducts, collectionsUsing, productsUsing, removeTemplate, renameTemplate,
  templateFor, templateTypeOf,
} from "@/lib/builder/doc";
import { BY_TYPE, PRESETS, REGISTRY, fitsTemplate } from "@/lib/builder/registry";
import { canContain, walk } from "@/lib/builder/tree";
import type { BuilderNode, SiteDoc } from "@/lib/builder/types";

const doc = starter as unknown as SiteDoc;
const ids = (tree: BuilderNode | null | undefined) => { const out: string[] = []; walk(tree ?? null, (n) => { out.push(n.id); }); return out; };

describe("making templates", () => {
  it("starts a new template as a copy of the default, with ids of its own", () => {
    const { doc: next, id } = addTemplate(doc, "product", "Apparel");
    const made = next.templates.product![id]!;
    const source = doc.templates.product!.default!;
    expect(id).toBe("apparel");
    expect(made.name).toBe("Apparel");
    expect(ids(made.tree).length).toBe(ids(source.tree).length);
    expect(ids(made.tree).some((x) => ids(source.tree).includes(x))).toBe(false);
    // The one it was copied from is untouched.
    expect(next.templates.product!.default).toBe(source);
  });

  it("copies whichever template it is told to", () => {
    const { doc: next, id } = addTemplate(doc, "product", "Slim", "minimal");
    expect(ids(next.templates.product![id]!.tree).length).toBe(ids(doc.templates.product!.minimal!.tree).length);
  });

  it("starts empty when asked to", () => {
    const { doc: next, id } = addTemplate(doc, "collection", "DTF collections", null);
    const tree = next.templates.collection![id]!.tree!;
    expect(tree.type).toBe("stack");
    expect(tree.children).toEqual([]);
  });

  it("never reuses an id, so two templates with one name are two templates", () => {
    const a = addTemplate(doc, "product", "Apparel");
    const b = addTemplate(a.doc, "product", "Apparel");
    expect(b.id).not.toBe(a.id);
    expect(Object.keys(b.doc.templates.product!)).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it("renames a template without changing what points at it", () => {
    const a = addTemplate(doc, "product", "Apparel");
    const assigned = assignProducts(a.doc, a.id, ["p1"]);
    const renamed = renameTemplate(assigned, "product", a.id, "  Apparel & blanks ");
    expect(renamed.templates.product![a.id]!.name).toBe("Apparel & blanks");
    expect(productsUsing(renamed, a.id)).toEqual(["p1"]);
    // An empty name, or a template that is not there, changes nothing.
    expect(renameTemplate(assigned, "product", a.id, "   ")).toBe(assigned);
    expect(renameTemplate(assigned, "product", "nope", "X")).toBe(assigned);
  });
});

describe("which template a product or collection uses", () => {
  const two = (() => {
    const a = addTemplate(doc, "product", "Apparel");
    const b = addTemplate(a.doc, "product", "DTF transfers");
    return { doc: b.doc, apparel: a.id, dtf: b.id };
  })();

  it("is its own when one was chosen, and the default otherwise", () => {
    const d = assignProducts(assignProducts(two.doc, two.apparel, ["tee"]), two.dtf, ["transfer"]);
    expect(templateFor(d, "product", "tee")).toBe(two.apparel);
    expect(templateFor(d, "product", "transfer")).toBe(two.dtf);
    expect(templateFor(d, "product", "anything-else")).toBe("default");
  });

  it("follows the default when the default is changed", () => {
    const d = { ...two.doc, assignments: { ...two.doc.assignments, product: { ...two.doc.assignments.product, default: two.dtf } } };
    expect(templateFor(d, "product", "unassigned")).toBe(two.dtf);
  });

  it("gives a product one template: choosing it for another moves it", () => {
    const first = assignProducts(two.doc, two.apparel, ["tee", "hoodie"]);
    const moved = assignProducts(first, two.dtf, ["tee"]);
    expect(productsUsing(moved, two.apparel)).toEqual(["hoodie"]);
    expect(productsUsing(moved, two.dtf)).toEqual(["tee"]);
  });

  it("does the same for collections", () => {
    const a = addTemplate(doc, "collection", "Apparel collections");
    const b = addTemplate(a.doc, "collection", "DTF collections", null);
    let d = assignCollections(b.doc, a.id, ["c-tees", "c-hoodies"]);
    d = assignCollections(d, b.id, ["c-dtf", "c-tees"]);
    expect(collectionsUsing(d, a.id)).toEqual(["c-hoodies"]);
    expect(collectionsUsing(d, b.id).sort()).toEqual(["c-dtf", "c-tees"]);
    expect(templateFor(d, "collection", "c-tees")).toBe(b.id);
    expect(templateFor(d, "collection", "c-other")).toBe("default");
    // Unticking one sends it back to the default.
    d = assignCollections(d, b.id, ["c-dtf"]);
    expect(templateFor(d, "collection", "c-tees")).toBe("default");
  });

  it("sends everything back to the default when a template is deleted", () => {
    const a = addTemplate(doc, "collection", "Apparel collections");
    const assigned = assignCollections(a.doc, a.id, ["c-tees"]);
    const gone = removeTemplate(assigned, "collection", a.id);
    expect(gone.templates.collection![a.id]).toBeUndefined();
    expect(collectionsUsing(gone, a.id)).toEqual([]);
    expect(templateFor(gone, "collection", "c-tees")).toBe("default");
  });

  it("never points at a template that is not there", () => {
    const stale: SiteDoc = { ...doc, assignments: { ...doc.assignments, product: { default: "ghost", byId: { tee: "also-gone" } } } };
    expect(templateFor(stale, "product", "tee")).toBe("default");
  });
});

describe("what the editor offers on each kind of page", () => {
  it("knows what kind of page is open", () => {
    expect(templateTypeOf({ kind: "template", type: "product", id: "default" })).toBe("product");
    expect(templateTypeOf({ kind: "page", slug: "about" })).toBe("page");
    expect(templateTypeOf({ kind: "part", key: "header" })).toBeNull();
    expect(templateTypeOf({ kind: "global", id: "g1" })).toBeNull();
  });

  it("offers a product's own elements on product templates only", () => {
    const offered = (here: Parameters<typeof fitsTemplate>[1]) => REGISTRY.filter((c) => fitsTemplate(c.context, here)).map((c) => c.type);
    for (const type of ["product_title", "product_price", "product_gallery", "product_buy", "product_description", "product_rating", "product_reviews"]) {
      expect(offered("product")).toContain(type);
      expect(offered("collection")).not.toContain(type);
      expect(offered("home")).not.toContain(type);
      expect(offered(null)).not.toContain(type);
    }
    for (const type of ["collection_title", "collection_description", "collection_image", "collection_products"]) {
      expect(offered("collection")).toContain(type);
      expect(offered("product")).not.toContain(type);
    }
    // Ordinary elements go anywhere.
    for (const here of ["product", "collection", "home", null] as const) {
      expect(offered(here)).toEqual(expect.arrayContaining(["heading", "text", "image", "html", "faq", "stack"]));
    }
  });

  it("builds every ready-made piece out of elements that exist", () => {
    for (const preset of PRESETS) {
      walk(preset.create(), (n) => { expect(BY_TYPE[n.type], `${preset.key}: ${n.type}`).toBeDefined(); });
    }
  });

  it("makes blocks that fit beside a product's title — inside a column, a stack or a section", () => {
    const blocks = PRESETS.filter((p) => p.kind === "block");
    expect(blocks.map((b) => b.key)).toEqual(expect.arrayContaining(["info_box", "notice", "checklist", "steps"]));
    for (const b of blocks) {
      const root = b.create();
      expect(root.type, b.key).not.toBe("section");
      for (const holder of ["column", "stack", "section"]) expect(canContain(holder, root.type), `${b.key} in ${holder}`).toBe(true);
      expect(root.name, b.key).toBeTruthy();
    }
  });

  it("keeps a product's ready-made sections for product templates", () => {
    const product = PRESETS.filter((p) => p.context?.includes("product"));
    expect(product.length).toBeGreaterThan(0);
    for (const p of product) {
      expect(fitsTemplate(p.context, "product")).toBe(true);
      expect(fitsTemplate(p.context, "collection")).toBe(false);
      expect(fitsTemplate(p.context, "home")).toBe(false);
    }
    // And what is inside them belongs there too.
    for (const p of PRESETS) {
      walk(p.create(), (n) => {
        const ctx = BY_TYPE[n.type]?.context;
        if (ctx?.length) expect(p.context, `${p.key} holds ${n.type}`).toEqual(expect.arrayContaining(ctx.filter((c) => p.context?.includes(c))));
        if (ctx?.length) expect(ctx.some((c) => p.context?.includes(c)), `${p.key} holds ${n.type}`).toBe(true);
      });
    }
  });

  it("gives every fresh piece ids of its own", () => {
    for (const preset of PRESETS) {
      const a = ids(preset.create());
      const b = ids(preset.create());
      expect(new Set(a).size, preset.key).toBe(a.length);
      expect(a.some((x) => b.includes(x)), preset.key).toBe(false);
    }
  });
});
