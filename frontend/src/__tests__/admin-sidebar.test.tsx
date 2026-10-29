/**
 * The admin sidebar's Storefront place.
 *
 * A place shows its screens only once somebody is in it. Storefront's first
 * screen is the website builder, a full page with no sidebar, so nobody was
 * ever "in" Storefront and the Media library under it could not be found.
 * Storefront now always shows its screens.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const nav = vi.hoisted(() => ({ path: "/admin/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/stores/auth.store", () => ({ useAuthStore: () => ({ user: { role: "owner", scopes: [] } }) }));
vi.mock("@/lib/permissions", () => ({ hasScope: () => true }));
vi.mock("@/lib/entitlements", () => ({ useEntitlements: () => ({ locked: [] }) }));
vi.mock("@/services/contact.service", () => ({ contactService: { list: () => Promise.resolve({ unread: 0 }) } }));
vi.mock("@/lib/api-client", () => ({ apiClient: { get: () => Promise.resolve({}) } }));
vi.mock("@/components/shared/PlatformLogo", () => ({ PlatformLogo: () => null }));

import { AdminSidebar } from "@/components/layout/AdminSidebar";

function draw(path: string) {
  nav.path = path;
  document.body.innerHTML = "";
  render(<AdminSidebar />);
  const link = (label: string) =>
    [...document.querySelectorAll<HTMLAnchorElement>(".pc-side a")].find((a) => a.textContent?.trim() === label);
  return { link };
}

describe("the Storefront place in the sidebar", () => {
  it("shows the Media library from any admin page, not only from inside Storefront", () => {
    const { link } = draw("/admin/dashboard");
    expect(link("Media library")?.getAttribute("href")).toBe("/admin/media");
    expect(link("Website builder")?.getAttribute("href")).toBe("/site-builder");
    // Home is still the place lit up; Storefront is only open.
    expect(link("Home")?.hasAttribute("data-active")).toBe(true);
    expect(link("Storefront")?.hasAttribute("data-active")).toBe(false);
  });

  it("lights the Media library when it is the page open", () => {
    const { link } = draw("/admin/media");
    expect(link("Media library")?.hasAttribute("data-active")).toBe(true);
    expect(link("Website builder")?.hasAttribute("data-active")).toBe(false);
    expect(link("Home")?.hasAttribute("data-active")).toBe(false);
  });
});
