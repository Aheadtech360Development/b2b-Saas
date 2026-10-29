/**
 * The marketing site's Retail changes (Retail launch, package 6): nothing of
 * them shows until the launch switch is on; then Pricing has a working
 * Retail brands tab and the home page links to /retail. The /retail page
 * claims no sales tool the platform lacks and no unchecked competitor price,
 * and a partner's link is counted once however many pages capture it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const launch = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/retailLaunch", () => ({ get RETAIL_LAUNCHED() { return launch.on; } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const papi = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partnerApi", () => ({ papi: (...a: unknown[]) => papi(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import RetailPage, { RETAIL_HELD } from "@/components/marketing/pages/Retail";
import RetailPricing from "@/components/marketing/pages/RetailPricing";
import PricingPage from "@/components/marketing/pages/Pricing";
import { ReferralCapture } from "@/components/partners/ReferralCapture";

beforeEach(() => {
  launch.on = false;
  papi.mockReset();
  window.history.replaceState(null, "", "/pricing");
});

describe("the /retail page", () => {
  it("sells the Retail plan and links to sign-up on it", () => {
    const { container } = render(<RetailPage />);
    expect(screen.getAllByText(/\$79/).length).toBeGreaterThan(0);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/signup?plan=retail");
    expect(hrefs.some((h) => h?.startsWith("#"))).toBe(false);
    expect(container.querySelector('form[action="/signup"] input[name="plan"][value="retail"]')).not.toBeNull();
  });

  it("claims no sales tool the platform lacks and no unchecked price", () => {
    const { container } = render(<RetailPage />);
    const words = container.textContent ?? "";
    for (const tool of RETAIL_HELD.unbuiltTools) expect(words).not.toContain(tool);
    for (const vendor of ["Shopify Basic", "Judge.me", "Smile.io", "Loop Essential", "Klaviyo", "$200 a month"]) {
      expect(words).not.toContain(vendor);
    }
    expect(words).toContain("Discount codes");
    expect(words).toContain("Gift cards");
    expect(words).toContain("Returns and exchanges");
  });

  it("the Retail pricing tab has no design notes and no held claims", () => {
    const { container } = render(<RetailPricing />);
    const words = container.textContent ?? "";
    expect(words).not.toMatch(/CHANGE \d/);
    expect(words).not.toContain("abandoned cart");
    expect(words).not.toContain("Shopify");
    expect(words).toContain("200 orders a month");
  });
});

describe("the Pricing page", () => {
  it("has no Retail tab until the launch switch is on", () => {
    render(<PricingPage />);
    expect(screen.queryByRole("tab", { name: "Retail brands" })).toBeNull();
  });

  it("switches to Retail brands and back, keeping the address in step", async () => {
    launch.on = true;
    render(<PricingPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Retail brands" }));
    expect(await screen.findByText("For brands selling their own products.")).toBeInTheDocument();
    expect(window.location.search).toBe("?tab=retail");
    fireEvent.click(screen.getByRole("tab", { name: "Print and wholesale" }));
    await waitFor(() => expect(screen.queryByText("For brands selling their own products.")).toBeNull());
    expect(window.location.search).toBe("");
  });

  it("opens on Retail brands from ?tab=retail", async () => {
    launch.on = true;
    window.history.replaceState(null, "", "/pricing?tab=retail");
    render(<PricingPage />);
    expect(await screen.findByText("For brands selling their own products.")).toBeInTheDocument();
  });
});

describe("a partner's link", () => {
  it("is counted once when two pieces of the page capture it", async () => {
    window.history.replaceState(null, "", "/signup?ref=ABC123");
    papi.mockResolvedValue({ ok: true, code: "ABC123", click_id: 7, cookie_days: 90 });
    const seen: string[] = [];
    render(<><ReferralCapture /><ReferralCapture onCaptured={(c) => seen.push(c)} /></>);
    await waitFor(() => expect(seen).toEqual(["ABC123.7"]));
    expect(papi).toHaveBeenCalledTimes(1);
    expect(document.cookie).toContain("pc_ref=ABC123.7");
  });
});
