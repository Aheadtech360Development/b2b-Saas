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
vi.mock("@/lib/tracking", () => ({ setTrackingConfig: vi.fn(), trackPageView: vi.fn(), trackSearch: vi.fn() }));
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

  it("never names a script after the tool's own global (window.clarity, window.omnisend)", async () => {
    // A page element's id is also a name on window: a <script id="clarity">
    // made window.clarity that tag, Clarity's loader called it and stopped
    // ("a[c] is not a function"), and no visit was ever recorded.
    tools = { clarity: "yv36li1fic", omnisend: "5f8a1b2c3d4e5f6a7b8c9d0e" };
    const { container } = render(<TrackingScripts />);
    await waitFor(() => expect(container.querySelector('[data-testid="ms-clarity-init"]')).not.toBeNull());
    expect(container.querySelector('[data-testid="clarity"]')).toBeNull();
    expect(container.querySelector('[data-testid="omnisend"]')).toBeNull();
    const clarity = container.querySelector('[data-testid="ms-clarity-init"]')!.textContent!;
    expect(clarity).toContain('typeof c[a]!=="function"');
    expect(clarity).toContain('"clarity","script","yv36li1fic"');
    expect(container.querySelector('[data-testid="omnisend-init"]')!.textContent).toContain("Array.isArray(window.omnisend)");
  });

  it("starts Clarity's queue even when the page has an element called clarity", async () => {
    tools = { clarity: "yv36li1fic" };
    const { container } = render(<TrackingScripts />);
    await waitFor(() => expect(container.querySelector('[data-testid="ms-clarity-init"]')).not.toBeNull());
    const code = container.querySelector('[data-testid="ms-clarity-init"]')!.textContent!;
    const el = document.createElement("div");
    el.id = "clarity";
    document.body.appendChild(el);
    const win: Record<string, unknown> = { clarity: el };
    const doc = { createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }] };
    // Run as the page would: with window and document swapped for stand-ins.
    new Function("win", "doc", code.replace("})(window,document,", "})(win,doc,"))(win, doc);
    expect(typeof win.clarity).toBe("function");
    (win.clarity as (...a: unknown[]) => void)("set", "x", "1");
    expect((win.clarity as unknown as { q: unknown[] }).q.length).toBeGreaterThan(0);
    el.remove();
  });
});

