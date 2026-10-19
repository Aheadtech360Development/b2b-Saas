/**
 * Settings → Notifications (design 34): the list of customer emails, one
 * edited at a time (switch, subject, message), saved for the shop, a test sent
 * to the person signed in, and a preview of what the customer gets.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const ask = vi.fn();
const tell = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a), post: (...a: unknown[]) => post(...a) },
  ApiClientError: class extends Error {},
}));
vi.mock("@/lib/dialog", () => ({ ask: (...a: unknown[]) => ask(...a), tell: (...a: unknown[]) => tell(...a) }));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: () => ({ user: { role: "tenant_admin" } }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import NotificationsPage from "@/app/(admin)/admin/settings/notifications/page";

const row = (key: string, label: string, subject: string, message: string, enabled = true) => ({
  key, label, when: `When ${label.toLowerCase()}.`, enabled, subject, message, custom: false,
  default_subject: subject, default_message: message,
});
const ROWS = [
  row("order_confirmed", "Order confirmed", "We got your order, [order]", "Hi [customer],\nThanks."),
  row("order_shipped", "Order shipped", "Your order [order] has shipped", "Hi [customer],\nTracking: [tracking]."),
  row("refund_issued", "Refund issued", "Your refund for [order]", "Hi [customer],\nRefunded.", false),
];
const subject = () => screen.getByLabelText("Subject") as HTMLInputElement;

beforeEach(() => {
  [get, put, post, ask, tell].forEach((f) => f.mockReset());
  get.mockResolvedValue({ items: ROWS, fields: ["order", "customer", "total", "tracking"] });
  post.mockImplementation(async (url: string, body: { subject: string }) => {
    if (url.endsWith("/preview")) return { subject: body.subject.replace("[order]", "1052"), html: "<p>Hi Jordan</p>" };
    if (url.endsWith("/test")) return { sent_to: "owner@shop.test" };
    throw new Error(`unexpected ${url}`);
  });
  put.mockImplementation(async (url: string, body: { enabled: boolean; subject: string; message: string }) => {
    const key = url.split("/").pop()!;
    return { ...ROWS.find((r) => r.key === key)!, ...body, custom: true };
  });
});

describe("the Notifications settings", () => {
  it("lists every email, opens the first, and previews it with a sample order", async () => {
    render(<NotificationsPage />);
    const list = await screen.findByRole("navigation", { name: "Emails" });
    expect(within(list).getAllByRole("button").map((b) => b.textContent)).toEqual(["Order confirmed", "Order shipped", "Refund issuedOff"]);
    expect(screen.getByRole("heading", { name: "Order confirmed" })).toBeInTheDocument();
    expect(subject().value).toBe("We got your order, [order]");
    expect(screen.getByText(/Fields you can use: \[order\] \[customer\] \[total\] \[tracking\]/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("We got your order, 1052")).toBeInTheDocument());
    expect(screen.getByTitle("Email preview")).toHaveAttribute("srcdoc", "<p>Hi Jordan</p>");
  });

  it("saves the shop's own wording, and only once something changed", async () => {
    render(<NotificationsPage />);
    await screen.findByRole("heading", { name: "Order confirmed" });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(subject(), { target: { value: "Thanks for order [order]" } });
    expect(save).toBeEnabled();
    expect(screen.getByRole("button", { name: "Use the standard wording" })).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() => expect(put).toHaveBeenCalledWith("/api/v1/admin/notifications/order_confirmed",
      { enabled: true, subject: "Thanks for order [order]", message: "Hi [customer],\nThanks." }));
    expect(await screen.findByText("Saved. Customers get this email in these words from now on.")).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it("switches an email off: no preview, and the list says Off once saved", async () => {
    render(<NotificationsPage />);
    await screen.findByRole("heading", { name: "Order confirmed" });
    fireEvent.click(screen.getByRole("switch", { name: "Send this email" }));
    expect(screen.getByText("This email is switched off: customers are not sent it.")).toBeInTheDocument();
    expect(subject()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved. This email is no longer sent.")).toBeInTheDocument();
    const first = within(screen.getByRole("navigation", { name: "Emails" })).getAllByRole("button")[0]!;
    expect(first.textContent).toBe("Order confirmedOff");
  });

  it("asks before leaving an email with unsaved changes", async () => {
    ask.mockResolvedValue(false);
    render(<NotificationsPage />);
    await screen.findByRole("heading", { name: "Order confirmed" });
    fireEvent.change(subject(), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Order shipped" }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Order confirmed" })).toBeInTheDocument();
    ask.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Order shipped" }));
    expect(await screen.findByRole("heading", { name: "Order shipped" })).toBeInTheDocument();
    expect(subject().value).toBe("Your order [order] has shipped");
  });

  it("sends a test, as typed, to the person signed in", async () => {
    render(<NotificationsPage />);
    await screen.findByRole("heading", { name: "Order confirmed" });
    fireEvent.click(screen.getByRole("button", { name: "Send a test" }));
    await waitFor(() => expect(tell).toHaveBeenCalledWith('A test of "Order confirmed" went to owner@shop.test, with a sample order.'));
    expect(post).toHaveBeenCalledWith("/api/v1/admin/notifications/order_confirmed/test",
      { enabled: true, subject: "We got your order, [order]", message: "Hi [customer],\nThanks." });
  });
});
