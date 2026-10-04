/**
 * The builder's pure parts: tree operations, styles, fonts.
 *
 * These are what the editor and the storefront both stand on, so the cases
 * are the ways a merchant actually works: dragging a heading onto an empty
 * page, duplicating a section, moving something into itself by accident,
 * typing a colour that breaks out of its rule, picking a font that fails.
 */
import { describe, expect, it } from "vitest";
import {
  canContain, countNodes, duplicateNode, findNode, insertNode, moveNode, nudge, pathTo, removeNode, walk,
} from "@/lib/builder/tree";
import { declarations, nodeCss, themeCss, treeCss } from "@/lib/builder/style";
import { fontFaceCss, fontStack, googleCssUrl } from "@/lib/builder/fonts";
import type { BuilderNode } from "@/lib/builder/types";

function page(): BuilderNode {
  return {
    id: "root", type: "stack", children: [
      { id: "s1", type: "section", children: [
        { id: "r1", type: "row", children: [
          { id: "c1", type: "column", children: [{ id: "h1", type: "heading", props: { text: "Hi" } }] },
          { id: "c2", type: "column", children: [] },
        ] },
      ] },
      { id: "s2", type: "section", children: [{ id: "t1", type: "text", props: { text: "x" } }] },
    ],
  };
}

const ids = (root: BuilderNode) => { const out: string[] = []; walk(root, (n) => out.push(n.id)); return out; };

