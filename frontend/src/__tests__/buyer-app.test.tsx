/**
 * The branded buyer app (Scale): the console's Settings → Buyer app shows the
 * shop's code and QR square and makes a new code only after asking; and
 * printcopilot.co/get-app, where the QR goes, names the shop, the code and the
 * way in, or says the shop is not on the app.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const CARD = {
  code: "ABC234", link: "https://printcopilot.co/get-app?code=ABC234",
  qr_svg: "data:image/svg+xml;base64,AAA", qr_png: "data:image/png;base64,AAA",
  app_store_url: null, play_store_url: null,
};
const calls: string[] = [];
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (path: string) => { calls.push(`GET ${path}`); return Promise.resolve(CARD); },
    post: (path: string) => { calls.push(`POST ${path}`); return Promise.resolve({ ...CARD, code: "XYZ789", link: CARD.link.replace("ABC234", "XYZ789") }); },
  },
}));
let answer = true;
vi.mock("@/lib/dialog", () => ({ ask: vi.fn(() => Promise.resolve(answer)), tell: vi.fn(() => Promise.resolve()) }));
let query = "code=abc-234";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query) }));

import { BuyerAppPanel } from "@/components/admin/settings/BuyerAppPanel";
import GetApp, { cleanCode } from "@/components/marketing/site/GetApp";

beforeEach(() => { calls.length = 0; answer = true; query = "code=abc-234"; });

describe("Settings, Buyer app", () => {
  it("shows the code, its QR square and says the app is not in the stores yet", async () => {
    render(<BuyerAppPanel />);
    expect(await screen.findByTestId("shop-code")).toHaveProperty("textContent", "ABC234");
    expect(screen.getByAltText("QR square for shop code ABC234").getAttribute("src")).toBe(CARD.qr_svg);
    expect(screen.getByText("Download QR").getAttribute("download")).toBe("shop-code-abc234.png");
    expect(screen.getByTestId("not-in-stores")).toBeTruthy();
  });

  it("makes a new code only when the owner says yes", async () => {
    render(<BuyerAppPanel />);
    await screen.findByTestId("shop-code");
    answer = false;
    await act(async () => { fireEvent.click(screen.getByText("New code")); });
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(0);
    answer = true;
    await act(async () => { fireEvent.click(screen.getByText("New code")); });
    await waitFor(() => expect(screen.getByTestId("shop-code").textContent).toBe("XYZ789"));
    expect(calls).toContain("POST /api/v1/admin/storefront/shop-code/rotate");
  });
});

describe("printcopilot.co/get-app", () => {
  it("cleans what a camera or a person hands it", () => {
    expect(cleanCode("abc-234")).toBe("ABC234");
    expect(cleanCode(" a b c 2 3 4 5 6 ")).toBe("ABC234");
    expect(cleanCode(null)).toBe("");
  });

  it("names the shop and the way in for a wholesale shop", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ name: "Innterflow", logo_url: null, url: "https://innterflow.printcopilot.co/", wholesale_signup: true, app_store_url: null, play_store_url: null }),
    })));
    render(<GetApp />);
    expect(await screen.findByText("Shop with Innterflow in the PrintCoPilot app")).toBeTruthy();
    expect(screen.getByText("ABC234")).toBeTruthy();
    expect(screen.getByText("I have the app: open it").getAttribute("href")).toBe("printcopilot://apply?code=ABC234");
    expect(screen.getByText("Shop on the website instead").getAttribute("href")).toBe("https://innterflow.printcopilot.co/");
    expect(screen.getByText(/not in the App Store and Google Play yet/)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("says when the shop is not on the app, and where to order instead", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: false, status: 403,
      json: () => Promise.resolve({ detail: { code: "not_on_app", message: "Innterflow is not on the PrintCoPilot app. You can still order on its website.", url: "https://innterflow.printcopilot.co/" } }),
    })));
    render(<GetApp />);
    expect(await screen.findByText("This shop is not on the app")).toBeTruthy();
    expect(screen.getByText("Go to the website").getAttribute("href")).toBe("https://innterflow.printcopilot.co/");
    vi.unstubAllGlobals();
  });

  it("asks for the code again when there is none", async () => {
    query = "";
    render(<GetApp />);
    expect(await screen.findByText("We could not find that shop")).toBeTruthy();
  });
});
