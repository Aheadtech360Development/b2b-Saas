/**
 * A shop's sign-up and a partner's code. A partner's link leaves a cookie
 * that can outlive its click: the program's cookie window was shortened, the
 * browser kept the cookie, and the server no longer counts the click. The
 * code field used to hide whenever a cookie was there and send no code, so
 * the shop was saved to nobody. Now the field always shows, and a typed code
 * goes with the cookie for the server to fall back on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("plan=starter"),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const posted: Record<string, unknown>[] = [];
vi.mock("@/lib/api-client", () => {
  class ApiClientError extends Error {}
  const get = (path: string) => {
    if (path === "/api/v1/signup/plans") {
      return Promise.resolve({ plans: [{ key: "starter", name: "Starter", price_display: "$97", commission_display: "8%",
                                         description: "", highlights: [], limits_display: "" }] });
    }
    if (path.startsWith("/api/v1/signup/availability")) return Promise.resolve({ available: true, reason: "" });
    if (path.startsWith("/api/v1/partners/codes/")) return Promise.resolve({ valid: true });
    return Promise.reject(new Error(`no answer for ${path}`));
  };
  return {
    ApiClientError,
    apiClient: {
      get,
      // Stops at the request: the page would otherwise go to the new shop.
      post: (_path: string, body: Record<string, unknown>) => { posted.push(body); return Promise.reject(new ApiClientError("stop")); },
    },
  };
});

import SignupPage from "@/app/(auth)/signup/page";

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function signUp(code: string) {
  render(<SignupPage />);
  await screen.findByText("Create your shop");
  fill(/^Shop name/, "Torres Print");
  fill(/^First name/, "Maria");
  fill(/^Email/, "owner@torresprint.com");
  fireEvent.change(document.querySelector("input[autocomplete='new-password']")!, { target: { value: "Partner2026!" } });
  if (code) fill(/^Partner code/, code);
  await waitFor(() => expect(screen.getByText("Available")).toBeInTheDocument(), { timeout: 3000 });
  fireEvent.click(screen.getByRole("button", { name: "Create my shop" }));
  await waitFor(() => expect(posted).toHaveLength(1));
  return posted[0]!;
}

beforeEach(() => { posted.length = 0; });
afterEach(() => { document.cookie = "pc_ref=; Max-Age=0; Path=/"; });

describe("the partner code at sign-up", () => {
  it("shows and is sent even when a partner's cookie is there", async () => {
    document.cookie = "pc_ref=MARIA.7; Path=/";
    const body = await signUp("LINH");
    expect(screen.getByText("Referred by a PrintCoPilot partner (MARIA).")).toBeInTheDocument();
    expect(body).toMatchObject({ referral_cookie: "MARIA.7", referral_code: "LINH" });
  });

  it("is sent alone without a cookie, and left out when nobody typed one", async () => {
    expect(await signUp("LINH")).toMatchObject({ referral_cookie: null, referral_code: "LINH" });
  });

  it("sends no code when none was typed", async () => {
    document.cookie = "pc_ref=MARIA.7; Path=/";
    expect(await signUp("")).toMatchObject({ referral_cookie: "MARIA.7", referral_code: null });
  });
});
