/**
 * Log in and Sign up in a builder header: two doors by name for a shop's own
 * customers, My account once they are in, and inside the menu on a phone.
 */
import { writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const who: { user: null | { is_admin: boolean }; isLoading: boolean } = { user: null, isLoading: false };
vi.mock("@/stores/auth.store", () => ({ useAuthStore: (pick: (s: typeof who) => unknown) => pick(who) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: () => Promise.resolve({ items: [] }) } }));

import AuthButtons, { LOGIN_HREF, SIGNUP_HREF } from "@/components/builder/islands/AuthButtons";
import { Tree, type RenderCtx } from "@/components/builder/render";
import { BASE_CSS } from "@/lib/builder/baseCss";
import { addHeaderAuth, hasHeaderAuth } from "@/lib/builder/doc";
import { BY_TYPE } from "@/lib/builder/registry";
import { treeCss } from "@/lib/builder/style";
import { walk } from "@/lib/builder/tree";
import type { BuilderNode, SiteDoc } from "@/lib/builder/types";
import starter from "./fixtures/starter-doc.json";

const defaults = () => BY_TYPE.auth_buttons!.create().props as Record<string, string>;
const mount = (over: Record<string, string> = {}, edit = false) => {
  const p: Record<string, string> = { show: "", size: "", phone: "", loginHref: "", signupHref: "", ...defaults(), ...over };
  return render(<AuthButtons id="au1" show={p.show!} loginLabel={p.loginLabel!} signupLabel={p.signupLabel!} accountLabel={p.accountLabel!}
                             loginStyle={p.loginStyle!} signupStyle={p.signupStyle!} size={p.size!} phone={p.phone!}
                             loginHref={p.loginHref!} signupHref={p.signupHref!} edit={edit} />);
};
const links = () => [...document.querySelectorAll<HTMLAnchorElement>(".b-auth a")].map((a) => [a.textContent, a.getAttribute("href"), a.className]);

beforeEach(() => { who.user = null; who.isLoading = false; });

describe("Log in and Sign up", () => {
  it("are two doors by name: the shop's sign-in page, and a quick account that lands on the dashboard", () => {
    mount();
    expect(links()).toEqual([
      ["Log in", "/login", "b-btn b-btn-outline"],
      ["Sign up", "/create-account?next=/account", "b-btn b-btn-solid"],
    ]);
    expect(LOGIN_HREF).toBe("/login");
    expect(SIGNUP_HREF).toBe("/create-account?next=/account");
  });

  it("say and go where the shop set them, and either can be left out", () => {
    mount({ show: "login", loginLabel: "Sign in", loginStyle: "text", loginHref: "/login?from=header" });
    expect(links()).toEqual([["Sign in", "/login?from=header", "b-btn b-auth-text"]]);
    document.body.innerHTML = "";
    mount({ show: "signup", signupLabel: "Join", signupHref: "/wholesale/register" });
    expect(links()).toEqual([["Join", "/wholesale/register", "b-btn b-btn-solid"]]);
    // Nothing that is not a link gets through.
    document.body.innerHTML = "";
    mount({ signupHref: "javascript:alert(1)" });
    expect(links()[1]![1]).toBe("/create-account?next=/account");
  });

  it("become My account once the customer is signed in — and the dashboard for somebody who runs the shop", () => {
    who.user = { is_admin: false };
    mount();
    expect(links()).toEqual([["My account", "/account", "b-btn b-btn-solid"]]);
    document.body.innerHTML = "";
    who.user = { is_admin: true };
    mount();
    expect(links()).toEqual([["Dashboard", "/admin/dashboard", "b-btn b-btn-solid"]]);
  });

  it("stay as the two buttons while the page is being edited, whoever is editing", () => {
    who.user = { is_admin: true };
    mount({}, true);
    expect(links().map((l) => l[0])).toEqual(["Log in", "Sign up"]);
  });

  it("move inside the menu on a phone when the header has one, and shrink when told to stay", () => {
    expect(BASE_CSS).toMatch(/@container bsite \(max-width:640px\)\{[\s\S]*\.b-auth\[data-phone=menu\]\):where\(\.bsite:has\(\.b-menu\[data-mobile=drawer\]\) \*\)\{display:none\}/);
    mount({ phone: "bar" });
    expect(document.querySelector(".b-auth")!.getAttribute("data-phone")).toBe("bar");
  });
});

