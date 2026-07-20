"use client";

/**
 * BrandingProvider — fetches the current brand's storefront config (by subdomain)
 * and provides it to all storefront chrome (Header, AnnouncementBar, Footer, …).
 *
 * Server + first-client render use the neutral DEFAULT (no hydration mismatch);
 * the real branding loads client-side right after mount.
 */
import { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { PageSection } from "@/components/storefront/SectionRenderer";

export interface MenuItem {
  label: string;
  href: string;
  children?: MenuItem[];
}

export type SectionKey = "hero" | "featured_categories" | "featured_products";

export interface Branding {
  store_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  // Announcement
  announcement_text: string;
  show_announcement: boolean;
  announcement_bg_color: string;
  announcement_text_color: string;
  // Nav
  menu_items: MenuItem[];
  footer_menu_items: MenuItem[];
  header_menu_id: string | null;
  footer_menu_id: string | null;
  header_layout: "logo_left" | "logo_center" | "logo_center_below";
  show_cart: boolean;
  // Typography (CSS font-family strings)
  font_heading: string;
  font_body: string;
  active_theme: string | null;
  // Theme style — what makes themes look different beyond colour
  card_style: "bordered" | "elevated" | "flat";
  button_radius: number;
  corner_radius: number;
  section_spacing: "compact" | "normal" | "spacious";
  // Hero
  show_hero: boolean;
  hero_heading: string;
  hero_subheading: string;
  hero_image_url: string | null;
  hero_cta_text: string;
  hero_cta_link: string;
  hero_bg_color: string;
  hero_text_color: string;
  hero_image_radius: number;
  hero_image_opacity: number;
  // Featured
  show_featured_categories: boolean;
  featured_categories_heading: string;
  featured_category_ids: string[];
  featured_categories_view_all_text: string;
  featured_categories_view_all_link: string;
  featured_categories_limit: number;
  show_featured_products: boolean;
  featured_products_heading: string;
  featured_product_ids: string[];
  featured_products_view_all_text: string;
  featured_products_view_all_link: string;
  featured_products_limit: number;
  // Order + footer. Entries are fixed keys ("hero", "featured_categories",
  // "featured_products") or homepage addons referenced as "addon:<id>".
  section_order: string[];
  home_sections: PageSection[];
  footer_text: string;
  tagline: string;
  support_email: string;
  support_phone: string;
  email_sender_name: string;
}

export const DEFAULT_BRANDING: Branding = {
  store_name: "Store",
  logo_url: null,
  favicon_url: null,
  primary_color: "#1C3557",
  secondary_color: "#F8F8F6",
  accent_color: "#E8B84B",
  announcement_text: "",
  show_announcement: false,
  announcement_bg_color: "#1C3557",
  announcement_text_color: "#FFFFFF",
  menu_items: [{ label: "Shop All", href: "/products" }],
  footer_menu_items: [],
  header_menu_id: null,
  footer_menu_id: null,
  header_layout: "logo_left",
  show_cart: true,
  font_heading: "'Fraunces', serif",
  font_body: "'DM Sans', sans-serif",
  active_theme: null,
  card_style: "bordered",
  button_radius: 4,
  corner_radius: 6,
  section_spacing: "normal",
  show_hero: true,
  hero_heading: "",
  hero_subheading: "",
  hero_image_url: null,
  hero_cta_text: "Shop Now",
  hero_cta_link: "/products",
  hero_bg_color: "#F8F8F6",
  hero_text_color: "#1A1A1A",
  hero_image_radius: 4,
  hero_image_opacity: 100,
  show_featured_categories: true,
  featured_categories_heading: "Shop by Category",
  featured_category_ids: [],
  featured_categories_view_all_text: "View all",
  featured_categories_view_all_link: "/products",
  featured_categories_limit: 4,
  show_featured_products: true,
  featured_products_heading: "Featured Products",
  featured_product_ids: [],
  featured_products_view_all_text: "View all",
  featured_products_view_all_link: "/products",
  featured_products_limit: 4,
  section_order: ["hero", "featured_categories", "featured_products"],
  home_sections: [],
  footer_text: "",
  tagline: "",
  support_email: "",
  support_phone: "",
  email_sender_name: "",
};

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

export const useBranding = () => useContext(BrandingContext);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;

    function fetchBranding() {
      apiClient
        .get<Branding>("/api/v1/storefront/branding", { skipAuth: true })
        .then((b) => {
          if (cancelled || !b) return;
          const merged = { ...DEFAULT_BRANDING, ...b };
          setBranding(merged);
          // Push brand colors + fonts to CSS variables so the WHOLE store
          // (header, footer, every page, buttons) uses them — not just the home.
          if (typeof document !== "undefined") {
            const root = document.documentElement;
            root.style.setProperty("--brand-primary", merged.primary_color || "#1C3557");
            root.style.setProperty("--brand-secondary", merged.secondary_color || "#F8F8F6");
            root.style.setProperty("--brand-accent", merged.accent_color || "#E8B84B");
            root.style.setProperty("--brand-font-heading", merged.font_heading || "'Fraunces', serif");
            root.style.setProperty("--brand-font-body", merged.font_body || "'DM Sans', sans-serif");

            // Style knobs — these are what make one theme *feel* different from
            // another (card treatment, button shape, vertical rhythm).
            const radius = merged.corner_radius ?? 6;
            root.style.setProperty("--brand-radius", `${radius}px`);
            root.style.setProperty("--brand-btn-radius", `${merged.button_radius ?? 4}px`);

            const card = merged.card_style || "bordered";
            root.style.setProperty(
              "--brand-card-shadow",
              card === "elevated" ? "0 6px 22px rgba(0,0,0,.10)" : "none",
            );
            root.style.setProperty(
              "--brand-card-border",
              card === "flat" ? "none" : "1px solid #E2E2DE",
            );
            root.style.setProperty("--brand-card-radius", card === "flat" ? "0px" : `${radius}px`);
            root.style.setProperty("--brand-card-bg", card === "flat" ? "transparent" : "#fff");

            const sp = merged.section_spacing || "normal";
            root.style.setProperty(
              "--brand-section-py",
              sp === "compact" ? "40px" : sp === "spacious" ? "96px" : "64px",
            );
          }
          // Apply brand identity to the browser tab (title + favicon).
          if (typeof document !== "undefined") {
            if (merged.store_name && merged.store_name !== "Store") document.title = merged.store_name;
            if (merged.favicon_url) {
              let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
              if (!link) {
                link = document.createElement("link");
                link.rel = "icon";
                document.head.appendChild(link);
              }
              link.href = merged.favicon_url;
            }
          }
        })
        .catch(() => {
          /* keep defaults */
        });
    }

    fetchBranding();

    // Re-fetch when the tab regains focus so edits made in the admin panel show
    // up on the storefront without a manual page reload.
    function onFocus() { fetchBranding(); }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) fetchBranding(); });

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}
