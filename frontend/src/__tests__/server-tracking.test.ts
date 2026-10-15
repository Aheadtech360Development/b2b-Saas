/**
 * What checkout tells the server so the brand's Conversions API Purchase is
 * matched to the same shopper the browser pixel saw (backend services/meta_capi.py).
 */
import { afterEach, describe, expect, it } from "vitest";
import { captureAttribution, getServerTracking } from "@/lib/attribution";

function clearCookies() {
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0];
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

describe("getServerTracking", () => {
  afterEach(() => {
    clearCookies();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("sends the pixel's own cookies as they are", () => {
    document.cookie = "_fbp=fb.1.1700000000000.1234567890; path=/";
    document.cookie = "_fbc=fb.1.1700000000000.IwAR0abc; path=/";
    const t = getServerTracking();
    expect(t?.fbp).toBe("fb.1.1700000000000.1234567890");
    expect(t?.fbc).toBe("fb.1.1700000000000.IwAR0abc");
  });

  it("builds fbc from the ad click it kept when the pixel wrote none", () => {
    window.history.replaceState({}, "", "/products?fbclid=IwAR0xyz");
    captureAttribution();
    const t = getServerTracking();
    expect(t?.fbp).toBeUndefined();
    expect(t?.fbc).toMatch(/^fb\.1\.\d{13}\.IwAR0xyz$/);
  });

  it("sends the page without anything typed into its query string", () => {
    window.history.replaceState({}, "", "/checkout/review?email=someone@example.com");
    const t = getServerTracking();
    expect(t?.page_url).toBe(`${window.location.origin}/checkout/review`);
    expect(JSON.stringify(t)).not.toContain("someone@example.com");
  });

  it("sends no Meta ids for a shopper the pixel never saw", () => {
    const t = getServerTracking();
    expect(t).toEqual({ page_url: `${window.location.origin}/` });
  });
});
