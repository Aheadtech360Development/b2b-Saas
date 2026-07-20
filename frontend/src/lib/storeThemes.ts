/**
 * Built-in starter themes. Each theme is a preset that populates the store's
 * existing, fully-editable structures — branding (colors, hero, homepage
 * sections), navigation menus, and standard pages. Activating a theme is just a
 * head start; everything stays editable afterwards.
 */
import type { Branding, MenuItem } from "@/components/providers/BrandingProvider";
import type { PageSection } from "@/components/storefront/SectionRenderer";

export interface ThemePage { slug: string; title: string; sections: PageSection[] }
export interface ThemeMenu { name: string; items: MenuItem[] }

export interface StoreTheme {
  id: string;
  name: string;
  description: string;
  swatch: string[];
  branding: Partial<Branding>;
  headerMenu: ThemeMenu;
  footerMenu: ThemeMenu;
  pages: ThemePage[];
}

// ── Shared page content (same across themes; fully editable after activation) ──
function aboutPage(): ThemePage {
  return {
    slug: "about", title: "About Us",
    sections: [
      { type: "hero", heading: "About Our Company", subheading: "Quality products and service you can count on.", image_url: null, buttons: [{ text: "Shop Our Products", link_type: "page", link_value: "/products" }] },
      { type: "image_text", heading: "Our Story", subheading: "Built for businesses like yours", body: "We started with a simple goal: make wholesale ordering fast, reliable, and affordable. Today we serve businesses of every size with quality products and dependable fulfillment.", image_url: null, layout: "image_right", buttons: [] },
      { type: "rich_text", heading: "Our Mission", body: "To help our customers grow by delivering exceptional products, honest pricing, and service that puts you first — every single order.", bg_color: "#FAFAF8" },
    ],
  };
}
function contactPage(): ThemePage {
  return {
    slug: "contact", title: "Contact Us",
    sections: [
      { type: "hero", heading: "Get in Touch", subheading: "Questions about orders, pricing, or opening a wholesale account? We're here to help.", image_url: null, buttons: [] },
      { type: "contact_form", heading: "Send Us a Message", subheading: "Fill out the form and our team will get back to you within one business day.", submit_text: "Send Message", fields: [
        { label: "Name", type: "text", required: true },
        { label: "Email", type: "email", required: true },
        { label: "Phone", type: "tel", required: false },
        { label: "Company", type: "text", required: false },
        { label: "Message", type: "textarea", required: true },
      ] },
    ],
  };
}
function policyPage(slug: string, title: string, intro: string): ThemePage {
  return {
    slug, title,
    sections: [
      { type: "rich_text", heading: title, body: `${intro}\n\n[This is starter text — replace it with your own ${title.toLowerCase()}.]`, bg_color: "#FFFFFF" },
      { type: "rich_text", heading: "Questions?", body: "If you have any questions about this policy, contact us and our team will be happy to help.", bg_color: "#FAFAF8" },
    ],
  };
}
function standardPages(): ThemePage[] {
  return [
    aboutPage(),
    contactPage(),
    policyPage("privacy-policy", "Privacy Policy", "Your privacy matters to us. This policy explains what information we collect, how we use it, and the choices you have."),
    policyPage("terms-of-service", "Terms of Service", "These terms govern your use of our store and services. By placing an order you agree to these terms."),
    policyPage("refund-policy", "Refund & Returns", "We want you to be happy with your order. This policy explains how returns, exchanges, and refunds work."),
  ];
}

