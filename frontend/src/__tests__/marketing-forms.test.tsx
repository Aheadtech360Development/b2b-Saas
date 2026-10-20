/**
 * printcopilot.co's forms go to our own backend, not an outside CRM: a demo
 * request to /api/v1/leads (kept for the console's Leads), and the affiliate
 * page's form is the partner program's own application, with its terms.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

const posted: { path: string; body: unknown }[] = [];
vi.mock("@/lib/api-client", () => {
  class ApiClientError extends Error {}
  return {
    ApiClientError,
    apiClient: {
      post: (path: string, body: unknown) => { posted.push({ path, body }); return Promise.resolve({ ok: true }); },
      get: () => Promise.resolve({}),
    },
  };
});

let program: Record<string, unknown> | null = null;
const applied: unknown[] = [];
vi.mock("@/lib/partnerApi", () => ({
  papi: (path: string, opts: { body?: unknown } = {}) => {
    if (path === "/partners/program") return Promise.resolve(program);
    if (path === "/partners/apply") { applied.push(opts.body); return Promise.resolve({ ok: true, status: "waiting" }); }
    return Promise.reject(new Error(`no answer for ${path}`));
  },
}));

import DemoPage from "@/components/marketing/pages/Demo";
import PartnersPage from "@/components/marketing/pages/Partners";

const field = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)!;

beforeEach(() => {
  posted.length = 0;
  applied.length = 0;
  program = {
    accepting_applications: true, accepting_referrals: true, standard_rate: "20%", standard_rate_bps: 2000,
    examples: [], hold_days: 30, minimum_payout_cents: 5000, cookie_days: 90, support_email: null,
    application_response_days: 2,
    terms: { version: 3, published_at: "2026-10-15", clauses: [{ title: "Payouts", text: "Paid monthly." }] },
  };
});

describe("the demo request", () => {
  it("is kept in our own database", async () => {
    const { container } = render(<DemoPage />);
    fireEvent.change(field(container, "name"), { target: { value: "Ana Torres" } });
    fireEvent.change(field(container, "email"), { target: { value: "ana@torrestees.com" } });
    fireEvent.change(field(container, "biz"), { target: { value: "Torres Tees" } });
    fireEvent.change(field(container, "sell"), { target: { value: "DTF transfers" } });
    fireEvent.submit(field(container, "name").closest("form")!);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.path).toBe("/api/v1/leads");
    expect(posted[0]!.body).toMatchObject({
      kind: "demo", name: "Ana Torres", email: "ana@torrestees.com",
      data: { business_name: "Torres Tees", message: "DTF transfers" }, company: "",
    });
  });
});

describe("the affiliate page", () => {
  it("applies to the partner program with its current terms", async () => {
    const { container } = render(<PartnersPage />);
    expect(await screen.findByRole("link", { name: "Apply to join" })).toHaveAttribute("href", "#apply");
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute("href", "/partners/login");

    fireEvent.change(field(container, "name"), { target: { value: "Linh Pham" } });
    fireEvent.change(field(container, "email"), { target: { value: "linh@printcoach.com" } });
    fireEvent.change(field(container, "site"), { target: { value: "https://printcoach.com" } });
    fireEvent.change(field(container, "how"), { target: { value: "Creator or community" } });
    fireEvent.change(field(container, "promote"), { target: { value: "My newsletter for 4,000 print shops" } });
    const send = screen.getByRole("button", { name: "Apply to join" });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(send.closest("form")!);

    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({
      name: "Linh Pham", email: "linh@printcoach.com", website: "https://printcoach.com",
      promote_how: "Creator or community. My newsletter for 4,000 print shops",
      terms_version: 3, accept_terms: true, company: null,
    });
    expect(await screen.findByText("We read every application ourselves and usually answer within 2 working days.")).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });

  it("says so when the program is not taking applications", async () => {
    program = { ...program, accepting_applications: false };
    render(<PartnersPage />);
    expect(await screen.findByText("We are not taking applications right now. Please check back soon.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apply to join" })).toBeNull();
  });
});
