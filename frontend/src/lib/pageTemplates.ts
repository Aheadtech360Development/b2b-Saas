/**
 * Built-in page templates — ready-made section layouts a brand can start from.
 * "Customize this" creates a new page pre-filled with these sections, then opens
 * the editor. All content is placeholder copy meant to be edited.
 */
import type { PageSection } from "@/components/storefront/SectionRenderer";

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  /** Default title suggested when creating the page. */
  suggestedTitle: string;
  /** Mini-preview: ordered block kinds shown as a thumbnail. */
  preview: ("hero" | "image_text" | "rich_text")[];
  sections: PageSection[];
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "about",
    name: "About Us",
    description: "Tell your brand story — hero, an image-and-text block, and a mission statement.",
    suggestedTitle: "About Us",
    preview: ["hero", "image_text", "rich_text"],
    sections: [
      {
        type: "hero",
        heading: "About Our Company",
        subheading: "Quality products and service you can count on.",
        image_url: null,
        bg_color: "#F8F8F6",
        text_color: "#1A1A1A",
        buttons: [{ text: "Shop Our Products", link_type: "page", link_value: "/products" }],
      },
      {
        type: "image_text",
        heading: "Our Story",
        subheading: "Built for businesses like yours",
        body: "We started with a simple goal: make wholesale ordering fast, reliable, and affordable. Today we serve businesses of every size with quality products and dependable fulfillment.",
        image_url: null,
        layout: "image_right",
        buttons: [],
      },
      {
        type: "rich_text",
        heading: "Our Mission",
        body: "To help our customers grow by delivering exceptional products, honest pricing, and service that puts you first — every single order.",
        bg_color: "#FAFAF8",
      },
    ],
  },
  {
    id: "landing",
    name: "Landing / Promo",
    description: "A conversion-focused page — bold hero, two feature blocks, and a closing call to action.",
    suggestedTitle: "New Arrivals",
    preview: ["hero", "image_text", "image_text", "rich_text"],
    sections: [
      {
        type: "hero",
        heading: "Big Savings This Season",
        subheading: "Stock up on best-sellers at wholesale prices.",
        image_url: null,
        bg_color: "#1C3557",
        text_color: "#FFFFFF",
        buttons: [{ text: "Shop the Sale", link_type: "page", link_value: "/products" }],
      },
      {
        type: "image_text",
        heading: "Top Quality, Every Time",
        body: "Every product is quality-checked before it ships. Order with confidence knowing you get exactly what you expect.",
        image_url: null,
        layout: "image_left",
        buttons: [{ text: "Browse Catalog", link_type: "page", link_value: "/products" }],
      },
      {
        type: "image_text",
        heading: "Fast, Reliable Fulfillment",
        body: "Most orders ship within 24 hours. Track everything from your account and never wonder where your order is.",
        image_url: null,
        layout: "image_right",
        buttons: [],
      },
      {
        type: "rich_text",
        heading: "Ready to order?",
        body: "Create an account or sign in to see your wholesale pricing and place your first order today.",
        bg_color: "#F8F8F6",
      },
    ],
  },
  {
    id: "contact",
    name: "Contact",
    description: "A simple contact page — hero, your details and hours, plus a visit-us block.",
    suggestedTitle: "Contact Us",
    preview: ["hero", "rich_text", "image_text"],
    sections: [
      {
        type: "hero",
        heading: "Get in Touch",
        subheading: "We're here to help with orders, questions, and anything else.",
        image_url: null,
        bg_color: "#F8F8F6",
        text_color: "#1A1A1A",
        buttons: [],
      },
      {
        type: "rich_text",
        heading: "Contact Details",
        body: "Email: support@yourstore.com\nPhone: +1 (555) 123-4567\nHours: Monday–Friday, 9am–6pm",
        bg_color: "#FFFFFF",
      },
      {
        type: "image_text",
        heading: "Visit Us",
        body: "Stop by our location or reach out anytime — our team is always happy to help you find the right products for your business.",
        image_url: null,
        layout: "image_left",
        buttons: [{ text: "Browse Products", link_type: "page", link_value: "/products" }],
      },
    ],
  },
];
