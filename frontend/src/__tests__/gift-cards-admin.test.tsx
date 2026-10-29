/**
 * Marketing → Gift cards (api/v1/gift_cards.py): the list shows codes masked,
 * an issued card's code is shown once with a way to copy it, a card's history
 * is listed, and a balance never changes without a reason.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const askText = vi.fn();
const ask = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a),
  },
}));
vi.mock("@/lib/dialog", () => ({ ask: (...a: unknown[]) => ask(...a), askText: (...a: unknown[]) => askText(...a) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import GiftCardsPage from "@/app/(admin)/admin/gift-cards/page";

const card = {
  id: "c1", last4: "T1VB", masked: "•••• T1VB", initial_amount: 50, balance: 28, currency: "usd", status: "active",
  status_reason: null, source: "manual", expires_at: null, purchase_order_id: null, buyer_email: null,
  recipient_name: "Ann", recipient_email: "ann@example.com", sender_name: null, message: null, note: null,
  delivered_at: null, created_at: "2026-10-29T10:00:00Z",
};
const detail = {
  ...card, purchase_order_number: null, held: 0, ledger_matches: true,
  ledger: [
    { id: "l2", kind: "capture", amount: 0, balance_after: 28, order_id: "o1", order_number: "1051", actor_name: null, reason: "Paid for an order", created_at: "2026-10-29T11:00:00Z" },
    { id: "l1", kind: "hold", amount: -22, balance_after: 28, order_id: null, order_number: null, actor_name: null, reason: "Set aside at checkout", created_at: "2026-10-29T10:59:00Z" },
    { id: "l0", kind: "issue", amount: 50, balance_after: 50, order_id: null, order_number: null, actor_name: "Owner", reason: "Issued by the shop", created_at: "2026-10-29T10:00:00Z" },
  ],
};
const report = { sold: 0, issued_by_shop: 50, store_credit: 0, redeemed: 22, refunded_to_cards: 0, held_at_checkout: 0, outstanding: 28, cards: { active: 1 } };
const settings = { enabled: false, amounts: [25, 50, 100], custom: false, custom_min: 10, custom_max: 500, expiry_months: 0, message: "", expiry_choices: [0, 60, 84, 120], max_amount: 2000 };

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); askText.mockReset(); ask.mockReset();
  get.mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/admin/gift-cards?")) return Promise.resolve({ items: [card], total: 1 });
    if (url === "/api/v1/admin/gift-cards/report") return Promise.resolve(report);
    if (url === "/api/v1/admin/gift-cards/settings") return Promise.resolve(settings);
    if (url === "/api/v1/admin/gift-cards/c1") return Promise.resolve(detail);
    return Promise.reject(new Error(url));
  });
});

describe("gift cards in the admin", () => {
  it("lists cards masked, with what is still owed, and says when sales are off", async () => {
    render(<GiftCardsPage />);
    expect(await screen.findByText("•••• T1VB")).toBeInTheDocument();
    expect(screen.getByText("Still owed").previousSibling).toHaveTextContent("$28.00");
    expect(screen.getByText(/not on sale in your shop/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/);
  });

  it("shows an issued card's code once, to copy, and sends one request per press", async () => {
    post.mockResolvedValue({ card: { ...card, balance: 25, initial_amount: 25 }, code: "7K3M-9QX2-4PZ8-T1VB", emailed: false });
    render(<GiftCardsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Issue gift card/ }));
    fireEvent.change(screen.getByLabelText("Amount ($)"), { target: { value: "25" } });
    const issue = screen.getAllByRole("button", { name: "Issue gift card" }).pop()!;
    fireEvent.click(issue);
    expect(await screen.findByText("7K3M-9QX2-4PZ8-T1VB")).toBeInTheDocument();
    expect(screen.getByText(/only time the full code is shown/)).toBeInTheDocument();
    const body = post.mock.calls[0]![1] as { amount: number; request_id: string; source: string };
    expect(post.mock.calls[0]![0]).toBe("/api/v1/admin/gift-cards");
    expect(body.amount).toBe(25);
    expect(body.source).toBe("manual");
    expect(body.request_id.length).toBeGreaterThan(8);
  });

  it("lists a card's history and will not change a balance without a reason", async () => {
    render(<GiftCardsPage />);
    fireEvent.click(await screen.findByText("•••• T1VB"));
    expect(await screen.findByText("Spent on an order")).toBeInTheDocument();
    expect(screen.getByText("Set aside at checkout")).toBeInTheDocument();
    askText.mockResolvedValueOnce("10").mockResolvedValueOnce("");
    fireEvent.click(screen.getByRole("button", { name: "Adjust balance" }));
    await waitFor(() => expect(askText).toHaveBeenCalledTimes(2));
    expect(post).not.toHaveBeenCalled();

    askText.mockResolvedValueOnce("10").mockResolvedValueOnce("Goodwill");
    post.mockResolvedValue({ ...card, balance: 38 });
    fireEvent.click(screen.getByRole("button", { name: "Adjust balance" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![0]).toBe("/api/v1/admin/gift-cards/c1/adjust");
    expect(post.mock.calls[0]![1]).toMatchObject({ amount: 10, reason: "Goodwill" });
  });

  it("saves the shop's settings, refusing an amount it cannot sell", async () => {
    put.mockResolvedValue({ ...settings, enabled: true });
    render(<GiftCardsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Settings/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Sell gift cards" }));
    fireEvent.change(screen.getByLabelText("Amounts ($)"), { target: { value: "25, 5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("between $1 and $2000");
    expect(put).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Amounts ($)"), { target: { value: "25, 50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]![1]).toMatchObject({ enabled: true, amounts: [25, 50], expiry_months: 0 });
  });
});
