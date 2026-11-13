/**
 * printcopilot.co on the new design (printcopilot-site, generated into
 * components/marketing/site/pages): every number filled from the settings,
 * no placeholder link left, the old addresses moved for good, and the forms
 * sent to the same backend calls as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const posted: { path: string; body: Record<string, unknown> }[] = [];
vi.mock("@/lib/api-client", () => {
  class ApiClientError extends Error {}
  return {
    ApiClientError,
    apiClient: {
      post: (path: string, body: Record<string, unknown>) => {
        posted.push({ path, body });
        return Promise.resolve(path === "/api/v1/contact" ? { message: "We will get back to you within 1 business day." } : { ok: true });
      },
      get: () => Promise.resolve({}),
    },
  };
});
let program: Record<string, unknown> | null = null;
const applied: unknown[] = [];
vi.mock("@/lib/partnerApi", () => ({
  papi: (path: string, opts: { body?: unknown } = {}) => {
    if (path === "/partners/program") return Promise.resolve(program);
    if (path === "/partners/apply") { applied.push(opts.body); return Promise.resolve({ ok: true, status: "waiting" }); }
    return Promise.reject(new Error(`no answer for ${path}`));
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/" }));

import { fillNumbers, PROGRAM_DEFAULTS } from "@/components/marketing/site/SitePage";
import { chromeOf } from "@/components/marketing/site/SiteShell";
import SiteWire from "@/components/marketing/site/SiteWire";
import { loadSitePage, siteBlogPost, siteSlugPage, type SiteKey } from "@/components/marketing/site/registry";
import { platformRedirect } from "@/middleware";

const KEYS: SiteKey[] = [
  "home", "features", "pricing", "demo", "contact", "about", "affiliate", "blog",
  "blog-online-brand-app-stack", "blog-sell-dtf-gang-sheets-online", "blog-tiered-wholesale-pricing-blank-apparel",
  "brands", "dtf", "examples", "help", "print-shops", "wholesale",
];
const PRICES = { retail: 8900, starter: 9900, wholesale: 29900, scale: 49900 };

beforeEach(() => {
  posted.length = 0;
  applied.length = 0;
  program = {
    accepting_applications: true, application_response_days: 2,
    terms: { version: 4, clauses: [{ title: "Payouts", text: "Paid monthly." }] },
  };
  document.body.innerHTML = "";
});

describe("every page of the design", () => {
  it.each(KEYS)("%s has no placeholder left once its numbers are filled", async (key) => {
    const page = await loadSitePage(key);
    const html = fillNumbers(page.html, PRICES, PROGRAM_DEFAULTS);
    expect(html).not.toMatch(/%%[A-Z]+/);
    // Every "#" link is either a form's button or the help search.
    const bare = [...html.matchAll(/<a\b([^>]*)>/g)].filter((m) => /href="#"/.test(m[1]!) && !/data-pc-/.test(m[1]!));
    expect(bare).toHaveLength(0);
    expect(html).not.toMatch(/(src|href)="images\//);
    expect(html).not.toMatch(/<helmet|<script|\son[a-z]+="/i);
    expect(page.css.length).toBeGreaterThan(1000);
    // The platform's own logo file, as on the old site, in the header and the footer.
    expect(html.match(/<img class="pc-logo" src="\/wordmark-horizontal_color-on-dark_1200w\.png" alt="PrintCoPilot"/g)).toHaveLength(2);
    expect(html).not.toMatch(/class="wordmark"[^>]*>\s*PrintCoPilot\s*<\/a>/);
  });

  it("shows the prices the super admin set, not the design's", async () => {
    const html = fillNumbers((await loadSitePage("pricing")).html, PRICES, null);
    expect(html).toContain("$99");
    expect(html).toContain("$299");
    expect(html).not.toMatch(/\$97(?![\d.])/);
  });

  it("works the affiliate's earnings out from the program's rate and the prices", async () => {
    const html = fillNumbers((await loadSitePage("affiliate")).html, PRICES, { ...PROGRAM_DEFAULTS, rateBps: 2500, rateText: "25%" });
    expect(html).toContain("$24.75"); // 25% of $99
    expect(html).toContain("$74.75"); // 25% of $299
    expect(html).toContain("25%");
    expect(html).not.toContain("$19.40");
  });

  it("signs up for the plan a pricing card is for", async () => {
    const html = (await loadSitePage("pricing")).html;
    for (const plan of ["retail", "starter", "wholesale", "scale"]) expect(html).toContain(`href="/signup?plan=${plan}"`);
    expect(html).toContain('href="/login?tenant="');
  });

  it("keeps the contact details the manager asked for", async () => {
    const html = (await loadSitePage("contact")).html;
    expect(html).toContain("AheadTech360 LLC<br>30 N Gould St, Ste N<br>Sheridan, WY 82801, USA");
    expect(html).toContain("Monday to Friday, 9am to 5pm US Eastern Time");
    expect(html).toContain("mailto:support@printcopilot.co");
  });

  it("frames other pages in the home page's own header and footer", async () => {
    const { header, footer } = chromeOf((await loadSitePage("home")).html);
    expect(header.startsWith("<header")).toBe(true);
    expect(footer.startsWith("<footer")).toBe(true);
    expect(header).toContain('href="/pricing"');
    expect(footer).toContain('href="/privacy-policy"');
  });
});

describe("addresses", () => {
  it("finds the design's pages and nothing of Object's", () => {
    expect(siteSlugPage("help")).toBe("help");
    expect(siteSlugPage("constructor")).toBeNull();
    expect(siteSlugPage("products")).toBeNull();
    expect(siteBlogPost("sell-dtf-gang-sheets-online")).toBe("blog-sell-dtf-gang-sheets-online");
    expect(siteBlogPost("__proto__")).toBeNull();
  });

  it("moves the old site's addresses for good, and leaves the partner portal alone", () => {
    expect(platformRedirect("/partners")).toBe("/affiliate");
    expect(platformRedirect("/partners/")).toBe("/affiliate");
    expect(platformRedirect("/retail")).toBe("/brands");
    expect(platformRedirect("/pricing.html")).toBe("/pricing");
    expect(platformRedirect("/partners/login")).toBeNull();
    expect(platformRedirect("/partners/dashboard")).toBeNull();
    expect(platformRedirect("/")).toBeNull();
    expect(platformRedirect("/affiliate")).toBeNull();
    expect(platformRedirect("/constructor")).toBeNull();
  });
});

async function mount(key: SiteKey) {
  const page = await loadSitePage(key);
  const box = document.createElement("div");
  box.id = "pc-site";
  box.innerHTML = fillNumbers(page.html, PRICES, PROGRAM_DEFAULTS);
  document.body.appendChild(box);
  render(<SiteWire page={key} />);
  return box;
}

const set = (box: HTMLElement, name: string, value: string) => {
  const el = box.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  fireEvent.change(el, { target: { value } });
  el.value = value;
};

describe("the forms", () => {
  it("sends a contact message to the contact endpoint, filed under its topic", async () => {
    const box = await mount("contact");
    set(box, "name", "Ana Torres");
    set(box, "email", "ana@torrestees.com");
    set(box, "topic", "Support for my store");
    set(box, "message", "My gang sheet will not upload.");
    await act(async () => { fireEvent.click(box.querySelector("form [data-pc-submit]")!); });
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ path: "/api/v1/contact", body: { name: "Ana Torres", department: "support", company_hp: "" } });
    expect(await screen.findByText("Message received.")).toBeTruthy();
  });

  it("keeps a demo request in Leads", async () => {
    const box = await mount("demo");
    set(box, "name", "Sam Lee");
    set(box, "email", "sam@shop.com");
    set(box, "business", "Lee Prints");
    set(box, "sell", "Custom printing");
    await act(async () => { fireEvent.click(box.querySelector("form [data-pc-submit]")!); });
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ path: "/api/v1/leads", body: { kind: "demo", name: "Sam Lee", data: { business_name: "Lee Prints", sells: "Custom printing" } } });
    expect(await screen.findByText("Thanks, we got it.")).toBeTruthy();
  });

  it("applies to the partner program with the terms it showed", async () => {
    const box = await mount("affiliate");
    await waitFor(() => expect(box.querySelector("[data-pc-terms]")).toBeTruthy());
    expect(box.textContent).toContain("Affiliate Terms, version 4");
    set(box, "name", "Linh Pham");
    set(box, "email", "linh@printcoach.com");
    set(box, "business", "Print Coach");
    set(box, "website", "https://printcoach.com");
    set(box, "promote", "Newsletter or email list");
    const agree = box.querySelector<HTMLInputElement>("label.ck input")!;
    agree.checked = true;
    await act(async () => { fireEvent.click(box.querySelector("form [data-pc-submit]")!); });
    await waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toMatchObject({ name: "Linh Pham", terms_version: 4, accept_terms: true, promote_how: "Newsletter or email list" });
    expect(await screen.findByText("Application received.")).toBeTruthy();
  });

  it("says applications are closed when the program says so", async () => {
    program = { ...program, accepting_applications: false };
    const box = await mount("affiliate");
    await waitFor(() => expect(box.textContent).toContain("Applications are closed right now"));
  });

  it("signs a blog reader up for the newsletter", async () => {
    const box = await mount("blog");
    const email = box.querySelector<HTMLInputElement>('form[data-pc-form="newsletter"] input[type="email"]')!;
    email.value = "reader@shop.com";
    await act(async () => { fireEvent.click(box.querySelector('form[data-pc-form="newsletter"] [data-pc-submit]')!); });
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ path: "/api/v1/leads", body: { kind: "newsletter", email: "reader@shop.com" } });
  });
});
