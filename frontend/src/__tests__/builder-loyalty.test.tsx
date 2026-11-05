/**
 * The rewards program in the website builder (backend services/loyalty): a
 * Rewards program block, Refer a friend, and what a product earns. The numbers
 * are the program's own; a customer's points and link are theirs once signed
 * in; with the program off the shop shows nothing and the editor says why.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const who: { user: null | { is_admin: boolean }; isLoading: boolean } = { user: null, isLoading: false };
vi.mock("@/stores/auth.store", () => ({ useAuthStore: (pick: (s: typeof who) => unknown) => pick(who) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const get = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiClient: { get: (...a: unknown[]) => get(...a), post: vi.fn() } }));

import { JOIN_HREF, LOGIN_HREF, REWARDS_HREF, earnLine, pointsFor, priceIn, unit } from "@/components/builder/islands/Loyalty";
import { Tree, type RenderCtx } from "@/components/builder/render";
import { BASE_CSS } from "@/lib/builder/baseCss";
import { BY_TYPE, PRESETS } from "@/lib/builder/registry";
import type { BuilderNode, LoyaltyInfo, SitePayload } from "@/lib/builder/types";

const INFO: LoyaltyInfo = {
  on: true, program_name: "Tee Club", points_name: "stars", points_per_dollar: 2, expiry_months: 12,
  tiers: [{ points: 100, reward: 5 }, { points: 250, reward: 12.5 }],
  referral: { you_get: 100, friend_gets: 50 },
};

function ctx(loyalty: SitePayload["data"]["loyalty"], over: Partial<RenderCtx> = {}, product: Record<string, unknown> | null = null): RenderCtx {
  return {
    data: { product, collection: null, collectionPage: null, menus: {}, grids: {}, collectionGrids: {},
            store: { name: "Shop", logo: "" }, loyalty },
    globals: {}, page: null, query: "", route: "home", ...over,
  };
}
const make = (type: string, props: Record<string, unknown> = {}): BuilderNode => {
  const n = BY_TYPE[type]!.create();
  return { ...n, id: "ly1", props: { ...n.props, ...props } };
};
const draw = (node: BuilderNode, c: RenderCtx) => render(<Tree tree={node} ctx={c} />);
const hrefs = (root: HTMLElement) => [...root.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);

beforeEach(() => { who.user = null; who.isLoading = false; get.mockReset(); });

describe("the program's words and numbers", () => {
  it("say what a dollar earns, in the program's own name for points", () => {
    expect(earnLine(INFO)).toBe("Earn 2 stars for every $1 you spend, and turn them into money off your next order.");
    expect(earnLine({ ...INFO, points_name: "points", points_per_dollar: 1 })).toMatch(/^Earn 1 point for every \$1/);
  });

  it("say one point without the s, whatever the shop calls them", () => {
    expect([unit(1, "points"), unit(1, "Stars"), unit(1, "bonus"), unit(1, "class"), unit(1, "karma")])
      .toEqual(["1 point", "1 Star", "1 bonus", "1 class", "1 karma"]);
    expect(unit(1250, "points")).toBe("1,250 points");
  });

  it("count a product's points the way an order is counted: rounded down, in cents", () => {
    expect(pointsFor(19.99, 1)).toBe(19);
    expect(pointsFor(4.35, 100)).toBe(435);
    expect(pointsFor(12.5, 2)).toBe(25);
    expect(pointsFor(0, 3)).toBe(0);
    expect(pointsFor(null, 3)).toBe(0);
  });

  it("read the amount in a price line", () => {
    expect(priceIn("$1,250.00")).toBe(1250);
    expect(priceIn("From $12.50")).toBe(12.5);
    expect(priceIn("Price on request")).toBeNull();
  });
});

describe("the Rewards program block", () => {
  it("shows a visitor how it works, the rewards, the expiry, and the way in", () => {
    const { container } = draw(make("loyalty_program"), ctx(INFO));
    expect(screen.getByRole("heading", { name: "Tee Club" })).toBeInTheDocument();
    expect(container).toHaveTextContent(earnLine(INFO));
    expect(container).toHaveTextContent("2 stars for every $1 you spend.");
    expect([...container.querySelectorAll(".b-loyal-tiers li")].map((li) => li.textContent)).toEqual(["$5 off100 stars", "$12.50 off250 stars"]);
    expect(container).toHaveTextContent("Unused stars expire 12 months after they are earned.");
    expect(hrefs(container)).toEqual([["Join now", JOIN_HREF], ["Log in", LOGIN_HREF]]);
    expect(JOIN_HREF).toBe("/create-account?next=/account/rewards");
    expect(get).not.toHaveBeenCalled();
  });

  it("says what the shop wrote instead, and leaves out what the shop turned off", () => {
    const { container } = draw(make("loyalty_program", { heading: "Get rewarded", text: "Points on everything.", showSteps: false, showTiers: false, joinLabel: "Sign me up" }), ctx(INFO));
    expect(screen.getByRole("heading", { name: "Get rewarded" })).toBeInTheDocument();
    expect(container).toHaveTextContent("Points on everything.");
    expect(container.querySelector(".b-loyal-steps, .b-loyal-tiers")).toBeNull();
    expect(hrefs(container)[0]).toEqual(["Sign me up", JOIN_HREF]);
  });

  it("shows a signed-in customer their own points and the next reward", async () => {
    who.user = { is_admin: false };
    get.mockResolvedValue({ enabled: true, balance: 140, next_reward: { points: 250, reward: 12.5, needed: 110 } });
    const { container } = draw(make("loyalty_program"), ctx(INFO));
    await waitFor(() => expect(container).toHaveTextContent("You have 140 stars. 110 more for $12.50 off."));
    expect(get).toHaveBeenCalledWith("/api/v1/account/rewards/summary");
    expect(hrefs(container)).toEqual([["See my rewards", REWARDS_HREF]]);
  });

  it("is drawn by the server as a visitor sees it, whoever reads it", () => {
    who.user = { is_admin: false };
    const html = renderToStaticMarkup(<Tree tree={make("loyalty_program")} ctx={ctx(INFO)} />);
    expect(html).toContain('data-state="out"');
    expect(html).toContain(JOIN_HREF.replace(/&/g, "&amp;"));
  });

  it("shows nothing on the shop while the program is off, and tells the editor where to turn it on", () => {
    const off = { on: false } as const;
    expect(draw(make("loyalty_program"), ctx(off)).container.innerHTML).toBe("");
    const { container } = draw(make("loyalty_program"), ctx(off, { edit: true }));
    expect(container).toHaveTextContent("Your rewards program shows here once your rewards program is on: Marketing, Loyalty.");
  });
});

describe("Refer a friend", () => {
  it("says what each of them gets, and asks a visitor to log in for their link", () => {
    const { container } = draw(make("loyalty_referral"), ctx(INFO));
    expect(screen.getByRole("heading", { name: "Give and get" })).toBeInTheDocument();
    expect(container).toHaveTextContent("they get 50 stars and you get 100 stars.");
    expect(hrefs(container)).toEqual([["Log in to get your link", LOGIN_HREF], ["Create an account", JOIN_HREF]]);
  });

  it("gives a signed-in customer their own link to copy", async () => {
    who.user = { is_admin: false };
    get.mockResolvedValue({ referral: { link: "https://shop.printcopilot.co/?bref=AB12CD" } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    draw(make("loyalty_referral"), ctx(INFO));
    const box = await screen.findByLabelText("Your referral link");
    expect((box as HTMLInputElement).value).toBe("https://shop.printcopilot.co/?bref=AB12CD");
    expect(get).toHaveBeenCalledWith("/api/v1/account/rewards");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy link" })); });
    expect(writeText).toHaveBeenCalledWith("https://shop.printcopilot.co/?bref=AB12CD");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("shows nothing while refer a friend is off, and tells the editor", () => {
    const noRef = { ...INFO, referral: null };
    expect(draw(make("loyalty_referral"), ctx(noRef)).container.innerHTML).toBe("");
    expect(draw(make("loyalty_referral"), ctx(noRef, { edit: true })).container)
      .toHaveTextContent("Refer a friend shows here once it is on in your rewards program: Marketing, Loyalty.");
  });
});

describe("what a product earns", () => {
  const product = { id: "p1", from_price: 24.99 };

  it("says what this purchase earns at the product's price", () => {
    const { container } = draw(make("loyalty_points"), ctx(INFO, { route: "product" }, product));
    expect(container).toHaveTextContent("Earn 49 stars with this purchase.");
  });

  it("follows the price line as the customer picks options", async () => {
    const node = make("loyalty_points");
    const { container } = render(
      <div className="bsite" data-product-id="p1">
        <div data-theme-price="1">$24.99</div>
        <Tree tree={node} ctx={ctx(INFO, { route: "product" }, product)} />
      </div>,
    );
    const line = container.querySelector<HTMLElement>("[data-theme-price]")!;
    await act(async () => { line.textContent = "$60.00"; });
    await waitFor(() => expect(container).toHaveTextContent("Earn 120 stars with this purchase."));
  });

  it("is only a note in the editor away from a product, and nothing on the shop when the program is off", () => {
    expect(draw(make("loyalty_points"), ctx(INFO, { edit: true })).container)
      .toHaveTextContent("What this product earns in your rewards program shows here.");
    expect(draw(make("loyalty_points"), ctx({ on: false }, { route: "product" }, product)).container.innerHTML).toBe("");
  });
});

describe("in the builder", () => {
  it("offers a Rewards section ready made, with both blocks", () => {
    const rewards = PRESETS.find((p) => p.key === "rewards")!.create();
    expect(rewards.children!.map((c) => c.type)).toEqual(["loyalty_program", "loyalty_referral"]);
  });

  it("keeps a hidden earn line hidden whatever the element's own styles say", () => {
    expect(BASE_CSS).toContain(".bsite :where(.b-loyal-earn[hidden]){display:none}");
  });
});
