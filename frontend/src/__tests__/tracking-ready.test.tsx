/**
 * The tools are on the page before any event is sent to them.
 *
 * A product page reports its view as soon as it is drawn, before the shop's
 * settings are in; the view is kept and sent when they arrive. It was sent
 * the moment they arrived, which was a moment before the tools' own scripts
 * were put on the page, so `fbq` and `gtag` did not exist yet and the view
 * went nowhere. On the page an advert lands on, a Meta Pixel or a GA4 ID
 * never heard that the product had been looked at.
 */
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const order: string[] = [];

// As next/script does it: the script reaches the page from the component's own effect.
vi.mock("next/script", async () => {
  const { useEffect } = await import("react");
  return {
    default: function Script({ id, src }: { id?: string; src?: string }) {
      useEffect(() => { order.push(`script:${id ?? src}`); }, [id, src]);
      return null;
    },
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/search" }));
vi.mock("@/lib/tracking", () => ({
  setTrackingConfig: () => { order.push("settings handed over"); },
  trackPageView: vi.fn(),
  trackSearch: (q: string) => { order.push(`search:${q}`); },
}));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: () => Promise.resolve({
      enabled: true, tools: { meta_pixel: "1234567890123456", ga4: "G-TEST12345" },
      head_snippet: "", body_snippet: "", track_products: true, track_checkout: true,
    }),
  },
}));

import { TrackingScripts } from "@/components/analytics/TrackingScripts";

describe("TrackingScripts, once the shop's settings are in", () => {
  it("puts every tool's script on the page, then hands the settings over, then reports the search", async () => {
    window.history.replaceState({}, "", "/search?q=dtf%20transfers");
    render(<TrackingScripts />);
    await waitFor(() => expect(order).toContain("settings handed over"));
    await waitFor(() => expect(order.at(-1)).toBe("search:dtf transfers"));

    const at = order.indexOf("settings handed over");
    expect(order.slice(0, at).sort()).toEqual([
      "script:ga4-init",
      "script:https://www.googletagmanager.com/gtag/js?id=G-TEST12345",
      "script:meta-pixel",
    ]);
    expect(order.slice(at + 1)).toEqual(["search:dtf transfers"]);
  });
});
