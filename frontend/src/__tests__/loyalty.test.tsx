/**
 * Loyalty (Retail launch, package 5) in the browser: a friend's ?bref= link
 * is kept until the buyer signs in and claimed once; the Rewards page shows
 * points, turns a reward into a code (one per press), and the referral link;
 * the account menu shows Rewards only for a shop running a program.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { get, post, FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    constructor(status: number, m: string) { super(m); this.status = status; }
  }
  return { get: vi.fn(), post: vi.fn(), FakeApiError };
});
vi.mock("@/lib/api-client", () => ({
  ApiClientError: FakeApiError,
  apiClient: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));

import { captureBuyerReferral, claimBuyerReferral } from "@/lib/buyerReferral";
import { RETAIL_NAV, withRewards } from "@/components/portal/nav";
import RewardsPage from "@/app/(customer)/account/rewards/page";

const rewards = {
  enabled: true, program_name: "VIP", points_name: "stars", points_per_dollar: 2, expiry_months: 12,
  balance: 128, lifetime_earned: 128, tiers: [{ points: 100, reward: 5 }, { points: 300, reward: 20 }],
  history: [{ id: "h1", kind_words: "Earned", points: 48, balance_after: 48, reason: "Order 1051", expires_at: null, created_at: "2026-10-29T10:00:00Z" }],
  codes: [], referral: { code: "K8W99TVM", link: "https://shop.example/?bref=K8W99TVM", you_get: 100, friend_gets: 50, rewarded: 1, pending: 0 },
};

beforeEach(() => {
  get.mockReset(); post.mockReset(); localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("a friend's referral link", () => {
  it("is kept from the address and claimed once the buyer is signed in", async () => {
    window.history.replaceState(null, "", "/?bref=k8w99tvm&utm_source=x");
    captureBuyerReferral();
    expect(localStorage.getItem("pc_bref")).toBe("K8W99TVM");
    post.mockResolvedValue({ status: "pending" });
    await claimBuyerReferral();
    expect(post).toHaveBeenCalledWith("/api/v1/account/rewards/referral", { code: "K8W99TVM" });
    expect(localStorage.getItem("pc_bref")).toBeNull();
  });

  it("ignores a code that cannot be one", () => {
    window.history.replaceState(null, "", "/?bref=<script>");
    captureBuyerReferral();
    expect(localStorage.getItem("pc_bref")).toBeNull();
  });

  it("is kept for another try after a passing failure, dropped after a final no", async () => {
    localStorage.setItem("pc_bref", "K8W99TVM");
    post.mockRejectedValueOnce(new FakeApiError(429, "Too many"));
    await claimBuyerReferral();
    expect(localStorage.getItem("pc_bref")).toBe("K8W99TVM");
    post.mockRejectedValueOnce(new FakeApiError(400, "You were already referred."));
    await claimBuyerReferral();
    expect(localStorage.getItem("pc_bref")).toBeNull();
  });
});

describe("the account menu", () => {
  it("shows Rewards after Orders only when asked", () => {
    const labels = (g: typeof RETAIL_NAV) => g.flatMap((x) => x.items.map((i) => i.label));
    expect(labels(RETAIL_NAV)).not.toContain("Rewards");
    const withIt = labels(withRewards(RETAIL_NAV));
    expect(withIt.indexOf("Rewards")).toBe(withIt.indexOf("Orders") + 1);
    expect(labels(withRewards(withRewards(RETAIL_NAV))).filter((l) => l === "Rewards")).toHaveLength(1);
  });
});

describe("the Rewards page", () => {
  it("shows points, what each reward needs, and the referral link", async () => {
    get.mockResolvedValue(rewards);
    render(<RewardsPage />);
    expect(await screen.findByText("128 stars")).toBeInTheDocument();
    expect(screen.getByText("172 more")).toBeInTheDocument();
    expect(screen.getByLabelText("Your referral link")).toHaveValue("https://shop.example/?bref=K8W99TVM");
  });

  it("turns points into a code, one per press", async () => {
    get.mockResolvedValue(rewards);
    post.mockResolvedValue({ code: "RWD-4YV2R7FP", value: 5, balance: 28 });
    render(<RewardsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Get code" }));
    expect(await screen.findByText("RWD-4YV2R7FP")).toBeInTheDocument();
    const body = post.mock.calls[0]![1] as { points: number; request_id: string };
    expect(post.mock.calls[0]![0]).toBe("/api/v1/account/rewards/redeem");
    expect(body.points).toBe(100);
    expect(body.request_id.length).toBeGreaterThan(8);
  });

  it("says so when the shop has no program", async () => {
    get.mockResolvedValue({ enabled: false });
    render(<RewardsPage />);
    expect(await screen.findByText(/doesn.t have a rewards program/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Get code")).toBeNull());
  });
});
