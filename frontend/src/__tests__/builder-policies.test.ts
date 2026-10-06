/**
 * The shop's policies.
 *
 * Five named policies, each written in a box of formatted text. Underneath, a
 * policy is an ordinary page at a fixed address — these hold that it is made,
 * changed and removed without disturbing anything else, and that the five
 * addresses are ones the shop can actually use.
 */
import { describe, expect, it } from "vitest";
import { POLICIES, isBlank, policyHtml, removePolicy, savePolicy } from "@/lib/builder/policies";
import { RESERVED_SLUGS } from "@/lib/builder/doc";
import { cleanHtml } from "@/lib/builder/sanitize";
import type { BuilderNode, SiteDoc } from "@/lib/builder/types";

const doc = (): SiteDoc => ({
  version: 1,
  settings: {},
  parts: {},
  templates: { page: { default: { name: "Default page", tree: null }, legal: { name: "Legal", tree: null } } },
  pages: { about: { title: "About us", template: "default", seo: { title: "", description: "", image: "" }, tree: { id: "a", type: "stack", children: [] } } },
  assignments: { page: { default: "default" } },
  globals: {},
  saved: {},
} as unknown as SiteDoc);

const shipping = POLICIES.find((p) => p.key === "shipping")!;
const types = (n: BuilderNode | null | undefined): string[] => (n ? [n.type, ...(n.children ?? []).flatMap(types)] : []);

describe("the five policies", () => {
  it("are the ones every shop needs", () => {
    expect(POLICIES.map((p) => p.label)).toEqual([
      "Shipping policy", "Return & refund policy", "Privacy policy", "Terms & conditions", "Contact information",
    ]);
  });

  it("each have an address of their own that the shop can use", () => {
    const slugs = POLICIES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(5);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9][a-z0-9-]{0,79}$/);
      expect(RESERVED_SLUGS.has(slug)).toBe(false);
    }
  });

  it("each come with an outline that survives the sanitiser as it was written", () => {
    for (const p of POLICIES) {
      expect(isBlank(p.outline)).toBe(false);
      expect(cleanHtml(p.outline)).toBe(p.outline);
      expect(p.outline).toContain("[");          // prompts to replace, not finished wording
    }
  });
});

describe("writing a policy", () => {
  it("is not written until somebody writes it", () => {
    for (const p of POLICIES) expect(policyHtml(doc(), p)).toBeNull();
  });

  it("makes a page for it: the policy's name, the shop's default page template, one block of text", () => {
    const next = savePolicy(doc(), shipping, "<p>Ships in two days.</p>");
    const page = next.pages!["shipping-policy"]!;
    expect(page.title).toBe("Shipping policy");
    expect(page.template).toBe("default");
    expect(types(page.tree)).toEqual(["stack", "rich_text"]);
    expect(policyHtml(next, shipping)).toBe("<p>Ships in two days.</p>");
  });

  it("uses the page template the shop has chosen as its default", () => {
    const d = doc();
    d.assignments!.page = { default: "legal" };
    expect(savePolicy(d, shipping, "<p>x</p>").pages!["shipping-policy"]!.template).toBe("legal");
  });

  it("leaves every other page exactly as it was", () => {
    const before = doc();
    const next = savePolicy(before, shipping, "<p>x</p>");
    expect(next.pages!.about).toBe(before.pages!.about);
    expect(Object.keys(next.pages!).sort()).toEqual(["about", "shipping-policy"]);
  });

  it("changes only the text the second time — anything added to the page in the builder stays", () => {
    const first = savePolicy(doc(), shipping, "<p>one</p>");
    const page = first.pages!["shipping-policy"]!;
    const textId = page.tree!.children![0]!.id;
    const banner: BuilderNode = { id: "banner", type: "heading", props: { text: "Free delivery over $50" } };
    const edited: SiteDoc = { ...first, pages: { ...first.pages, "shipping-policy": { ...page, title: "Delivery", tree: { ...page.tree!, children: [banner, ...page.tree!.children!] } } } };

    const second = savePolicy(edited, shipping, "<p>two</p>");
    const after = second.pages!["shipping-policy"]!;
    expect(after.title).toBe("Delivery");
    expect(types(after.tree)).toEqual(["stack", "heading", "rich_text"]);
    expect(after.tree!.children![1]!.id).toBe(textId);
    expect(policyHtml(second, shipping)).toBe("<p>two</p>");
  });

  it("puts the text back if the page lost its text block", () => {
    const first = savePolicy(doc(), shipping, "<p>one</p>");
    const page = first.pages!["shipping-policy"]!;
    const emptied: SiteDoc = { ...first, pages: { ...first.pages, "shipping-policy": { ...page, tree: { ...page.tree!, children: [] } } } };
    expect(policyHtml(emptied, shipping)).toBeNull();
    expect(policyHtml(savePolicy(emptied, shipping, "<p>back</p>"), shipping)).toBe("<p>back</p>");
  });

  it("reads a page with nothing a visitor would see as not written", () => {
    expect(policyHtml(savePolicy(doc(), shipping, "<p><br></p>"), shipping)).toBeNull();
    expect(isBlank("<p>&nbsp; </p><h3></h3>")).toBe(true);
    expect(isBlank("<p>a</p>")).toBe(false);
  });
});

describe("removing a policy", () => {
  it("takes its page away and nothing else", () => {
    const written = savePolicy(doc(), shipping, "<p>x</p>");
    const next = removePolicy(written, shipping);
    expect(Object.keys(next.pages!)).toEqual(["about"]);
    expect(policyHtml(next, shipping)).toBeNull();
  });

  it("does nothing to a shop that never wrote it", () => {
    const d = doc();
    expect(removePolicy(d, shipping)).toBe(d);
  });
});
