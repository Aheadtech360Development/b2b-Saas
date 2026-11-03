/**
 * A partner's Retail link (Retail launch, package 7): the portal offered only
 * the home page link, so a partner had no link for the Retail page. Once the
 * Retail pages are published it offers the same link landing there, where
 * sign-up starts on the Retail plan and the click is counted to the partner.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const launch = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/retailLaunch", () => ({ get RETAIL_LAUNCHED() { return launch.on; } }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ variable: "pcp-display", className: "" }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const papi = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partnerApi", () => ({ papi: (...a: unknown[]) => papi(...a), partnerDownload: vi.fn() }));
vi.mock("@/components/partners/PartnerShell", () => ({
  usePartner: () => ({ partner: { link: "https://printcopilot.co/?ref=MARIA", code: "MARIA" } }),
}));

import LinkPageView from "@/app/(partners)/partners/(portal)/link/page";
import { retailLinkOf } from "@/lib/retailNav";

const PAGE = {
  link: "https://printcopilot.co/?ref=MARIA", code: "MARIA", link_active: true, clicks_30: 3, signups_30: 1,
  conversion: 33.3, cookie_days: 90, captions: [{ title: "Short", text: "Try it: [YOUR LINK]" }], banners: [],
};

beforeEach(() => {
  launch.on = false;
  papi.mockReset();
  papi.mockImplementation((path: string) =>
    path === "/partners/me/link" ? Promise.resolve(PAGE) : Promise.reject(new Error("not in this test")));
});

describe("a partner's Retail link", () => {
  it("is the partner's own link, landing on the Retail page", () => {
    expect(retailLinkOf("https://printcopilot.co/?ref=MARIA")).toBe("https://printcopilot.co/retail?ref=MARIA");
    expect(retailLinkOf("https://printcopilot.co/?ref=MARIA&src=ig")).toBe("https://printcopilot.co/retail?ref=MARIA&src=ig");
  });

  it("is not offered while the Retail pages are not published", async () => {
    render(<LinkPageView />);
    await screen.findByLabelText("Referral link");
    expect(screen.queryByLabelText("Retail brands link")).toBeNull();
  });

  it("is offered beside the home page link once they are, campaign tag and all", async () => {
    launch.on = true;
    render(<LinkPageView />);
    const retail = await screen.findByLabelText<HTMLInputElement>("Retail brands link");
    expect(retail.value).toBe("https://printcopilot.co/retail?ref=MARIA");

    fireEvent.change(screen.getByLabelText(/Campaign tag/), { target: { value: "Instagram" } });
    expect(retail.value).toBe("https://printcopilot.co/retail?ref=MARIA&src=instagram");
    expect(screen.getByLabelText<HTMLInputElement>("Referral link").value).toBe("https://printcopilot.co/?ref=MARIA&src=instagram");
  });
});