describe("dropping an element where it goes", () => {
  it("gives a heading dropped onto the page a section of its own", () => {
    const heading: BuilderNode = { id: "new", type: "heading", props: { text: "New" } };
    const res = insertNode(page(), heading, "root", "inside")!;
    const last = res.tree.children!.at(-1)!;
    expect(last.type).toBe("section");
    expect(last.children![0]!.id).toBe("new");
  });

  it("puts a text dropped into a row into the row's first column", () => {
    const res = insertNode(page(), { id: "new", type: "text" }, "r1", "inside")!;
    expect(findNode(res.tree, "c1")!.children!.map((c) => c.id)).toContain("new");
  });

  it("treats a drop onto a heading as after it", () => {
    const res = insertNode(page(), { id: "new", type: "text" }, "h1", "inside")!;
    expect(findNode(res.tree, "c1")!.children!.map((c) => c.id)).toEqual(["h1", "new"]);
  });

  it("places before and after a sibling", () => {
    const before = insertNode(page(), { id: "a", type: "text" }, "t1", "before")!;
    expect(findNode(before.tree, "s2")!.children!.map((c) => c.id)).toEqual(["a", "t1"]);
    const after = insertNode(page(), { id: "b", type: "text" }, "t1", "after")!;
    expect(findNode(after.tree, "s2")!.children!.map((c) => c.id)).toEqual(["t1", "b"]);
  });

  it("does not put a section inside a section", () => {
    expect(insertNode(page(), { id: "x", type: "section", children: [] }, "s2", "inside")).toBeNull();
  });

  it("leaves the tree it was given alone", () => {
    const before = page();
    const snapshot = JSON.stringify(before);
    insertNode(before, { id: "x", type: "text" }, "s2", "inside");
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("moving", () => {
  it("moves a heading to another section", () => {
    const res = moveNode(page(), "h1", "s2", "inside")!;
    expect(findNode(res.tree, "c1")!.children).toEqual([]);
    expect(findNode(res.tree, "s2")!.children!.map((c) => c.id)).toEqual(["t1", "h1"]);
  });

  it("refuses to move a section into its own child", () => {
    expect(moveNode(page(), "s1", "c1", "inside")).toBeNull();
  });

  it("refuses to move the page itself", () => {
    expect(moveNode(page(), "root", "s1", "inside")).toBeNull();
  });

  it("nudges among siblings and stops at the ends", () => {
    const up = nudge(page(), "s2", -1);
    expect(up.children!.map((c) => c.id)).toEqual(["s2", "s1"]);
    expect(nudge(page(), "s1", -1).children!.map((c) => c.id)).toEqual(["s1", "s2"]);
  });
});

describe("duplicating and removing", () => {
  it("copies a section with new ids throughout, straight after it", () => {
    const res = duplicateNode(page(), "s1")!;
    expect(res.tree.children!.map((c) => c.type)).toEqual(["section", "section", "section"]);
    const all = ids(res.tree);
    expect(new Set(all).size).toBe(all.length);
    expect(res.tree.children![1]!.id).toBe(res.id);
    expect(countNodes(res.tree)).toBe(countNodes(page()) + 5);
  });

  it("removes an element and everything in it", () => {
    const tree = removeNode(page(), "s1");
    expect(findNode(tree, "h1")).toBeNull();
    expect(tree.children!.map((c) => c.id)).toEqual(["s2"]);
  });

  it("will not remove the page itself", () => {
    expect(removeNode(page(), "root").id).toBe("root");
  });

  it("knows the path to an element, for breadcrumbs", () => {
    expect(pathTo(page(), "h1").map((n) => n.id)).toEqual(["root", "s1", "r1", "c1", "h1"]);
  });

  it("knows what holds what", () => {
    expect(canContain("row", "column")).toBe(true);
    expect(canContain("row", "text")).toBe(false);
    expect(canContain("heading", "text")).toBe(false);
  });
});

describe("styles", () => {
  it("adds px to bare numbers where that is what they mean", () => {
    expect(declarations({ paddingTop: 24, opacity: 0.5 }, "section")).toBe("padding-top:24px;opacity:0.5");
  });

  it("turns a column count into a grid", () => {
    expect(declarations({ columns: 3 }, "row")).toBe("grid-template-columns:repeat(3,minmax(0,1fr))");
  });

  it("drops a value that tries to break out of its rule", () => {
    expect(declarations({ color: "red;} body{display:none" }, "text")).toBe("");
    expect(declarations({ backgroundImage: "url(http://x.test/a.png)" }, "section")).toBe("");
    expect(declarations({ backgroundImage: "url(https://x.test/a.png)" }, "section"))
      .toBe("background-image:url(https://x.test/a.png)");
  });

  it("scopes every rule to the element, with tablet and phone overrides", () => {
    const css = nodeCss({ id: "n1", type: "heading", style: { fontSize: 48 }, tablet: { fontSize: 36 }, mobile: { fontSize: 28 } });
    expect(css).toContain('.bsite [data-b="n1"]{font-size:48px}');
    expect(css).toContain('@container bsite (max-width:1024px){.bsite [data-b="n1"]{font-size:36px}}');
    expect(css).toContain('@container bsite (max-width:640px){.bsite [data-b="n1"]{font-size:28px}}');
  });

  it("uses container queries, so the editor's phone canvas behaves like a phone", () => {
    expect(nodeCss({ id: "n1", type: "text", mobile: { fontSize: 12 } })).toContain("@container bsite");
    expect(nodeCss({ id: "n1", type: "text", mobile: { fontSize: 12 } })).not.toContain("@media");
  });

  it("hides per device without the ranges overlapping", () => {
    const css = nodeCss({ id: "n1", type: "text", hide: { mobile: true } });
    expect(css).toBe('@container bsite (max-width:640px){.bsite [data-b="n1"]{display:none!important}}');
  });

  it("will not write a rule for an id that could escape its selector", () => {
    expect(nodeCss({ id: 'x"]{}*{', type: "text", style: { color: "red" } })).toBe("");
  });

  it("writes every element's rules for a whole tree", () => {
    const tree: BuilderNode = { id: "a", type: "section", style: { color: "#111" },
      children: [{ id: "b", type: "text", style: { color: "#222" } }] };
    const css = treeCss(tree);
    expect(css).toContain('[data-b="a"]');
    expect(css).toContain('[data-b="b"]');
  });

  it("writes the type scale at each breakpoint", () => {
    const css = themeCss({ typography: { heading: { family: "Playfair Display" },
      scale: { h1: { desktop: 64, tablet: 48, mobile: 36 } } } });
    expect(css).toContain(".bsite h1{font-size:64px}");
    expect(css).toContain("@container bsite (max-width:1024px){.bsite h1{font-size:48px}}");
    expect(css).toContain("@container bsite (max-width:640px){.bsite h1{font-size:36px}}");
    expect(css).toContain("container-type:inline-size");
    expect(css).toContain('--b-font-heading:"Playfair Display", Georgia');
  });

  it("ignores a colour variable that is not a colour", () => {
    expect(themeCss({ colors: { primary: "red;}*{x:y" } })).not.toContain("--b-primary");
  });
});

describe("fonts", () => {
  it("falls back to the same kind of font", () => {
    expect(fontStack("Playfair Display")).toContain("serif");
    expect(fontStack("Inter")).toMatch(/^"Inter", system-ui/);
    expect(fontStack("Georgia")).toBe("Georgia, 'Times New Roman', serif");
  });

  it("gives an uploaded font a sensible fallback too", () => {
    expect(fontStack("Brand Sans")).toMatch(/^"Brand Sans", system-ui/);
  });

  it("refuses a font name that is not a name", () => {
    expect(fontStack('x"; } body { x')).not.toContain("body");
  });

  it("asks Google for only the families and weights in use, in one request", () => {
    const url = googleCssUrl([{ family: "Inter", weights: [700, 400, 400] }, { family: "Lora", weights: [400], italic: true }])!;
    expect(url).toBe("https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Lora:ital,wght@0,400;1,400&display=swap");
  });

  it("asks for nothing when the site uses only system fonts", () => {
    expect(googleCssUrl([])).toBeNull();
  });

  it("writes @font-face for uploaded faces, https only, with swap", () => {
    const css = fontFaceCss([
      { family: "Brand Sans", weight: 700, style: "normal", url: "https://ik.example/b.woff2", format: "woff2" },
      { family: "Brand Sans", weight: 400, style: "normal", url: "http://insecure/b.woff2", format: "woff2" },
      { family: "Brand Sans", weight: 400, style: "normal", url: "https://x/b.exe", format: "exe" },
    ]);
    expect(css.match(/@font-face/g)?.length).toBe(1);
    expect(css).toContain('format("woff2")');
    expect(css).toContain("font-display:swap");
    expect(css).toContain("font-weight:700");
  });
});
