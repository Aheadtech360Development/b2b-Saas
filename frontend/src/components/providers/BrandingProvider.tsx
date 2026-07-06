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
  // Hero
  show_hero: boolean;
  hero_heading: string;
  hero_subheading: string;
  hero_image_url: string | null;
  hero_cta_text: string;
  hero_cta_link: string;
  hero_bg_color: string;
  hero_text_color: string;
  // Featured
  show_featured_categories: boolean;
  featured_categories_heading: string;
  show_featured_products: boolean;
  featured_products_heading: string;
  // Order + footer
  section_order: SectionKey[];
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
  show_hero: true,
  hero_heading: "",
  hero_subheading: "",
  hero_image_url: null,
  hero_cta_text: "Shop Now",
  hero_cta_link: "/products",
  hero_bg_color: "#F8F8F6",
  hero_text_color: "#1A1A1A",
  show_featured_categories: true,
  featured_categories_heading: "Shop by Category",
  show_featured_products: true,
  featured_products_heading: "Featured Products",
  section_order: ["hero", "featured_categories", "featured_products"],
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
    apiClient
      .get<Branding>("/api/v1/storefront/branding", { skipAuth: true })
      .then((b) => {
        if (cancelled || !b) return;
        const merged = { ...DEFAULT_BRANDING, ...b };
        setBranding(merged);
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
    return () => {
      cancelled = true;
    };
  }, []);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}
