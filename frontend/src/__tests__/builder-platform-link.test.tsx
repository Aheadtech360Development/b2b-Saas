/**
 * The demo stores' bar "Demo store, powered by PrintCoPilot" (brought in by
 * Import a design) and the line at the foot of every shop both go to the
 * platform, https://www.printcopilot.co/ (owner, 2026-11-12).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { platformLink, Tree } from "@/components/builder/render";
import { PLATFORM_URL, PoweredBy } from "@/components/storefront/PoweredBy";
import type { SitePayload } from "@/lib/builder/types";

describe("PrintCoPilot goes to the platform", () => {
  it("in a demo store's bar, as drawn on the shop", () => {
    expect(PLATFORM_URL).toBe("https://www.printcopilot.co/");
    const data = { product: null, menus: {}, grids: {}, collectionGrids: {}, store: { name: "Shop", logo: "" } } as unknown as SitePayload["data"];
    const tree = { id: "bar", type: "rich_text", props: { html: "<p>Demo store, powered by <strong>PrintCoPilot</strong></p>" } };
    const out = renderToStaticMarkup(<Tree tree={tree} ctx={{ data, globals: {}, page: null, query: "", route: "home" }} />);
    expect(out).toContain('<a href="https://www.printcopilot.co/" target="_blank" rel="noopener"');
    expect(out).toContain("<strong>PrintCoPilot</strong></a>");
  });

  it("only there: other words, and a name that already links, stay as they are", () => {
    expect(platformLink("<p>Made with love by PrintCoPilot</p>")).toBe("<p>Made with love by PrintCoPilot</p>");
    const linked = '<p>Powered by <a href="https://www.printcopilot.co/">PrintCoPilot</a></p>';
    expect(platformLink(linked)).toBe(linked);
    expect(platformLink("<p>Powered by PrintCoPilot</p>")).toContain(`<a href="${PLATFORM_URL}"`);
  });

  it("at the foot of every shop", () => {
    const out = renderToStaticMarkup(<PoweredBy builder />);
    expect(out).toContain('href="https://www.printcopilot.co/"');
    expect(out).toContain("data-powered-by");
  });
});
