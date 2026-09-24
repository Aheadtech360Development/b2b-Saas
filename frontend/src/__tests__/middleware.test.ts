/**
 * One shop, one address.
 *
 * The platform hands out `<slug>.printcopilot.co`. Before this, the same shop
 * was also reachable at `printcopilot.co/?tenant=<slug>`, and the cookie that
 * visit left behind made the platform's own home page show that shop to
 * whoever came next — the address showing a different thing each time.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";

let middleware: typeof import("../middleware").middleware;
let TENANT_HEADER: string;
let TENANT_COOKIE: string;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_PLATFORM_DOMAIN", "printcopilot.co");
  vi.resetModules();
  const mod = await import("../middleware");
  middleware = mod.middleware;
  TENANT_HEADER = mod.TENANT_HEADER;
  TENANT_COOKIE = mod.TENANT_COOKIE;
});

afterAll(() => vi.unstubAllEnvs());

function visit(url: string, cookie?: string) {
  const req = new NextRequest(new URL(url), {});
  if (cookie) req.cookies.set(TENANT_COOKIE, cookie);
  return middleware(req);
}

describe("the platform's own address", () => {
  it("is the platform's, whatever cookie the visitor arrived with", () => {
    const res = visit("https://printcopilot.co/", "interflow");
    expect(res.headers.get("x-middleware-request-" + TENANT_HEADER)).toBeNull();
  });

  it("does not leave a brand cookie behind", () => {
    const res = visit("https://printcopilot.co/");
    expect(res.cookies.get(TENANT_COOKIE)).toBeUndefined();
  });

  it("sends a shop asked for here to where the shop lives", () => {
    const res = visit("https://printcopilot.co/products?tenant=interflow");
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.hostname).toBe("interflow.printcopilot.co");
    expect(to.pathname).toBe("/products");
    expect(to.searchParams.get("tenant")).toBeNull();
  });

  it("treats www the same way", () => {
    const res = visit("https://www.printcopilot.co/?tenant=interflow");
    expect(res.status).toBe(307);
  });
});

describe("a shop's own address", () => {
  it("resolves from the subdomain", () => {
    const res = visit("https://interflow.printcopilot.co/");
    expect(res.headers.get("x-middleware-request-" + TENANT_HEADER)).toBe("interflow");
    expect(res.cookies.get(TENANT_COOKIE)?.value).toBe("interflow");
  });

  it("keeps the brand through in-app navigation via the cookie", () => {
    const res = visit("https://interflow.printcopilot.co/cart", "interflow");
    expect(res.headers.get("x-middleware-request-" + TENANT_HEADER)).toBe("interflow");
  });

  it("is not redirected away", () => {
    expect(visit("https://interflow.printcopilot.co/").status).toBe(200);
  });
});

describe("a host that is not the platform's domain", () => {
  it("still falls back to ?tenant=, because nothing else works there", () => {
    const res = visit("https://b2b-saas.vercel.app/?tenant=interflow");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-request-" + TENANT_HEADER)).toBe("interflow");
  });

  it("resolves a brand's own domain by host, leaving the slug to the API", () => {
    const res = visit("https://shop.interflow.com/");
    expect(res.headers.get("x-middleware-request-x-storefront-host")).toBe("shop.interflow.com");
  });
});
