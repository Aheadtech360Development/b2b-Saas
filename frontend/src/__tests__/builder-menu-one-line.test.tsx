/**
 * A header menu stays on one line (Innterflow, 2026-11-10: a sixth link ran
 * onto a second line). MenuNav measures the links: they draw closer, then
 * their text goes a size smaller, and when even that does not fit the menu
 * becomes the drawer's button. jsdom has no layout, so the widths a browser
 * would give are set here by step.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import MenuNav, { FIT_STEPS, fitOneLine } from "@/components/builder/islands/MenuNav";
import { BASE_CSS } from "@/lib/builder/baseCss";

const items = ["DTF & UV DTF", "Ready to Print Designs", "Promotional Material", "Blanks", "Help Center", "Contact Us"]
  .map((label) => ({ label, href: "/" }));

/** The links' width at each step, in a menu `room` wide (a browser measures these). */
function lay(nav: HTMLElement, room: number, widths: Record<string, number>) {
  const list = nav.querySelector<HTMLElement>(".b-menu-list")!;
  Object.defineProperty(list, "clientWidth", { configurable: true, get: () => room });
  Object.defineProperty(list, "scrollWidth", { configurable: true, get: () => widths[nav.dataset.fit ?? "normal"] ?? 0 });
}

const NEEDS = { normal: 833, snug: 785, tight: 719, tighter: 665 };

afterEach(() => { document.body.innerHTML = ""; });

describe("a header menu on one line", () => {
  function nav() {
    const { container } = render(<div><MenuNav id="m" items={items} layout="horizontal" mobile="drawer" label="Menu" /></div>);
    return container.querySelector<HTMLElement>("nav")!;
  }

  it("keeps its usual spacing when it fits", () => {
    const n = nav();
    lay(n, 900, NEEDS);
    expect(fitOneLine(n)).toBe("normal");
    expect(n.dataset.fit).toBe("normal");
  });

  it("draws its links closer, then a size smaller, as room runs out", () => {
    const n = nav();
    lay(n, 790, NEEDS);
    expect(fitOneLine(n)).toBe("snug");
    lay(n, 755, NEEDS);
    expect(fitOneLine(n)).toBe("tight");
    lay(n, 700, NEEDS);
    expect(fitOneLine(n)).toBe("tighter");
  });

  it("becomes the drawer's button when even that does not fit, and comes back when it does", () => {
    const n = nav();
    lay(n, 600, NEEDS);
    expect(fitOneLine(n)).toBe("drawer");
    expect(n.dataset.fit).toBe("drawer");
    lay(n, 1000, NEEDS);
    expect(fitOneLine(n)).toBe("normal");
  });

  it("is measured as soon as it is on the page", () => {
    expect(nav().dataset.fit).toBe(FIT_STEPS[0]);
  });

  it("leaves a footer's or an inline menu alone", () => {
    const { container } = render(<div>
      <MenuNav id="f" items={items} layout="vertical" mobile="inline" label="Footer" />
      <MenuNav id="i" items={items} layout="horizontal" mobile="inline" label="Inline" />
    </div>);
    container.querySelectorAll("nav").forEach((n) => expect(n.dataset.fit).toBeUndefined());
  });

  it("has the CSS for every step, the top links only, and never wraps a header menu", () => {
    for (const step of ["snug", "tight", "tighter", "drawer"]) expect(BASE_CSS).toContain(`.b-menu[data-fit=${step}]`);
    expect(BASE_CSS).toContain(".b-menu[data-fit=tight] .b-menu-list > .b-menu-item > .b-menu-link");
    expect(BASE_CSS).toContain(".b-menu[data-mobile=drawer] .b-menu-list){flex-wrap:nowrap}");
  });
});

// Sidequest, 2026-11-11: light links on a black header; pointing at one laid
// the page's light card colour under it and the word vanished.
describe("a menu with light links (a dark header)", () => {
  it("says so, and a link pointed at gets a light wash instead of the page's card colour", () => {
    const { container } = render(<div>
      <MenuNav id="d" items={items} layout="horizontal" mobile="drawer" label="Dark" onDark />
      <MenuNav id="l" items={items} layout="horizontal" mobile="drawer" label="Light" />
    </div>);
    const [dark, light] = Array.from(container.querySelectorAll("nav"));
    expect(dark!.dataset.tone).toBe("dark");
    expect(light!.dataset.tone).toBeUndefined();
    expect(BASE_CSS).toContain(".b-menu[data-tone=dark] .b-menu-link:hover){background:rgba(255,255,255,.1)}");
    // After the usual rule, so it wins for a dark header; a footer's list (vertical) still has none.
    expect(BASE_CSS.indexOf("data-tone=dark")).toBeGreaterThan(BASE_CSS.indexOf(".b-menu-link:hover){background:var(--b-surface"));
    expect(BASE_CSS.indexOf("data-layout=vertical] .b-menu-link:hover){background:none")).toBeGreaterThan(BASE_CSS.indexOf("data-tone=dark"));
  });
});