describe("the phone's menu", () => {
  const header: BuilderNode = {
    id: "h0", type: "section", props: { width: "contained" }, style: { paddingTop: "14px", paddingBottom: "14px", backgroundColor: "#FFFFFF" }, children: [
      { id: "h1", type: "stack", props: { direction: "row" }, style: { alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "nowrap" }, children: [
        { id: "h2", type: "store_name", props: {} },
        { id: "h3", type: "menu", props: { menuId: "main", layout: "horizontal", mobile: "drawer" }, style: { justifyContent: "center" } },
        { id: "h4", type: "stack", props: { direction: "row" }, style: { justifyContent: "flex-end", gap: "6px", flexWrap: "nowrap", alignItems: "center" }, children: [
          { id: "h5", type: "search", props: { style: "icon" } },
          { id: "h6", type: "cart_link", props: { showCount: true } },
          { id: "h7", type: "auth_buttons", props: defaults() },
        ] },
      ] },
    ],
  };
  const ctx = {
    data: { product: null, collection: null, collectionPage: null, grids: {}, collectionGrids: {}, store: { name: "Innterflow", logo: "" },
      menus: { main: [{ label: "DTF & UV DTF", href: "/collections/dtf" }, { label: "Shop All", href: "/products" }, { label: "Contact", href: "/contact" }] } },
    globals: {}, page: null, query: "", route: "home",
  } as unknown as RenderCtx;
  const draw = () => render(<div className="bsite" data-part="header"><Tree tree={header} ctx={ctx} /></div>);
  const page = () => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS}
${treeCss(header)}
.bsite{container-type:inline-size;container-name:bsite;--b-primary:#0F1B3D;--b-btn-radius:10px;--b-container:1200px;font-family:Inter,system-ui,sans-serif;color:#14161B;background:#fff}
.bsite-layer{--b-primary:#0F1B3D;--b-btn-radius:10px}
body{margin:0;font-family:Inter,system-ui,sans-serif;background:#EEF0F4}</style></head><body>${document.body.innerHTML}</body></html>`;

  it("has the two buttons at the top of its foot when the visitor is signed out", () => {
    draw();
    if (process.env.LOOK_OUT) writeFileSync(`${process.env.LOOK_OUT}-bar.html`, page());
    fireEvent.click(screen.getByRole("button", { name: "Open the menu" }));
    const buttons = [...document.querySelectorAll<HTMLAnchorElement>(".bsite-layer .b-drawer-auth a")];
    expect(buttons.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([["Log in", "/login"], ["Sign up", "/create-account?next=/account"]]);
    // They are the way in: the plain "My account" line is not a third.
    expect(document.querySelector(".bsite-layer .b-drawer-foot")!.textContent).not.toContain("My account");
    if (process.env.LOOK_OUT) writeFileSync(`${process.env.LOOK_OUT}-drawer.html`, page());
  });

  it("has My account there instead once they are signed in", () => {
    who.user = { is_admin: false };
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Open the menu" }));
    expect(document.querySelector(".bsite-layer .b-drawer-auth")).toBeNull();
    const account = [...document.querySelectorAll<HTMLAnchorElement>(".bsite-layer .b-drawer-foot a")].find((a) => a.textContent!.includes("My account"))!;
    expect(account.getAttribute("href")).toBe("/account");
  });
});

describe("adding them to a header in one press", () => {
  const doc = starter as unknown as SiteDoc;
  const typesIn = (n: BuilderNode | null) => { const out: string[] = []; walk(n, (x) => { out.push(x.type); }); return out; };

  it("puts them after the cart, in place of the plain account icon", () => {
    expect(hasHeaderAuth(doc)).toBe(false);
    expect(typesIn(doc.parts.header!)).toContain("account_link");
    const res = addHeaderAuth(doc)!;
    expect(res.replaced).toBe(true);
    expect(hasHeaderAuth(res.doc)).toBe(true);
    const after = typesIn(res.doc.parts.header!);
    expect(after).not.toContain("account_link");
    expect(after.indexOf("auth_buttons")).toBe(after.indexOf("cart_link") + 1);
    // The header it was given is untouched.
    expect(typesIn(doc.parts.header!)).not.toContain("auth_buttons");
  });

  it("joins the menu's row when the header has no icons", () => {
    const bare: BuilderNode = { id: "s", type: "section", props: {}, children: [
      { id: "r", type: "stack", props: { direction: "row" }, children: [{ id: "l", type: "logo", props: {} }, { id: "m", type: "menu", props: { menuId: "" } }] }] };
    const res = addHeaderAuth({ ...doc, parts: { ...doc.parts, header: bare } })!;
    expect(res.replaced).toBe(false);
    expect(res.doc.parts.header!.children![0]!.children!.map((c) => c.type)).toEqual(["logo", "menu", "auth_buttons"]);
  });
});
