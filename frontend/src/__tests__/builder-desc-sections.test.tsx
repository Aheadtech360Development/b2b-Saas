/**
 * A long product description cut into sections at its own headings, each one
 * opening and closing — so a description written with headings no longer
 * takes half the page.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { splitDescription } from "@/lib/builder/descSections";
import { Tree, type RenderCtx } from "@/components/builder/render";
import type { BuilderNode, SitePayload } from "@/lib/builder/types";

const LONG = `<h2>Product Details</h2><p>Order <strong>custom DTF transfers by size</strong>.</p><hr>
<h2>Features</h2><ul><li>Vibrant</li><li>Soft</li></ul><hr>
<h2>Pressing Instructions</h2><p><strong>Temperature:</strong> 300–320°F</p><h3>Peel</h3><p>Warm.</p>
<h2>Shipping &amp; Returns</h2><p>Tracking is provided.</p>`;

describe("cutting a description at its headings", () => {
  it("makes a section of each heading, with what is under it — and drops the rules between them", () => {
    const out = splitDescription(LONG)!;
    expect(out.sections.map((s) => s.title)).toEqual(["Product Details", "Features", "Pressing Instructions", "Shipping &amp; Returns"]);
    expect(out.sections[1]!.html).toContain("<li>Vibrant</li>");
    expect(out.sections[0]!.html).not.toContain("<hr");
    // A smaller heading stays inside its section.
    expect(out.sections[2]!.html).toContain("<h3>Peel</h3>");
    expect(out.intro).toBe("");
  });

  it("keeps what comes before the first heading in view, and a title used once above the sections", () => {
    const out = splitDescription(`<h1>DTF Transfers</h1><p>Ready to press.</p><h2>Sizes</h2><p>Any.</p><h2>Care</h2><p>Wash cold.</p>`)!;
    expect(out.intro).toBe("<h1>DTF Transfers</h1><p>Ready to press.</p>");
    expect(out.sections.map((s) => s.title)).toEqual(["Sizes", "Care"]);
  });

  it("finds headings written as a line of bold words, and headings inside boxes", () => {
    const bold = splitDescription(`<p>Intro.</p><p><strong>Features</strong></p><p>Soft.</p><p><b>Care:</b></p><p>Cold wash.</p>`)!;
    expect(bold.intro).toBe("<p>Intro.</p>");
    expect(bold.sections.map((s) => s.title)).toEqual(["Features", "Care:"]);
    const boxed = splitDescription(`<div class="x"><h3>One</h3><p>a</p></div><div><h3>Two</h3><p>b</p></div>`)!;
    expect(boxed.sections.map((s) => [s.title, s.html])).toEqual([["One", "<p>a</p>"], ["Two", "<p>b</p>"]]);
  });

  it("leaves a description with fewer than two headings as it is", () => {
    expect(splitDescription("<p>Just a sentence.</p>")).toBeNull();
    expect(splitDescription("<h2>Only one</h2><p>text</p>")).toBeNull();
    expect(splitDescription("")).toBeNull();
  });
});

describe("the product description element", () => {
  const product = { id: "p1", name: "DTF", description: LONG, images: [], from_price: 1 } as unknown as NonNullable<SitePayload["data"]["product"]>;
  const draw = (props: Record<string, unknown> = {}) => {
    const node: BuilderNode = { id: "d1", type: "product_description", props };
    const ctx: RenderCtx = { data: { product, collection: null, collectionPage: null, menus: {}, grids: {}, collectionGrids: {}, store: { name: "S", logo: "" } },
      globals: {}, page: null, query: "", route: "product", trusted: true } as unknown as RenderCtx;
    return renderToStaticMarkup(<Tree tree={node} ctx={ctx} />);
  };

  it("shows the sections that open and close, the first one open", () => {
    const out = draw();
    expect(out.match(/<details/g)).toHaveLength(4);
    expect(out.match(/<details open=""/g)).toHaveLength(1);
    expect(out).toContain("<summary><span>Product Details</span></summary>");
  });

  it("can start with every section closed, or show it all as written", () => {
    expect(draw({ allClosed: true })).not.toContain("<details open");
    const plain = draw({ layout: "plain" });
    expect(plain).not.toContain("<details");
    expect(plain).toContain("<h2>Features</h2>");
  });
});
