/**
 * Every visit before an order, for the order page's Conversion summary
 * (lib/attribution.ts → backend services/attribution.journey).
 *
 * Each test loads the module fresh: it reads `document.referrer` once per page
 * load, like a browser does, and a fresh import is a fresh page load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What the storefront tells the shop: one report per visit that began (Home's Sessions).
const { posts } = vi.hoisted(() => ({ posts: [] as { url: string; body: Record<string, unknown> }[] }));
vi.mock("@/lib/api-client", () => ({
  apiClient: { post: (url: string, body: Record<string, unknown>) => { posts.push({ url, body }); return Promise.resolve({ kept: true }); } },
}));

type Mod = typeof import("@/lib/attribution");

async function pageLoad(path: string, referrer = ""): Promise<Mod> {
  vi.resetModules();
  Object.defineProperty(document, "referrer", { value: referrer, configurable: true });
  window.history.replaceState({}, "", path);
  return import("@/lib/attribution");
}

describe("the visits kept for the Conversion summary", () => {
  beforeEach(() => {
    posts.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T16:02:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("lists a direct visit too, as one with nothing it came from", async () => {
    const m = await pageLoad("/");
    m.captureAttribution();
    const sent = m.getAttribution();
    expect(sent?.sessions).toHaveLength(1);
    expect(sent?.sessions?.[0]).toMatchObject({ landing_page: `${window.location.origin}/` });
    expect(sent?.sessions?.[0]?.referrer).toBeUndefined();
    expect(sent?.utm_source).toBeUndefined();
  });

  it("keeps Bing, the return, and the visit that ordered, as three sessions", async () => {
    let m = await pageLoad("/", "https://www.bing.com/");
    m.captureAttribution();

    vi.setSystemTime(new Date("2026-10-25T10:00:00Z"));
    m = await pageLoad("/products/tee");
    m.captureAttribution();

    vi.setSystemTime(new Date("2026-10-27T09:00:00Z"));
    m = await pageLoad("/?utm_source=bing&utm_medium=cpc&utm_campaign=fall", "https://www.bing.com/");
    m.captureAttribution();

    const sent = m.getAttribution();
    expect(sent?.visits).toBe(3);
    expect(sent?.sessions?.map((s) => s.at)).toEqual([
      "2026-10-23T16:02:00.000Z", "2026-10-25T10:00:00.000Z", "2026-10-27T09:00:00.000Z",
    ]);
    expect(sent?.sessions?.[0]?.referrer).toBe("https://www.bing.com/");
    expect(sent?.sessions?.[1]?.referrer).toBeUndefined();
    expect(sent?.sessions?.[2]).toMatchObject({ utm_source: "bing", utm_medium: "cpc", utm_campaign: "fall" });
    // The one source for the order's columns is still the last one that named itself.
    expect(sent?.utm_campaign).toBe("fall");
    // Each visit was reported once, by the id the order will carry.
    expect(posts.map((p) => p.url)).toEqual(Array(3).fill("/api/v1/storefront/visits"));
    expect(posts.map((p) => p.body.id)).toEqual(sent?.sessions?.map((s) => s.id));
    expect(posts[2]?.body).toMatchObject({ utm_source: "bing", utm_medium: "cpc", utm_campaign: "fall", referrer: "https://www.bing.com/" });
  });

  it("does not start a new session for moving between pages, a reload, or a second tab", async () => {
    let m = await pageLoad("/?utm_source=google&utm_medium=cpc&gclid=abc", "https://www.google.com/");
    m.captureAttribution();
    vi.setSystemTime(new Date("2026-10-23T16:10:00Z"));
    window.history.replaceState({}, "", "/products/tee");
    m.captureAttribution();
    // A reload of that page: the browser gives the same referrer again.
    vi.setSystemTime(new Date("2026-10-23T16:12:00Z"));
    m = await pageLoad("/products/tee", "https://www.google.com/");
    m.captureAttribution();
    // A second tab opened from the shop itself.
    m = await pageLoad("/products/hoodie", `${window.location.origin}/products/tee`);
    m.captureAttribution();

    const sent = m.getAttribution();
    expect(sent?.sessions).toHaveLength(1);
    expect(sent?.visits).toBe(1);
    expect(sent?.sessions?.[0]?.last).toBe("2026-10-23T16:12:00.000Z");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toMatchObject({ click: "gclid", utm_source: "google" });
  });

  it("starts a new session when the buyer comes back from somewhere else, even soon", async () => {
    let m = await pageLoad("/", "https://www.google.com/");
    m.captureAttribution();
    vi.setSystemTime(new Date("2026-10-23T16:07:00Z"));
    m = await pageLoad("/?utm_source=klaviyo&utm_medium=email");
    m.captureAttribution();
    const sent = m.getAttribution();
    expect(sent?.sessions).toHaveLength(2);
    expect(sent?.sessions?.[1]).toMatchObject({ utm_source: "klaviyo", utm_medium: "email" });
  });

  it("does not count coming back from the payment page as a new source", async () => {
    let m = await pageLoad("/", "https://www.instagram.com/");
    m.captureAttribution();
    vi.setSystemTime(new Date("2026-10-23T16:09:00Z"));
    m = await pageLoad("/checkout/review", "https://hooks.stripe.com/redirect/complete");
    m.captureAttribution();
    expect(m.getAttribution()?.sessions).toHaveLength(1);
  });

  it("records nothing on the brand's own admin pages", async () => {
    const m = await pageLoad("/admin/orders", "https://www.google.com/");
    expect(m.captureAttribution()).toBeNull();
    expect(m.getAttribution()).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("keeps the first visit and the latest ones when there are very many", async () => {
    let m = await pageLoad("/", "https://www.bing.com/");
    m.captureAttribution();
    for (let i = 1; i <= 40; i++) {
      vi.setSystemTime(new Date(Date.parse("2026-10-23T16:02:00Z") + i * 3_600_000));
      m = await pageLoad("/");
      m.captureAttribution();
    }
    const sent = m.getAttribution();
    expect(sent?.visits).toBe(41);
    expect(sent?.sessions).toHaveLength(25);
    expect(sent?.sessions?.[0]?.referrer).toBe("https://www.bing.com/");
    expect(sent?.sessions?.[24]?.at).toBe(new Date(Date.parse("2026-10-23T16:02:00Z") + 40 * 3_600_000).toISOString());
  });

  it("drops visits from more than 90 days back, and the campaign they brought", async () => {
    let m = await pageLoad("/?utm_source=google&utm_medium=cpc", "https://www.google.com/");
    m.captureAttribution();
    vi.setSystemTime(new Date("2026-12-20T10:00:00Z"));
    m = await pageLoad("/");
    m.captureAttribution();
    vi.setSystemTime(new Date("2027-01-25T10:00:00Z"));
    m = await pageLoad("/");
    m.captureAttribution();
    const sent = m.getAttribution();
    expect(sent?.sessions?.map((s) => s.at)).toEqual(["2026-12-20T10:00:00.000Z", "2027-01-25T10:00:00.000Z"]);
    expect(sent?.visits).toBe(2);
    expect(sent?.utm_source).toBeUndefined();
  });

  it("carries on from a record kept before visits were listed", async () => {
    localStorage.setItem("at_attr", JSON.stringify({
      utm_source: "facebook", utm_medium: "paid_social", referrer: "https://l.facebook.com/",
      landing_page: `${window.location.origin}/`, first_seen: "2026-10-22T12:00:00.000Z",
      last_seen: "2026-10-22T12:20:00.000Z", visits: 1, device: "mobile",
    }));
    const m = await pageLoad("/");
    m.captureAttribution();
    const sent = m.getAttribution();
    expect(sent?.sessions).toHaveLength(2);
    expect(sent?.sessions?.[0]).toMatchObject({ at: "2026-10-22T12:00:00.000Z", utm_source: "facebook" });
    expect(sent?.visits).toBe(2);
  });

  it("counts a visit under way from before visits had ids, once", async () => {
    localStorage.setItem("at_attr", JSON.stringify({
      first_seen: "2026-10-23T15:50:00.000Z", last_seen: "2026-10-23T16:00:00.000Z", visits: 1,
      sessions: [{ at: "2026-10-23T15:50:00.000Z", last: "2026-10-23T16:00:00.000Z", referrer: "https://www.bing.com/" }],
    }));
    let m = await pageLoad("/products/tee");
    m.captureAttribution();
    vi.setSystemTime(new Date("2026-10-23T16:05:00Z"));
    m = await pageLoad("/products/hoodie");
    m.captureAttribution();
    const sent = m.getAttribution();
    expect(sent?.sessions).toHaveLength(1);
    expect(sent?.sessions?.[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(posts.map((p) => p.body.id)).toEqual([sent?.sessions?.[0]?.id]);
  });
});
