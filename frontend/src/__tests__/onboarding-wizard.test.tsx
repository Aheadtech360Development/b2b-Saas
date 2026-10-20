/**
 * The owner's setup steps (/onboarding, design screens 7 to 11).
 *
 * Straight from the sign-up's first screen, step 1 makes the shop with the
 * email and password held in the tab and signs the owner in; signed in, the
 * steps open where the owner left off, each row says what the shop has, and
 * "Open my store" finishes the steps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "auth-sans", className: "" }),
  Outfit: () => ({ variable: "auth-display", className: "" }),
}));

const push = vi.fn();
const replace = vi.fn();
// One router for the page's whole life, as Next.js gives one.
const router = { push, replace };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/onboarding",
}));

vi.mock("@/app/site-builder/AdminGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/app/(admin)/admin-shell.css", () => ({}));
vi.mock("@/components/admin/shipping/ConnectCarrierDialog", () => ({
  ConnectCarrierDialog: () => <div>carrier dialog</div>,
}));

const calls: { method: string; path: string; body?: unknown }[] = [];
let state: Record<string, unknown> = {};
let taken: string[] = [];
vi.mock("@/lib/api-client", () => {
  class ApiClientError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  }
  const answer = (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (path.startsWith("/api/v1/signup/availability")) {
      const slug = decodeURIComponent(path.split("slug=")[1] ?? "");
      return Promise.resolve({ slug, available: !taken.includes(slug), reason: taken.includes(slug) ? "Already taken." : "" });
    }
    if (path === "/api/v1/signup") return Promise.resolve({ slug: "torres-tees", access_token: "tok.en", next: "/onboarding" });
    if (path === "/api/v1/admin/onboarding" && method === "GET") return Promise.resolve(state);
    if (path === "/api/v1/admin/onboarding" && method === "PUT") {
      state = { ...state, ...(body as object), step: (body as { step?: number }).step ?? state.step,
        finished_at: (body as { finished?: boolean }).finished ? "2026-10-19T20:00:00Z" : state.finished_at };
      return Promise.resolve(state);
    }
    if (path === "/api/v1/admin/onboarding/notify") { state = { ...state, sanmar_notify: true }; return Promise.resolve(state); }
    return Promise.resolve({});
  };
  return {
    ApiClientError,
    apiClient: {
      get: (p: string) => answer("GET", p),
      post: (p: string, b?: unknown) => answer("POST", p, b),
      put: (p: string, b?: unknown) => answer("PUT", p, b),
      patch: (p: string, b?: unknown) => answer("PATCH", p, b),
    },
  };
});

import OnboardingPage from "@/app/onboarding/page";
import { dropSignup, holdSignup } from "@/lib/pendingSignup";

function shop(over: Record<string, unknown> = {}) {
  return {
    started: true, step: 1, reached: 1, business_type: "dtf_operator", country: "US", finished_at: null,
    sanmar_notify: false, shop_name: "Torres Tees", slug: "torres-tees", shop_url: "http://localhost:3000/?tenant=torres-tees",
    trial_days: 14,
    branding: { logo_url: null, primary_color: "#1C3557", font_heading: null, font_body: null },
    products: { count: 0, gang_sheet: 0 }, supplier_connected: false,
    stripe: { connected: false, charges_enabled: false, details_submitted: false },
    carriers: [], pickup: { enabled: true, address: "", set: false, saved: { name: "", street1: "", city: "", state: "", zip: "", hours: "", note: "" } },
    domain: { host: null },
    done: { business: true, branded: false, product: false, payments: false, shipping: false, domain: false },
    ...over,
  };
}

const realLocation = window.location;
beforeEach(() => {
  calls.length = 0; taken = []; push.mockReset(); replace.mockReset(); dropSignup();
});
afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true, writable: true });
});

describe("step 1 before the shop exists", () => {
  it("makes the shop from the held sign-up, at the next free address, and signs the owner in", async () => {
    const fake = { hostname: "localhost", origin: "http://localhost:3000", pathname: "/onboarding", search: "", hash: "", href: "http://localhost:3000/onboarding" };
    Object.defineProperty(window, "location", { value: fake, configurable: true, writable: true });
    taken = ["torres-tees"];
    holdSignup({ email: "ana@torrestees.com", password: "Partner2026!", plan: null, referralCookie: "MARIA.7", referralCode: null });
    render(<OnboardingPage />);

    expect(await screen.findByRole("heading", { name: "What do you run?" })).toBeInTheDocument();
    expect(screen.getByText("Free trial: 14 days")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "DTF operator" }));
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Torres Tees" } });
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "CA" } });
    expect(await screen.findByText("torres-tees-2.printcopilot.co", {}, { timeout: 3000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/api/v1/signup")).toBeTruthy());
    expect(calls.find((c) => c.path === "/api/v1/signup")!.body).toMatchObject({
      email: "ana@torrestees.com", password: "Partner2026!", shop_name: "Torres Tees", slug: "torres-tees-2",
      business_type: "dtf_operator", country: "CA", referral_cookie: "MARIA.7", referral_code: null,
    });
    await waitFor(() => expect(fake.href).toBe("http://localhost:3000/onboarding?tenant=torres-tees#session=tok.en"));
  });
});

describe("the steps, signed in", () => {
  it("open where the owner left off, and Notify me asks once", async () => {
    state = shop({ step: 3, reached: 3 });
    render(<OnboardingPage />);
    expect(await screen.findByRole("heading", { name: "Add what you sell" })).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Notify me" }));
    expect(await screen.findByRole("button", { name: "We will tell you" })).toBeDisabled();
    expect(calls.some((c) => c.path === "/api/v1/admin/onboarding/notify")).toBe(true);
    expect(screen.getByRole("link", { name: "Add product" })).toHaveAttribute("href", "/admin/products/new");
  });

  it("step 1 keeps a new name through the storefront's own save, then moves on", async () => {
    state = shop({ step: 1, reached: 2 });
    render(<OnboardingPage />);
    fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "Torres Tees & Co" } });
    fireEvent.click(screen.getByRole("radio", { name: "Embroiderer" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Make it look like you" })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/api/v1/admin/storefront")!.body).toEqual({ store_name: "Torres Tees & Co" });
    expect(calls.find((c) => c.method === "PUT" && c.path === "/api/v1/admin/onboarding")!.body)
      .toMatchObject({ step: 2, business_type: "embroiderer", country: "US" });
  });

  it("step 5 shows what is done, and Open my store finishes the steps", async () => {
    state = shop({ step: 5, reached: 5, done: { business: true, branded: true, product: false, payments: false, shipping: true, domain: false } });
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    render(<OnboardingPage />);
    expect(await screen.findByRole("heading", { name: "Ready to open your store" })).toBeInTheDocument();
    expect(screen.getByText("You can open now and finish these from Home.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Fix" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Open my store" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/dashboard"));
    expect(calls.find((c) => c.method === "PUT" && c.path === "/api/v1/admin/onboarding")!.body).toMatchObject({ finished: true });
    expect(tab.location.href).toBe("http://localhost:3000/?tenant=torres-tees");
    open.mockRestore();
    fetcher.mockRestore();
  });

  it("says the shop's address is still being switched on when it does not answer yet", async () => {
    state = shop({ step: 5, reached: 5, shop_url: "https://torres-tees.printcopilot.co/" });
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Open my store" }));
    expect(await screen.findByText(/is still being switched on/)).toBeInTheDocument();
    expect(tab.close).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalledWith("/admin/dashboard");
    open.mockRestore();
    fetcher.mockRestore();
  });
});