const HEADER_MENU: ThemeMenu = {
  name: "Main menu",
  items: [
    { label: "Shop All", href: "/products" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
};
const FOOTER_MENU: ThemeMenu = {
  name: "Footer menu",
  items: [
    { label: "Shop", href: "/products", children: [{ label: "All Products", href: "/products" }] },
    { label: "Company", href: "/about", children: [{ label: "About Us", href: "/about" }, { label: "Contact", href: "/contact" }] },
    { label: "Legal", href: "/privacy-policy", children: [{ label: "Privacy Policy", href: "/privacy-policy" }, { label: "Terms of Service", href: "/terms-of-service" }, { label: "Refund & Returns", href: "/refund-policy" }] },
  ],
};

export const STORE_THEMES: StoreTheme[] = [
  {
    id: "aurora",
    name: "Aurora",
    description: "Clean, modern, professional. Navy + gold — great for a trusted B2B look.",
    swatch: ["#1C3557", "#E8B84B", "#F4F6FA"],
    branding: {
      primary_color: "#1C3557", secondary_color: "#F8F8F6", accent_color: "#E8B84B",
      font_heading: "'Poppins', sans-serif", font_body: "'Inter', sans-serif",
      card_style: "elevated", button_radius: 8, corner_radius: 12, section_spacing: "normal",
      header_layout: "logo_left",
      show_hero: true,
      hero_heading: "Quality Wholesale, Built for Your Business",
      hero_subheading: "Competitive pricing and fast, reliable fulfillment.",
      hero_cta_text: "Shop Now", hero_cta_link: "/products",
      hero_bg_color: "#F4F6FA", hero_text_color: "#1A1A1A",
      show_featured_categories: true, featured_categories_heading: "Shop by Category",
      show_featured_products: true, featured_products_heading: "Featured Products",
      home_sections: [
        { id: "aurora-it", type: "image_text", heading: "Why Businesses Choose Us", subheading: "", body: "Fast fulfillment, competitive wholesale pricing, and a quality-checked catalog — with a team that treats your business like a partner.", image_url: null, layout: "image_left", buttons: [{ text: "Browse Catalog", link_type: "page", link_value: "/products" }] },
        { id: "aurora-feat", type: "features", heading: "Why Businesses Choose Us", features: [
          { icon: "🚚", title: "Fast Shipping", text: "Most orders ship within 24 hours." },
          { icon: "✅", title: "Quality Checked", text: "Every product inspected before it ships." },
          { icon: "💰", title: "Wholesale Pricing", text: "Better prices as your volume grows." },
        ] },
        { id: "aurora-nl", type: "newsletter", heading: "Stay in the loop", subheading: "New products and wholesale offers, straight to your inbox.", submit_text: "Subscribe", placeholder: "Enter your email", bg_color: "#1C3557" },
      ],
      section_order: ["hero", "addon:aurora-feat", "featured_categories", "addon:aurora-it", "featured_products", "addon:aurora-nl"],
    },
    headerMenu: HEADER_MENU, footerMenu: FOOTER_MENU, pages: standardPages(),
  },
  {
    id: "onyx",
    name: "Onyx",
    description: "Bold and dark with a big rotating hero. Punchy and premium.",
    swatch: ["#111111", "#E63946", "#1A1A1A"],
    branding: {
      primary_color: "#111111", secondary_color: "#1A1A1A", accent_color: "#E63946",
      font_heading: "'Montserrat', sans-serif", font_body: "'Open Sans', sans-serif",
      card_style: "flat", button_radius: 0, corner_radius: 0, section_spacing: "compact",
      header_layout: "logo_center",
      show_hero: true,
      hero_heading: "Bold Products. Better Prices.",
      hero_subheading: "Stock up on best-sellers at true wholesale prices.",
      hero_cta_text: "Shop the Range", hero_cta_link: "/products",
      hero_bg_color: "#111111", hero_text_color: "#FFFFFF",
      show_featured_categories: false, featured_categories_heading: "Shop by Category",
      show_featured_products: true, featured_products_heading: "Best Sellers",
      home_sections: [
        { id: "onyx-slide", type: "slideshow", interval: 6, slides: [
          { image_url: null, heading: "New Season, New Stock", subheading: "Fresh arrivals every week.", button: { text: "Shop Now", link_type: "page", link_value: "/products" } },
          { image_url: null, heading: "Buy More, Save More", subheading: "Volume pricing for your business.", button: { text: "See Pricing", link_type: "page", link_value: "/products" } },
        ] },
        { id: "onyx-it", type: "image_text", heading: "Quality You Can Trust", subheading: "", body: "Every product is quality-checked before it ships. Order with total confidence.", image_url: null, layout: "image_right", buttons: [] },
        { id: "onyx-testi", type: "testimonials", heading: "What Our Customers Say", testimonials: [
          { quote: "Ordering has never been this easy. Fast, reliable, and great prices.", author: "Sara Ahmed", role: "Owner, Acme Traders", avatar_url: null },
          { quote: "Quality is consistent and the team actually picks up the phone.", author: "James Cole", role: "Buyer, Northline", avatar_url: null },
        ] },
        { id: "onyx-nl", type: "newsletter", heading: "Join the list", subheading: "Be first to know about drops and deals.", submit_text: "Subscribe", placeholder: "Your email", bg_color: "#111111" },
      ],
      section_order: ["hero", "addon:onyx-slide", "featured_products", "addon:onyx-it", "addon:onyx-testi", "addon:onyx-nl"],
    },
    headerMenu: HEADER_MENU, footerMenu: FOOTER_MENU, pages: standardPages(),
  },
  {
    id: "linen",
    name: "Linen",
    description: "Minimal and light. Airy layout with a soft, understated palette.",
    swatch: ["#2A2A2A", "#A3B18A", "#FAFAF8"],
    branding: {
      primary_color: "#2A2A2A", secondary_color: "#FAFAF8", accent_color: "#A3B18A",
      font_heading: "'Playfair Display', serif", font_body: "'Lato', sans-serif",
      card_style: "bordered", button_radius: 999, corner_radius: 2, section_spacing: "spacious",
      header_layout: "logo_center_below",
      show_hero: true,
      hero_heading: "Simple. Quality. Wholesale.",
      hero_subheading: "Thoughtfully sourced products for growing businesses.",
      hero_cta_text: "Explore", hero_cta_link: "/products",
      hero_bg_color: "#FAFAF8", hero_text_color: "#2A2A2A",
      show_featured_categories: true, featured_categories_heading: "Collections",
      show_featured_products: true, featured_products_heading: "Featured",
      home_sections: [
        { id: "linen-it", type: "image_text", heading: "Made for Modern Businesses", subheading: "", body: "A curated catalog, honest pricing, and service that respects your time.", image_url: null, layout: "image_left", buttons: [{ text: "Shop All", link_type: "page", link_value: "/products" }] },
        { id: "linen-gal", type: "gallery", heading: "From Our Catalog", subheading: "", columns: 3, images: [] },
        { id: "linen-faq", type: "faq", heading: "Frequently Asked Questions", faqs: [
          { question: "What is the minimum order?", answer: "There is no minimum — order exactly what your business needs." },
          { question: "How fast do you ship?", answer: "Most orders leave our warehouse within 24 hours." },
          { question: "Do you offer volume pricing?", answer: "Yes — pricing improves automatically as your order size grows." },
        ] },
        { id: "linen-nl", type: "newsletter", heading: "Keep in touch", subheading: "Occasional updates. No spam.", submit_text: "Subscribe", placeholder: "Email address", bg_color: "#2A2A2A" },
      ],
      section_order: ["hero", "addon:linen-it", "featured_categories", "featured_products", "addon:linen-gal", "addon:linen-faq", "addon:linen-nl"],
    },
    headerMenu: HEADER_MENU, footerMenu: FOOTER_MENU, pages: standardPages(),
  },
];
