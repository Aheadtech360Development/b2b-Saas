/**
 * A shop's sign-up (design screen 6) and a partner's code. A partner's link
 * leaves a cookie that can outlive its click: the program's cookie window was
 * shortened, the browser kept the cookie, and the server no longer counts the
 * click. The code used to be unreachable whenever a cookie was there, so the
 * shop was saved to nobody. Now there is always a way to type one, and a typed
 * code goes with the cookie for the server to fall back on.
 *
 * The first screen only checks the email and holds the details in the tab's
 * memory (lib/pendingSignup); the shop is made on the next screen, which sends
 * the held cookie and code (onboarding-wizard.test.tsx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("plan=starter"),
  useRouter: () => ({ replace: vi.fn(), push }),
}));

const posted: { path: string; body: Record<string, unknown> }[] = [];
let checkAnswer: "ok" | "taken" = "ok";
vi.mock("@/lib/api-client", () => {
  class ApiClientError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  }
  const get = (path: string) => {
    if (path === "/api/v1/signup/plans") return Promise.resolve({ plans: [{ key: "starter", name: "Starter" }] });
    if (path.startsWith("/api/v1/partners/codes/")) return Promise.resolve({ valid: true });
    return Promise.reject(new Error(`no answer for ${path}`));
  };
  return {
    ApiClientError,
    apiClient: {
      get,
      post: (path: string, body: Record<string, unknown>) => {
        posted.push({ path, body });
        return checkAnswer === "ok"
          ? Promise.resolve({ ok: true })
          : Promise.reject(new ApiClientError(409, "That email already has an account here."));
      },
    },
  };
});

vi.mock("@/components/auth/AuthPage", async () => {
  const ui = new Proxy({}, { get: (_t, k) => String(k) });
  return {
    ui,
    // printcopilot.co: the side this page belongs to.
    useOnlyOn: () => false,
    AuthPage: ({ title, sub, children }: { title?: string; sub?: string; children: React.ReactNode }) => (
      <div><h1>{title}</h1><p>{sub}</p>{children}</div>
    ),
  };
});

import SignupPage from "@/app/(auth)/signup/page";
import { dropSignup, readSignup } from "@/lib/pendingSignup";

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function signUp(code: string) {
  render(<SignupPage />);
  await screen.findByText("Start your 14 day free trial");
  fill(/^Work email/, "owner@torresprint.com");
  fireEvent.change(document.querySelector("input[autocomplete='new-password']")!, { target: { value: "Partner2026!" } });
  if (code) {
    fireEvent.click(screen.getByRole("button", { name: "Have a partner code?" }));
    fill(/^Partner code/, code);
  }
  fireEvent.click(screen.getByRole("button", { name: "Create my store" }));
  await waitFor(() => expect(posted).toHaveLength(1));
}

beforeEach(() => { posted.length = 0; push.mockReset(); checkAnswer = "ok"; dropSignup(); });
afterEach(() => { document.cookie = "pc_ref=; Max-Age=0; Path=/"; });

describe("the partner code at sign-up", () => {
  it("can be typed and goes along even when a partner's cookie is there", async () => {
    document.cookie = "pc_ref=MARIA.7; Path=/";
    await signUp("LINH");
    expect(screen.getByText("Referred by a PrintCoPilot partner (MARIA).")).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding"));
    expect(readSignup()).toMatchObject({ referralCookie: "MARIA.7", referralCode: "LINH", plan: "starter" });
  });

  it("goes alone without a cookie, and is left out when nobody typed one", async () => {
    await signUp("LINH");
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(readSignup()).toMatchObject({ referralCookie: null, referralCode: "LINH" });
  });

  it("sends no code when none was typed", async () => {
    document.cookie = "pc_ref=MARIA.7; Path=/";
    await signUp("");
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(readSignup()).toMatchObject({ referralCookie: "MARIA.7", referralCode: null });
  });
});

describe("the first screen", () => {
  it("checks only the email, and holds the password in memory for the next screen", async () => {
    await signUp("");
    expect(posted[0]).toEqual({ path: "/api/v1/signup/check", body: { email: "owner@torresprint.com" } });
    await waitFor(() => expect(readSignup()?.password).toBe("Partner2026!"));
  });

  it("sends somebody who already has a store to sign in, and holds nothing", async () => {
    checkAnswer = "taken";
    await signUp("");
    expect(await screen.findByText(/already has an account with us/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in instead" })).toHaveAttribute("href", "/login");
    expect(push).not.toHaveBeenCalled();
    expect(readSignup()).toBeNull();
  });
});
