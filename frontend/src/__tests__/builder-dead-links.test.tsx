/**
 * Every button and link on a shop goes somewhere (owner, 2026-11-12): the
 * demo stores' designs carried buttons that worked by their own script (a
 * code to copy, a size guide, a wishlist), imported as "#". On the shop they
 * go to the page their words name; in the editor they stay as they are.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { Tree } from "@/components/builder/render";
import MenuNav from "@/components/builder/islands/MenuNav";
import { whereWordsGo } from "@/lib/builder/whereWordsGo";
import type { BuilderNode, SitePayload } from "@/lib/builder/types";

const data = { product: null, menus: {}, grids: {}, collectionGrids: {}, store: { name: "Shop", logo: "" } } as unknown as SitePayload["data"];
const draw = (tree: BuilderNode, edit = false) =>
  renderToStaticMarkup(<Tree tree={tree} ctx={{ data, globals: {}, page: null, query: "", route: "home", edit }} />);

describe("a button or link that goes nowhere", () => {
  it("goes where its words say", () => {
    expect(whereWordsGo("Chat now")).toBe("/contact");
    expect(whereWordsGo("Your wishlist")).toBe("/account");
    expect(whereWordsGo("Track your order")).toBe("/track-order");
    expect(whereWordsGo("Send a gift card")).toBe("/gift-cards");
    expect(whereWordsGo("Exchange a size")).toBe("/returns");
    expect(whereWordsGo("Quote any size")).toBe("/quote");
    expect(whereWordsGo("NIGHTSHIFT = 15% off")).toBe("/products");
    expect(whereWordsGo("Size & fit guide")).toBe("/products");
  });

  it("on the shop, and keeps an address it has", () => {
    const dead: BuilderNode = { id: "b", type: "button", props: { text: "Chat now", href: "#" } };
    const live: BuilderNode = { id: "c", type: "button", props: { text: "Chat now", href: "/faq" } };
    const link: BuilderNode = { id: "l", type: "link", props: { text: "Get 10% off", href: "" } };
    expect(draw(dead)).toContain('href="/contact"');
    expect(draw(live)).toContain('href="/faq"');
    expect(draw(link)).toContain('href="/products"');
    // In the editor nothing navigates: the button is shown as it is.
    expect(draw(dead, true)).toContain('href="#"');
  });

  it("in a menu too", () => {
    const { container } = render(<MenuNav id="m" layout="horizontal" mobile="inline" label="Menu"
      items={[{ label: "Kits", href: "#" }, { label: "Tops", href: "/collections/tops" }]} />);
    const hrefs = Array.from(container.querySelectorAll("a.b-menu-link")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/products", "/collections/tops"]);
  });
});
