/**
 * The announcement bar, moving.
 *
 * A shop's message — order by noon, pickup until five, free shipping over a
 * hundred, where the shop is — took four or five lines of a phone's screen
 * before the shop had shown anything. On a phone it now stays on one line and
 * slides across the bar, unless the shop says otherwise.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/stores/auth.store", () => ({ useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: null, isLoading: false }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: () => Promise.resolve({ items: [] }) } }));

import { Tree, type RenderCtx } from "@/components/builder/render";
import { BASE_CSS } from "@/lib/builder/baseCss";
import { BY_TYPE } from "@/lib/builder/registry";
import type { BuilderNode } from "@/lib/builder/types";

const LONG = "⏱ Order by 12 PM same-day 📦 Pickup until 5 PM · Dallas 🚚 Free ship $100+ 📍Right on the edge of Garland and Dallas, about a minute away from Plano Rd and Jupiter.";
const SHORT = "Free shipping on orders over $100";
const ctx = {
  data: { product: null, collection: null, collectionPage: null, grids: {}, collectionGrids: {}, store: { name: "Shop", logo: "" }, menus: {} },
  globals: {}, page: null, query: "", route: "home",
} as unknown as RenderCtx;

function draw(props: Record<string, unknown>, edit = false) {
  document.body.innerHTML = "";
  const node = { id: "a1", type: "announcement_bar", props } as unknown as BuilderNode;
  render(<div className="bsite" data-part="announcement"><Tree tree={node} ctx={{ ...ctx, edit }} /></div>);
  return document.querySelector<HTMLElement>(".b-announce")!;
}
const pace = (bar: HTMLElement, name: string) =>
  parseFloat(bar.querySelector<HTMLElement>(".b-announce-run")!.style.getPropertyValue(name));

describe("a moving announcement", () => {
  it("moves on a phone unless the shop says otherwise, and from left to right", () => {
    // A bar made before this existed has neither setting: it gets the phone's.
    const bar = draw({ text: SHORT });
    expect(bar.getAttribute("data-move")).toBe("phone");
    expect(bar.hasAttribute("data-dir")).toBe(false);

    expect(draw({ text: SHORT, move: "always" }).getAttribute("data-move")).toBe("always");
    expect(draw({ text: SHORT, moveDir: "left" }).getAttribute("data-dir")).toBe("left");

    // Off is off: nothing for the stylesheet to take hold of.
    const still = draw({ text: SHORT, move: "off", moveDir: "left" });
    expect(still.hasAttribute("data-move")).toBe(false);
    expect(still.hasAttribute("data-dir")).toBe(false);
  });

  it("has the words in the page once, with the copies drawn from them", () => {
    const bar = draw({ text: LONG });
    // Once for a reader, a search engine, and the editor's typing in place.
    expect(bar.textContent).toBe(LONG);
    expect(bar.querySelector(".b-announce-run")!.getAttribute("data-text")).toBe(LONG);
    expect(BASE_CSS).toContain('::before,.bsite :where(.b-announce[data-move] .b-announce-run)::after{content:attr(data-text);content:attr(data-text) / ""}');

    // A linked bar is the link itself, moving the same way.
    const linked = draw({ text: SHORT, href: "/collections/sale" });
    expect(linked.tagName).toBe("A");
    expect(linked.getAttribute("href")).toBe("/collections/sale");
    expect(linked.getAttribute("data-move")).toBe("phone");
    expect(linked.textContent).toBe(SHORT);

    // While the editor is drawing the page it is the same element, so a
    // double-click still types into the words.
    expect(draw({ text: SHORT }, true).textContent).toBe(SHORT);
    expect(BASE_CSS).toContain(".bsite .b-announce[contenteditable]:not([contenteditable=false]) .b-announce-run{display:inline;animation:none}");
  });

  it("goes at one pace: a long message takes longer to pass, a short one is not slowed to match", () => {
    const short = draw({ text: SHORT });
    const short_s = pace(short, "--b-ann-dur");
    const long_s = pace(draw({ text: LONG }), "--b-ann-dur");
    // A short one crosses a phone's width (about 390px at 50 a second).
    expect(short_s).toBe(8);
    expect(long_s).toBeGreaterThan(short_s * 2.5);
    expect(long_s).toBeLessThan(40);
    // A wide screen has further to carry it.
    expect(pace(short, "--b-ann-wide")).toBeGreaterThan(short_s);
  });

  it("is a rule for the phone's width, runs the other way when asked, and stands still for less motion", () => {
    const phone = /@container bsite \(max-width:640px\)\{\s*\.bsite :where\(\.b-announce\[data-move\]\)\{overflow:hidden;white-space:nowrap\}\s*\.bsite :where\(\.b-announce\[data-move\] \.b-announce-run\)\{display:flex;width:max-content;animation:b-ann var\(--b-ann-dur,14s\) linear infinite\}/;
    expect(BASE_CSS).toMatch(phone);
    // On every width only when the shop chose that.
    expect(BASE_CSS).toContain(".bsite :where(.b-announce[data-move=always] .b-announce-run){display:flex;width:max-content;animation:b-ann var(--b-ann-wide,24s) linear infinite}");
    expect(BASE_CSS).toContain(".bsite :where(.b-announce[data-move][data-dir=left] .b-announce-run){animation-direction:reverse}");
    // Three copies, slid by exactly one: left to right as written.
    expect(BASE_CSS).toContain("@keyframes b-ann{from{transform:translateX(calc(-200% / 3))}to{transform:translateX(calc(-100% / 3))}}");

    // Every rule that sets it moving sits inside the "no preference" query.
    const guard = BASE_CSS.indexOf("@media (prefers-reduced-motion:no-preference){");
    expect(guard).toBeGreaterThan(-1);
    const moving = [...BASE_CSS.matchAll(/animation:b-ann /g)].map((m) => m.index!);
    expect(moving.length).toBe(2);
    const end = BASE_CSS.indexOf("/* While its words are being typed", guard);
    expect(end).toBeGreaterThan(guard);
    expect(moving.every((i) => i > guard && i < end)).toBe(true);
  });

  it("is two choices in the editor's panel, the second only while it moves", () => {
    const fields = BY_TYPE.announcement_bar!.fields;
    const move = fields.find((f) => f.key === "move")!;
    expect(move.options!.map((o) => o.value)).toEqual(["", "always", "off"]);
    // The first is what a bar with nothing chosen gets, so the panel shows the truth.
    expect(move.options![0]!.label).toBe("On a phone");
    const dir = fields.find((f) => f.key === "moveDir")!;
    expect(dir.options!.map((o) => [o.value, o.label])).toEqual([["", "Left to right"], ["left", "Right to left"]]);
    expect(dir.when).toEqual({ key: "move", is: ["", "always", undefined] });
    // A new bar starts with neither set.
    expect(BY_TYPE.announcement_bar!.create().props).toEqual({ text: "Free shipping on orders over $100" });
  });
});
