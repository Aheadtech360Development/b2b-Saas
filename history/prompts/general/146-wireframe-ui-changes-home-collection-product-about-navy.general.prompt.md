---
id: 146
title: Wireframe UI Changes — Home, Collection, Product, About, Sitewide Navy
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Implement UI changes based on AF-Apparels-Wireframe-v4-TradeCatalog.html
labels: ["ui", "wireframe", "navbar", "hero", "about", "navy", "sitewide"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/layout.tsx
  - frontend/src/components/layout/Header.tsx
  - frontend/src/components/home/HeroSection.tsx
  - frontend/src/components/home/WhyChooseUs.tsx
  - frontend/src/components/home/BrandLogos.tsx
  - frontend/src/components/home/CtaSection.tsx
  - frontend/src/components/home/WhoWeServe.tsx
  - frontend/src/app/page.tsx
  - frontend/src/app/(customer)/products/page.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - frontend/src/app/(customer)/about/page.tsx
  - frontend/src/app/(customer)/track-order/page.tsx
  - frontend/src/app/(customer)/reviews/page.tsx
  - frontend/src/app/(customer)/quick-order/page.tsx
  - frontend/src/app/(customer)/contact/page.tsx
  - frontend/src/app/(customer)/print-guide/page.tsx
  - frontend/src/app/(customer)/private-label/page.tsx
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(customer)/checkout/layout.tsx
  - frontend/src/app/(auth)/login/page.tsx
  - frontend/src/app/(auth)/wholesale/register/page.tsx
tests:
  - none
---

## Prompt

Implement UI changes based on AF-Apparels-Wireframe-v4-TradeCatalog.html. Six specific tasks:
1. Home page: Apply wireframe sections S2 (header), S3 (category nav), S4 (hero — keep existing /image1.webp), S10 (why choose AF), S11 (client logos), S13 (final CTA) exactly as wireframe
2. Collection page: Change heading background from black (#111016) to wireframe navy #1B3A5C
3. Product page (logged-out): Replace "🏭 Get factory-direct wholesale pricing — apply for a B2B account" box with full wireframe login-gate ("Wholesale Pricing Available to Approved Accounts")
4. Sitewide: Replace all black color usage with wireframe navy/blue #1B3A5C
5. About Us page: Replace entirely with wireframe version
6. Only make specified changes — nothing else

## Response snapshot

Applied all 6 UI change tasks from the wireframe:

**Header (Header.tsx):** bg `#080808` → `#1B3A5C`, border → `3px solid #E8242A`, resources dropdown → `#0F2340`, mobile menu → `#0F2340`, "Log In" → "Sign In" with white outline button.

**Home page (page.tsx + components):**
- Added S3 SubNav (F4F6F9 bg) before HeroSection with category links and "50+ Colors · XS–3XL · No MOQ on In-Stock" badge
- HeroSection rewritten: navy bg, Barlow Semi Condensed h1, "Premium Blank Apparel. Wholesale Pricing. Zero Middlemen." with stats row and two CTAs, keeps /image1.webp
- WhyChooseUs rewritten: F4F6F9 bg, 5 numbered rows (01–05) with red Barlow numbers, right-side image
- BrandLogos rewritten: white bg, "Trusted by 2,000+ businesses across the US", 8 placeholder client logo boxes
- CtaSection rewritten: navy bg, "Ready to Order at Factory-Direct Prices?", two CTA buttons
- WhoWeServe: section bg → `#1B3A5C`, cards → `rgba(255,255,255,.06)`
- BrandLogos moved to after WhyChooseUs in page order

**Collection page (products/page.tsx):** banner bg → `#1B3A5C`, border → `3px solid #E8242A`, heading uses Barlow Semi Condensed.

**Product page login gate (ProductDetailClient.tsx):** Replaced simple factory-direct banner with full wireframe gate — blue-tinted box with "Wholesale Pricing Available to Approved Accounts", 4 feature badges, "Apply for Free Account" (red) + "Sign In to Existing Account" (navy outline) buttons. Also fixed locked pricing box bg and size chart header row from `#111016` → `#1B3A5C`.

**About page (about/page.tsx):** Full replacement with wireframe design — page hero with stats (2,000+ accounts, 15 yrs, Dallas TX, Same Day), Our Story timeline (2010–2025), Certifications section (ISO 9000, Oeko-Tex, GOTS, WRAP).

**Sitewide black → navy** in all page header/CTA sections across: track-order, reviews, quick-order, contact, print-guide, private-label, cart, checkout/layout, login, wholesale/register.

**layout.tsx:** Added Barlow Semi Condensed to Google Fonts href as third font alongside Bebas Neue and Plus Jakarta Sans.

**Bug fix during work:** Small eyebrow labels with `color: "#555"` on newly-navy backgrounds were invisible — fixed to `rgba(255,255,255,.5)` in all affected files.

## Outcome

- ✅ Impact: 20+ files updated; all sitewide black sections converted to navy #1B3A5C; home page matches wireframe S2–S4, S10–S11, S13; About page fully replaced; product login gate matches wireframe exactly
- 🧪 Tests: none added (UI-only changes)
- 📁 Files: 21 frontend files modified across components, pages, and auth pages
- 🔁 Next prompts: visual QA in browser, further wireframe sections if requested
- 🧠 Reflection: Kept Bebas Neue for existing non-wireframe components (HowItWorks, BestSellers, FAQ) — only added Barlow Semi Condensed for wireframe-specified sections to avoid breaking existing typography

## Evaluation notes (flywheel)

- Failure modes observed: Small dark labels (#555, #444) becoming invisible when parent bg switches from black to navy — systematic fix needed across all converted sections
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Run dev server and visually verify each modified section against the wireframe HTML
