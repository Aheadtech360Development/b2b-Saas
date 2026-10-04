/**
 * Pages made before the Grid + Flex layout engine render exactly as before.
 *
 * The snapshots were written by the style code as it was before the layout
 * engine existed. Any change to what an existing site's CSS is — one
 * character — fails here.
 */
import { describe, expect, it } from "vitest";
import starter from "./fixtures/starter-doc.json";
import { treeCss } from "@/lib/builder/style";
import type { BuilderNode, SiteDoc } from "@/lib/builder/types";
import { PRESETS, REGISTRY } from "@/lib/builder/registry";

function allTrees(doc: SiteDoc): BuilderNode[] {
  const out: BuilderNode[] = [];
  for (const t of Object.values(doc.parts ?? {})) if (t) out.push(t);
  for (const group of Object.values(doc.templates ?? {})) for (const tpl of Object.values(group ?? {})) if (tpl?.tree) out.push(tpl.tree);
  for (const p of Object.values(doc.pages ?? {})) if (p.tree) out.push(p.tree);
  return out;
}

/** Ids from create() are random; give them stable ones so the CSS is comparable. */
function stable(node: BuilderNode, prefix: string, n = { i: 0 }): BuilderNode {
  return { ...node, id: `${prefix}${n.i++}`, children: node.children?.map((c) => stable(c, prefix, n)) };
}

describe("existing sites keep their CSS", () => {
  it("the starter site", async () => {
    await expect(treeCss(...allTrees(starter as unknown as SiteDoc))).toMatchFileSnapshot("./fixtures/starter-css.snap.txt");
  });

  it("every element and ready-made section as the editor creates them", async () => {
    const trees = [
      ...REGISTRY.map((c, i) => stable(c.create(), `e${i}x`)),
      ...PRESETS.map((p, i) => stable(p.create(), `p${i}x`)),
    ];
    await expect(treeCss(...trees)).toMatchFileSnapshot("./fixtures/elements-css.snap.txt");
  });
});
