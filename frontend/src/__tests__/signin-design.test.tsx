/**
 * The sign-in screens in the design's card (PrintCoPilot Sign Up and
 * Onboarding, screens 1 to 5 and 12): whose page it is decides the mark and
 * the offers, the buyer's register keeps the country, the wholesale form says
 * what happens next once it is sent, and the two-step setup shows a code to
 * scan with its key beside it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "auth-sans", className: "" }),
  Outfit: () => ({ variable: "auth-display", className: "" }),
}));

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace, push }),
  usePathname: () => "/",
}));

let branding: Record<string, unknown> = {};
vi.mock("@/components/providers/BrandingProvider", () => ({
  useBranding: () => ({ store_name: "Torres Print", logo_url: null, support_phone: "", wholesale_signup: true, ...branding }),
}));

const calls: { name: string; args: unknown[] }[] = [];
vi.mock("@/services/auth.service", () => ({
  authService: {
    registerCustomer: (...args: unknown[]) => { calls.push({ name: "registerCustomer", args }); return Promise.resolve({ access_token: "t" }); },
    registerWholesale: (...args: unknown[]) => { calls.push({ name: "registerWholesale", args }); return Promise.resolve({ id: "a1", status: "pending" }); },
    forgotPassword: (...args: unknown[]) => { calls.push({ name: "forgotPassword", args }); return Promise.resolve(); },
    login: () => Promise.reject(new Error("not in this test")),
    twoFaStatus: () => Promise.resolve({ enabled: false }),
    twoFaSetup: () => Promise.resolve({ secret: "JBSWY3DPEHPK3PXP", otpauth_uri: "otpauth://totp/x", qr_svg: "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E" }),
    twoFaEnable: (code: string) => { calls.push({ name: "twoFaEnable", args: [code] }); return Promise.resolve({ enabled: true, backup_codes: ["aaaa-bbbb", "cccc-dddd"] }); },
  },
}));
vi.mock("@/lib/session", () => ({ establishSession: () => Promise.resolve() }));
vi.mock("@/lib/tracking", () => ({ trackSignUp: () => {} }));
vi.mock("@/components/admin/settings/SettingsFrame", () => ({
  SettingsFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AuthWhereProvider } from "@/components/auth/AuthPage";
import LoginPage from "@/app/(auth)/login/page";
import CreateAccountPage from "@/app/(auth)/create-account/page";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import WholesaleRegisterPage from "@/app/(auth)/wholesale/register/page";
import SignupPage from "@/app/(auth)/signup/page";
import SecurityPage from "@/app/(admin)/admin/settings/security/page";

const onShop = (ui: React.ReactNode) => render(<AuthWhereProvider platform={false} shopName="Torres Print">{ui}</AuthWhereProvider>);
const onPlatform = (ui: React.ReactNode) => render(<AuthWhereProvider platform shopName={null}>{ui}</AuthWhereProvider>);
const fill = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => { calls.length = 0; branding = {}; replace.mockReset(); push.mockReset(); });

describe("sign in", () => {
  it("on a shop wears the shop's name and offers an account and the wholesale application", () => {
    onShop(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Welcome back.")).toBeInTheDocument();
    expect(screen.getByText("Torres Print")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/create-account?next=/account");
    expect(screen.getByRole("link", { name: "apply for a wholesale account" })).toHaveAttribute("href", "/wholesale/register");
  });

  it("on a retail shop does not offer an application nobody can read", () => {
    branding = { wholesale_signup: false };
    onShop(<LoginPage />);
    expect(screen.queryByRole("link", { name: "apply for a wholesale account" })).toBeNull();
  });

  it("on printcopilot.co wears PrintCoPilot and offers the free trial", () => {
    onPlatform(<LoginPage />);
    // The logo, not the name in text.
    expect(screen.getByRole("img", { name: "PrintCoPilot" })).toHaveAttribute("src", "/icon_navy_128.png");
    expect(screen.queryByText("PrintCoPilot")).toBeNull();
    expect(screen.getByRole("link", { name: "Start your 14 day free trial" })).toHaveAttribute("href", "/signup");
    expect(screen.queryByRole("link", { name: "apply for a wholesale account" })).toBeNull();
  });
});

describe("a buyer's account", () => {
  it("keeps the country, by name", async () => {
    onShop(<CreateAccountPage />);
    fill(/^First name/, "Maria");
    fill(/^Email/, "maria@shop.com");
    fireEvent.change(document.querySelector("input[autocomplete='new-password']")!, { target: { value: "Buyer2026!" } });
    fill(/^Country/, "CA");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(calls.find((c) => c.name === "registerCustomer")).toBeTruthy());
    expect(calls[0]!.args[0]).toMatchObject({ first_name: "Maria", email: "maria@shop.com", country: "Canada" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("says the one password rule", () => {
    onShop(<CreateAccountPage />);
    expect(screen.getByText("At least 8 characters. One password rule for the whole site.")).toBeInTheDocument();
  });
});

describe("forgot your password", () => {
  it("says a link is on its way whatever the address, and keeps the way back", async () => {
    onShop(<ForgotPasswordPage />);
    fill(/^Email/, "who@shop.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText(/If that email has an account, a link is on its way/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to sign in" })).toHaveAttribute("href", "/login");
  });
});

describe("the wholesale application", () => {
  it("has the design's four boxes and, once sent, says what happens next", async () => {
    onShop(<WholesaleRegisterPage />);
    for (const box of ["Company", "Contact", "Business address", "About your business"]) {
      expect(screen.getByRole("heading", { name: box })).toBeInTheDocument();
    }
    fill(/^Company name/, "Torres Tees LLC");
    fill(/^Trading name/, "Torres Tees");
    fill(/^Business type/, "Print shop");
    fill(/^First name/, "Ana");
    fill(/^Last name/, "Torres");
    fill(/^Email/, "ana@torrestees.com");
    fireEvent.change(document.querySelector("input[autocomplete='new-password']")!, { target: { value: "Wholesale26!" } });
    fill(/^Country/, "US");
    fill(/^Expected monthly volume/, "$1,000 to $5,000");
    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
    await waitFor(() => expect(calls.find((c) => c.name === "registerWholesale")).toBeTruthy());
    expect(calls[0]!.args[0]).toMatchObject({
      company_name: "Torres Tees LLC", trading_name: "Torres Tees", business_type: "Print shop",
      country: "United States", expected_monthly_volume: "$1,000 to $5,000", password: "Wholesale26!",
    });
    expect(await screen.findByRole("heading", { name: "We got your application" })).toBeInTheDocument();
    expect(screen.getByText("Torres Tees LLC")).toBeInTheDocument();
    expect(screen.getByText("ana@torrestees.com")).toBeInTheDocument();
    for (const step of ["Application sent", "In review", "Approved, tier and terms set"]) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Back to the store" })).toHaveAttribute("href", "/");
  });
});

describe("each side keeps its own doors", () => {
  it("a shop's address in the card: its logo and its colour from the first paint", () => {
    const { container } = render(
      <AuthWhereProvider platform={false} shopName="Torres Print" logo="https://ik.example/torres.png" primary="#C2410C">
        <ForgotPasswordPage />
      </AuthWhereProvider>,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "https://ik.example/torres.png");
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--brand-primary")).toBe("#C2410C");
  });

  it("starting a store is printcopilot.co's: on a shop it sends the buyer to open an account", async () => {
    onShop(<SignupPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/create-account?next=/account"));
    expect(screen.queryByText("Start your 14 day free trial")).toBeNull();
  });

  it("a buyer's account and a wholesale application are a shop's: printcopilot.co sends them to start a store", async () => {
    onPlatform(<CreateAccountPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/signup"));
    replace.mockReset();
    onPlatform(<WholesaleRegisterPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/signup"));
  });
});

describe("two-step sign-in", () => {
  it("shows a code to scan with its key, and the backup codes once it is on", async () => {
    render(<SecurityPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("heading", { name: "Turn on two-step sign-in" })).toBeInTheDocument();
    expect(screen.getByAltText("QR code for your authenticator app")).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();
    fill(/^Six digit code/, "123456");
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("aaaa-bbbb")).toBeInTheDocument();
    expect(calls.find((c) => c.name === "twoFaEnable")!.args).toEqual(["123456"]);
  });
});
