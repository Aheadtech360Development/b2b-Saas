import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

let tools: Record<string, string> = {};

vi.mock("next/script", () => ({
  default: ({ id, src, children }: { id?: string; src?: string; children?: ReactNode }) => (
    <script data-testid={id ?? src} data-src={src}>{children}</script>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/tracking", () => ({ setTrackingConfig: vi.fn(), trackPageView: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: () => Promise.resolve({
      enabled: true, tools, head_snippet: "", body_snippet: "",
      track_products: true, track_checkout: true,
    }),
  },
}));

import { TrackingScripts } from "@/components/analytics/TrackingScripts";

describe("TrackingScripts", () => {
  it("loads GA4 with the brand's measurement ID", async () => {
    tools = { ga4: "G-JLFGS9K0GP" };
    const { container } = render(<TrackingScripts />);
    await waitFor(() => expect(container.querySelector('[data-testid="ga4-init"]')).not.toBeNull());
    expect(container.querySelector('[data-testid="ga4-init"]')!.textContent).toContain("gtag('config', 'G-JLFGS9K0GP')");
    expect(container.querySelector("[data-src]")!.getAttribute("data-src"))
      .toBe("https://www.googletagmanager.com/gtag/js?id=G-JLFGS9K0GP");
  });

  it("skips an ID that would break its script and keeps the others", async () => {
    tools = { ga4: "<script>gtag('config', 'G-X');</script>", meta_pixel: "1234567890123456" };
    const { container } = render(<TrackingScripts />);
    await waitFor(() => expect(container.querySelector('[data-testid="meta-pixel"]')).not.toBeNull());
    expect(container.querySelector('[data-testid="ga4-init"]')).toBeNull();
    expect(container.querySelector("[data-src]")).toBeNull();
  });
});
