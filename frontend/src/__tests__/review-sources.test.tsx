/**
 * Where a shop's reviews come from (backend services/review_sources): the
 * "Reviews from…" block for its customers, Google and Yelp; Yelp's snippet
 * rebuilt from checked values only; the review rules on a product page; and
 * the Marketing → Reviews panel that sets it all up.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const who: { user: null | { is_admin: boolean; first_name?: string }; isLoading: boolean } = { user: null, isLoading: false };
vi.mock("@/stores/auth.store", () => ({ useAuthStore: (pick: (s: typeof who) => unknown) => pick(who) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a),
    put: (...a: unknown[]) => put(...a), delete: (...a: unknown[]) => del(...a),
  },
  ApiClientError: class extends Error {},
}));
vi.mock("@/lib/dialog", () => ({ ask: vi.fn(async () => true) }));

import { Tree, type RenderCtx } from "@/components/builder/render";
import Reviews from "@/components/builder/islands/Reviews";
import { yelpSnippet } from "@/components/builder/islands/YelpEmbeds";
import { ReviewSources } from "@/components/admin/reviews/ReviewSources";
import { BY_TYPE } from "@/lib/builder/registry";
import type { BuilderNode, StoreReviewsInfo } from "@/lib/builder/types";

const GOOGLE: StoreReviewsInfo["google"] = {
  name: "Heavy Tees", rating: 4.7, total: 212, maps_url: "https://maps.google.com/?cid=1",
  reviews: Array.from({ length: 6 }, (_, i) => ({
    rating: 5 - (i % 2), text: `Google review ${i + 1}`, author: `Author ${i + 1}`,
    author_url: "https://www.google.com/maps/contrib/1", author_photo: "https://lh3.googleusercontent.com/a/x",
    when: "a month ago", url: "https://www.google.com/maps/reviews/1", report_url: "https://www.google.com/local/review/rap/report?x=1",
  })),
};
const YELP_REVIEW = {
  id: "QDHdkqBtpPonxjHrzeviNA", author: "Krsna V.", author_url: "https://www.yelp.com/user_details?userid=o84KZeqgy0YGLmz5I9P-pg",
  review_url: "https://www.yelp.com/biz/badlands-national-park-interior?hrid=QDHdkqBtpPonxjHrzeviNA", business: "Badlands National Park",
};
const SHOP: StoreReviewsInfo["shop"] = {
  total: 2, avg: 4.5,
  items: [
    { rating: 5, title: "Great", body: "Soft and thick.", name: "Jane S.", company: "", verified: true, image: "", reply: "",
      date: "2025-02-01", product: "Heavy Tee", productUrl: "/products/heavy-tee" },
    { rating: 4, title: "", body: "Shop was quick.", name: "Sam K.", company: "", verified: false, image: "", reply: "",
      date: "2025-01-01", product: "", productUrl: "" },
  ],
};

function ctx(storeReviews: StoreReviewsInfo | null | undefined, edit = false): RenderCtx {
  return {
    data: { product: null, collection: null, collectionPage: null, menus: {}, grids: {}, collectionGrids: {},
            store: { name: "Shop", logo: "" }, storeReviews },
    globals: {}, page: null, query: "", route: "home", edit,
  };
}
const block = (props: Record<string, unknown> = {}): BuilderNode => {
  const n = BY_TYPE.store_reviews!.create();
  return { ...n, id: "sr1", props: { ...n.props, ...props } };
};
const draw = (node: BuilderNode, c: RenderCtx) => render(<Tree tree={node} ctx={c} />);

beforeEach(() => {
  who.user = null; who.isLoading = false;
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
});

describe("the Reviews from… block", () => {
  it("starts as the shop's own customers, six of them", () => {
    expect(block().props).toMatchObject({ source: "shop", limit: 6, heading: "What our customers say" });
  });

  it("shows the shop's reviews with Verified buyer only where it is true, and the product", () => {
    const { container } = draw(block(), ctx({ shop: SHOP, google: null, yelp: null }));
    expect(screen.getByText("4.5")).toBeTruthy();
    expect(screen.getByText(/2 reviews/)).toBeTruthy();
    const by = [...container.querySelectorAll(".b-rev-by")].map((n) => n.textContent);
    expect(by[0]).toContain("Verified buyer");
    expect(by[1]).not.toContain("Verified buyer");
    expect(container.querySelector("a.b-srev-product")?.getAttribute("href")).toBe("/products/heavy-tee");
  });

  it("shows Google's own rating and count, at most five reviews, each with its author and a Report link", () => {
    const { container } = draw(block({ source: "google", limit: 12 }), ctx({ shop: null, google: GOOGLE, yelp: null }));
    expect(screen.getByText(/212 reviews on Google/)).toBeTruthy();
    expect(container.querySelectorAll(".b-srev-card")).toHaveLength(5);
    expect(screen.getAllByText("Report")).toHaveLength(5);
    expect(screen.getByText("Author 1").closest("a")?.getAttribute("href")).toBe("https://www.google.com/maps/contrib/1");
    expect(container.querySelector(".b-srev-credit")?.textContent).toBe("Reviews from Google Maps");
  });

  it("draws Yelp's snippet and links the Yelp page", () => {
    const { container } = draw(block({ source: "yelp" }),
      ctx({ shop: null, google: null, yelp: { url: "https://www.yelp.com/biz/badlands-national-park-interior", reviews: [YELP_REVIEW] } }));
    const span = container.querySelector("span.yelp-review");
    expect(span?.getAttribute("data-review-id")).toBe(YELP_REVIEW.id);
    expect(screen.getByText("Read our reviews on Yelp").getAttribute("href")).toBe("https://www.yelp.com/biz/badlands-national-park-interior");
  });

  it("shows nothing on the shop when a source is not set up, and says where to set it up in the editor", () => {
    const empty = { shop: { total: 0, avg: 0, items: [] }, google: null, yelp: null };
    for (const source of ["shop", "google", "yelp"]) {
      const live = draw(block({ source }), ctx(empty));
      expect(live.container.textContent).toBe("");
      live.unmount();
    }
    draw(block({ source: "google" }), ctx(empty, true));
    expect(screen.getByText(/Marketing, Reviews/)).toBeTruthy();
  });
});

describe("Yelp's snippet", () => {
  it("is rebuilt from checked values, every word escaped", () => {
    const html = yelpSnippet({ ...YELP_REVIEW, author: `<img src=x onerror=alert(1)>`, business: `"Bob's" & Co` });
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&quot;Bob&#39;s&quot; &amp; Co");
    expect(html).not.toContain("<img");
  });

  it("is left out for anything that is not a Yelp review", () => {
    expect(yelpSnippet({ ...YELP_REVIEW, review_url: "javascript:alert(1)" })).toBe("");
    expect(yelpSnippet({ ...YELP_REVIEW, review_url: "https://evil.example/biz/x" })).toBe("");
    expect(yelpSnippet({ ...YELP_REVIEW, id: "bad id" })).toBe("");
    expect(yelpSnippet({ ...YELP_REVIEW, author_url: "https://evil.example/u" })).toContain("Read this ");
  });
});

describe("writing a review on a product page", () => {
  const props = { id: "rv", productId: "p1", heading: "Reviews", items: [], total: 0, avg: 0, allowWrite: true };

  it("tells a customer who may not review it why, before they write", async () => {
    who.user = { is_admin: false, first_name: "Ana" };
    get.mockResolvedValueOnce({ ok: false, reason: "Only customers who bought this product can review it." });
    render(<Reviews {...props} />);
    await act(async () => { fireEvent.click(await screen.findByText("Write a review")); });
    expect(await screen.findByText("Only customers who bought this product can review it.")).toBeTruthy();
    expect(screen.queryByLabelText("Your review")).toBeNull();
  });

  it("says a review waits for the shop when the shop checks them first, and does not list it", async () => {
    who.user = { is_admin: false, first_name: "Ana" };
    get.mockResolvedValueOnce({ ok: true, reason: null });
    post.mockResolvedValueOnce({ is_verified: true, is_approved: false });
    render(<Reviews {...props} />);
    await act(async () => { fireEvent.click(await screen.findByText("Write a review")); });
    fireEvent.change(await screen.findByLabelText("Your review"), { target: { value: "Bought it and it is great." } });
    await act(async () => { fireEvent.click(screen.getByText("Post review")); });
    expect(await screen.findByText(/will show once the shop has read it/)).toBeTruthy();
    expect(screen.queryByText("Bought it and it is great.")).toBeNull();
  });
});

describe("Marketing → Reviews: where reviews come from", () => {
  const OVERVIEW = {
    rules: { who: "signed_in", hold: false },
    judgeme: { connected: false },
    google_place: { configured: true, place: null, error: null },
    yelp: {},
    counts: { site: { shown: 3, hidden: 1 } },
  };

  it("shows the rules, Google, Judge.me and Yelp, and never asks for a token it already has", async () => {
    get.mockResolvedValueOnce(OVERVIEW);
    const { container } = render(<ReviewSources />);
    await waitFor(() => expect(container.querySelector("[data-card=rules]")).toBeTruthy());
    for (const card of ["rules", "google", "judgeme", "yelp"]) expect(container.querySelector(`[data-card=${card}]`)).toBeTruthy();
    expect(screen.getByText(/3 reviews written on your shop/)).toBeTruthy();
    const connect = screen.getByText("Connect and import").closest("button")!;
    expect(connect.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Shop domain"), { target: { value: "heavy-tees" } });
    fireEvent.change(screen.getByLabelText("Private API token"), { target: { value: "secret-token-1" } });
    expect(connect.disabled).toBe(false);
  });

  it("saves who may write a review at once", async () => {
    get.mockResolvedValueOnce(OVERVIEW);
    put.mockResolvedValueOnce({ who: "buyers", hold: false });
    render(<ReviewSources />);
    const buyers = await screen.findByLabelText("Only customers who bought the product");
    await act(async () => { fireEvent.click(buyers); });
    expect(put).toHaveBeenCalledWith("/api/v1/admin/review-sources/rules", { who: "buyers", hold: false });
    expect(await screen.findByText("Saved.")).toBeTruthy();
  });

  it("shows what a connected Judge.me brought in, and the products it could not match", async () => {
    get.mockResolvedValueOnce({
      ...OVERVIEW,
      judgeme: { connected: true, shop_domain: "heavy-tees.myshopify.com", shop_name: "Heavy Tees", token_hint: "••••ab12",
                 imported: 140, store_reviews: 12, unmatched: 3, unmatched_handles: ["old-hoodie"], last_synced_at: "2026-11-13T10:00:00Z" },
    });
    render(<ReviewSources />);
    expect(await screen.findByText(/140 reviews imported, 12 about the store/)).toBeTruthy();
    expect(screen.getByText(/old-hoodie/)).toBeTruthy();
    expect(screen.queryByLabelText("Private API token")).toBeNull();
  });
});
