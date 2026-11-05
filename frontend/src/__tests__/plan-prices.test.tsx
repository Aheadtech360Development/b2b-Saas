/**
 * Plan prices the super admin sets (backend services/plan_prices): the console's
 * Plans page changes them, and every price on the platform's website (home,
 * pricing, retail, affiliate) is the price in force, not one typed into the page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const get = vi.fn();
const put = vi.fn();
const ask = vi.fn();
const tell = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...a), post: vi.fn(), put: (...a: unknown[]) => put(...a),
    patch: vi.fn(), delete: vi.fn(), postForm: vi.fn(),
  },
  ApiClientError: class extends Error {},
}));
vi.mock("@/lib/dialog", () => ({ ask: (...a: unknown[]) => ask(...a), tell: (...a: unknown[]) => tell(...a) }));
vi.mock("@/lib/retailLaunch", () => ({ RETAIL_LAUNCHED: true }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/lib/partnerApi", () => ({ papi: () => Promise.reject(new Error("offline")) }));

import { DEFAULT_PLAN_PRICES, priceText, pricesFrom } from "@/lib/planPrices";
import { PlanPricesProvider } from "@/lib/planPricesContext";
import { retailDescription } from "@/components/marketing/meta";
import PricingPage from "@/components/marketing/pages/Pricing";
import RetailPricing from "@/components/marketing/pages/RetailPricing";
import RetailPage from "@/components/marketing/pages/Retail";
import HomePage from "@/components/marketing/pages/Home";
import PartnersPage from "@/components/marketing/pages/Partners";
import { PlansPage, centsOf } from "@/components/platform/console/PlansPage";

const SET = { retail: 8900, starter: 9900, wholesale: 31900, scale: 49750 };

beforeEach(() => {
  get.mockReset(); put.mockReset(); ask.mockReset(); tell.mockReset();
  window.history.replaceState(null, "", "/pricing");
});

describe("the price as it reads", () => {
  it("is whole dollars, or dollars and cents", () => {
    expect(priceText(9700)).toBe("$97");
    expect(priceText(49750)).toBe("$497.50");
    expect(priceText(120000)).toBe("$1,200");
  });

  it("comes from the API's plan list, the shipped price for anything it leaves out", () => {
    expect(pricesFrom([{ key: "starter", amount_cents: 9900 }, { key: "gold", amount_cents: 1 }, { key: "scale", amount_cents: 0 }]))
      .toEqual({ ...DEFAULT_PLAN_PRICES, starter: 9900 });
    expect(pricesFrom(null)).toEqual(DEFAULT_PLAN_PRICES);
  });

  it("is in the Retail page's search description", () => {
    expect(retailDescription(8900)).toContain("One plan, $89 a month.");
  });
});

describe("the website", () => {
  it("shows the shipped prices when no price was handed down", () => {
    render(<PricingPage />);
    expect(screen.getAllByText("$97").length).toBeGreaterThan(0);
    expect(screen.getByText("$297 per month")).toBeTruthy();
  });

  it("shows the prices in force on the Pricing page, its comparison and both tabs", () => {
    const { container } = render(<PlanPricesProvider prices={SET}><PricingPage /></PlanPricesProvider>);
    expect(screen.getAllByText("$99").length).toBeGreaterThan(0);
    expect(screen.getByText("$319 per month")).toBeTruthy();
    expect(screen.getByText("$497.50 per month")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\$97\b|\$297\b/);
    fireEvent.click(screen.getByRole("tab", { name: "Retail brands" }));
    expect(screen.getAllByText(/\$89/).length).toBeGreaterThan(0);
  });

  it("works the savings calculator out at the prices in force", () => {
    render(<PlanPricesProvider prices={SET}><PricingPage /></PlanPricesProvider>);
    // $10,000 of gang sheet sales on Starter: $99 + 2.8% = $379.
    expect(screen.getAllByText("$379").length).toBeGreaterThan(0);
  });

  it("shows them on the home page and the Retail pages", () => {
    const home = render(<PlanPricesProvider prices={SET}><HomePage /></PlanPricesProvider>);
    expect(screen.getAllByText("$99").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$319").length).toBeGreaterThan(0);
    home.unmount();
    const retail = render(<PlanPricesProvider prices={SET}><RetailPage /></PlanPricesProvider>);
    expect(retail.container.textContent).toContain("$89");
    expect(retail.container.textContent).not.toContain("$79");
    retail.unmount();
    const tab = render(<PlanPricesProvider prices={SET}><RetailPricing /></PlanPricesProvider>);
    expect(tab.container.textContent).toContain("$89");
  });

  it("works the affiliate example out at 20% of the Wholesale price in force", () => {
    render(<PlanPricesProvider prices={SET}><PartnersPage /></PlanPricesProvider>);
    expect(screen.getAllByText("$63.80").length).toBeGreaterThan(0);
  });
});

const PLAN = (key: string, name: string, cents: number, def: number) => ({
  key, name, amount_cents: cents, default_amount_cents: def, price_display: `${priceText(cents)}/mo`,
  commission_display: "2.8%", commission_bps: 280, features: [], highlights: [], description: "",
  limits: { orders_per_month: 300, staff_accounts: 3, custom_domains: 1 },
});

function answer(plans = [PLAN("retail", "Retail", 7900, 7900), PLAN("starter", "Starter", 9700, 9700)]) {
  get.mockImplementation((url: string) => Promise.resolve(
    url.includes("/billing/plans") ? { plans } : { items: [], totals: { brands: 0, active: 0, suspended: 0, users: 0 } },
  ));
}

describe("the console's Plans page", () => {
  it("reads what is typed as a price, and nothing else", () => {
    expect(centsOf("99")).toBe(9900);
    expect(centsOf("$1,200.50")).toBe(120050);
    expect(centsOf("0.5")).toBeNull();
    expect(centsOf("12.345")).toBeNull();
    expect(centsOf("ten")).toBeNull();
    expect(centsOf("10001")).toBeNull();
  });

  it("changes a plan's price after saying who pays it", async () => {
    answer();
    ask.mockResolvedValue(true);
    put.mockResolvedValue({ changed: ["starter"], stripe: { starter: "ready" }, plans: [] });
    render(<PlansPage />);

    const box = await screen.findByLabelText("Starter");
    const save = screen.getByRole("button", { name: "Save prices" }) as HTMLButtonElement;
    expect((box as HTMLInputElement).value).toBe("97");
    expect(save.disabled).toBe(true);

    fireEvent.change(box, { target: { value: "99" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(ask.mock.calls[0]?.[0]).toContain("Starter: $97 to $99 a month.");
    expect(ask.mock.calls[0]?.[0]).toContain("Brands already paying keep the price they are on.");
    expect(put).toHaveBeenCalledWith("/api/v1/platform/billing/plans/prices", { prices: { starter: 9900 } });
    await waitFor(() => expect(tell).toHaveBeenCalledWith("Saved. Stripe has the new prices.", { title: "Prices changed" }));
  });

  it("saves nothing when the change is not confirmed, or the price is not a price", async () => {
    answer();
    ask.mockResolvedValue(false);
    render(<PlansPage />);
    const box = await screen.findByLabelText("Starter");
    const save = screen.getByRole("button", { name: "Save prices" }) as HTMLButtonElement;

    fireEvent.change(box, { target: { value: "0" } });
    expect(save.disabled).toBe(true);
    expect(screen.getByText("Between $1 and $10,000")).toBeTruthy();

    fireEvent.change(box, { target: { value: "99" } });
    fireEvent.click(save);
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(put).not.toHaveBeenCalled();
  });

  it("says when Stripe has not got a new price yet, and shows a plan's default beside a changed price", async () => {
    answer([PLAN("retail", "Retail", 8900, 7900), PLAN("starter", "Starter", 9700, 9700)]);
    ask.mockResolvedValue(true);
    put.mockResolvedValue({ changed: ["starter"], stripe: { starter: "pending" }, plans: [] });
    render(<PlansPage />);

    await screen.findByLabelText("Retail");
    expect(screen.getByText("Default $79")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Starter"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Save prices" }));
    await waitFor(() => expect(tell).toHaveBeenCalled());
    expect(tell.mock.calls[0]?.[0]).toContain("Stripe did not answer for Starter");
  });
});
