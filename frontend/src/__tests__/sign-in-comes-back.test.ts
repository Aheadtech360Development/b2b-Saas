/**
 * Signing in in the middle of an order brings the buyer back to it.
 *
 * A guest who uploaded a design in the upload-by-size builder and pressed
 * "Sign in to order" left the page: the design lived only in the page's
 * memory, sign-in ignored where they came from, and making an account (or
 * signing in) landed them on their account page with the design gone. Now the
 * builders keep the design (lib/builderDraft), send the buyer to make an
 * account with the way back, and open again with the design as it was; and
 * sign-in follows `next` (lib/safeNext), never to another site.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dropDraft, keepDraft, readDraft, signInAndComeBack, takeResume } from "@/lib/builderDraft";
import { nextFromLocation, safeNext } from "@/lib/safeNext";

const SRC = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const realLocation = window.location;

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true, writable: true });
});

describe("the way back after signing in", () => {
  it("is only ever a path on this shop", () => {
    expect(safeNext("/products/dtf-by-size?resume=upload-by-size")).toBe("/products/dtf-by-size?resume=upload-by-size");
    expect(safeNext("/checkout/invoice/1047")).toBe("/checkout/invoice/1047");
    for (const bad of ["//elsewhere.com", "/\\elsewhere.com", "https://elsewhere.com", "javascript:alert(1)",
      "elsewhere.com", "", null, undefined, "/\telsewhere"]) {
      expect(safeNext(bad as string | null | undefined)).toBeNull();
    }
  });

  it("never leads back to a sign-in page", () => {
    for (const loop of ["/login", "/login?next=/cart", "/create-account", "/create-account?next=/x"]) {
      expect(safeNext(loop)).toBeNull();
    }
    expect(safeNext("/login-help")).toBe("/login-help");
  });

  it("is read from ?next, or from ?redirect on older links", () => {
    window.history.replaceState(null, "", "/login?next=%2Fproducts%2Ftee");
    expect(nextFromLocation()).toBe("/products/tee");
    window.history.replaceState(null, "", "/login?redirect=/checkout/invoice/1047");
    expect(nextFromLocation()).toBe("/checkout/invoice/1047");
    window.history.replaceState(null, "", "/login?next=//elsewhere.com");
    expect(nextFromLocation()).toBeNull();
  });
});

describe("a design kept while the buyer makes an account", () => {
  it("is kept, read back, and dropped once it is in the cart", () => {
    keepDraft("upload-by-size:p1", { items: [{ file_url: "https://img/a.png", w: 10, h: 8, qty: 3 }] });
    expect(readDraft<{ items: { qty: number }[] }>("upload-by-size:p1")?.items[0]?.qty).toBe(3);
    // Reading does not use it up: a reload on the way still finds it.
    expect(readDraft("upload-by-size:p1")).not.toBeNull();
    dropDraft("upload-by-size:p1");
    expect(readDraft("upload-by-size:p1")).toBeNull();
  });

  it("is forgotten after a day", () => {
    localStorage.setItem("pc_draft:own-sheet:p1", JSON.stringify({ at: Date.now() - 25 * 3_600_000, data: { qty: 2 } }));
    expect(readDraft("own-sheet:p1")).toBeNull();
    expect(localStorage.getItem("pc_draft:own-sheet:p1")).toBeNull();
  });

  it("goes with the buyer to make an account, with the way back to the builder", () => {
    const fake = { href: "http://shop.test/products/dtf-by-size?color=red" };
    Object.defineProperty(window, "location", { value: fake, configurable: true, writable: true });
    signInAndComeBack("upload-by-size");
    const sent = new URL(fake.href, "http://shop.test");
    expect(sent.pathname).toBe("/create-account");
    expect(sent.searchParams.get("next")).toBe("/products/dtf-by-size?color=red&resume=upload-by-size");
  });

  it("opens the builder again on the way back, and leaves the address clean", () => {
    window.history.replaceState(null, "", "/products/dtf-by-size?color=red&resume=upload-by-size");
    expect(takeResume()).toBe("upload-by-size");
    expect(window.location.pathname + window.location.search).toBe("/products/dtf-by-size?color=red");
    // Asked once: a reload does not open it again.
    expect(takeResume()).toBeNull();
    window.history.replaceState(null, "", "/products/x?resume=something-else");
    expect(takeResume()).toBeNull();
    expect(window.location.search).toBe("");
  });
});

describe("the builders and sign-in", () => {
  const builders = {
    "components/storefront/UploadBySizeModal.tsx": "upload-by-size",
    "components/storefront/UploadOwnSheetModal.tsx": "own-sheet",
    "components/storefront/ProductConfigurator.tsx": "configure",
  };

  it("keep the design and send a guest to make an account with the way back", () => {
    for (const [file, resume] of Object.entries(builders)) {
      const src = read(file);
      expect(src, file).toContain(`signInAndComeBack("${resume}")`);
      expect(src, file).toMatch(/keepDraft\(draftKey,/);
      expect(src, file).toMatch(/dropDraft\(draftKey\)/);
      expect(src, file).toMatch(/readDraft</);
      expect(src, file).not.toMatch(/\/login\?next=/);
    }
  });

  it("open the uploader again on both product pages", () => {
    expect(read("app/(customer)/products/[slug]/ProductDetailClient.tsx")).toMatch(/takeResume\(\)/);
    expect(read("components/storefront/ThemeProductBuy.tsx")).toMatch(/takeResume\(\)/);
  });

  it("a product page sends an ended session back to the product, and a refusal is not called a sign-in", () => {
    // A 403 (a refusal) was read as "sign in again" and sent to /login, which
    // took a signed-in shopper to their account page and back round again.
    const src = read("components/storefront/ThemeProductBuy.tsx");
    expect(src).toMatch(/if \(status === 401\) \{/);
    expect(src).toContain("router.push(`/login?next=${encodeURIComponent(back)}`)");
    expect(src).not.toMatch(/status === 401 \|\| status === 403/);
    expect(src).not.toMatch(/router\.push\("\/login"\)/);
  });

  it("sign-in follows the way back for a shopper, not the account page", () => {
    const login = read("app/(auth)/login/page.tsx");
    expect(login).toContain('router.push(nextFromLocation() ?? "/account")');
    expect(login).toContain('router.replace(nextFromLocation() ?? "/account")');
    expect(login).toMatch(/create-account\?next=\$\{encodeURIComponent\(next\)\}/);
    expect(read("app/(auth)/create-account/page.tsx")).toContain('safeNext(params.get("next"))');
  });
});
