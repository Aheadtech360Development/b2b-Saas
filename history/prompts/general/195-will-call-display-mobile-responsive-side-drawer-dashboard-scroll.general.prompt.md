---
id: 195
title: Will Call Display, Mobile Responsive, Side Drawer, Dashboard Scroll
stage: green
date: 2026-05-15
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Will Call Pickup location with icon; website responsive at 375px; mobile navbar side drawer; Customer/Admin dashboard horizontal scroll."
labels: ["responsive","mobile","navbar","will-call","checkout","hero","admin","dashboard","horizontal-scroll"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/components/home/HeroSection.tsx
  - frontend/src/components/layout/Header.tsx
  - frontend/src/components/layout/AdminSidebar.tsx
  - frontend/src/app/(admin)/layout.tsx
  - frontend/src/app/(customer)/account/orders/page.tsx
  - frontend/src/app/globals.css
tests:
  - manual: Checkout Step 1 → Will Call Pickup → location icon + address + hours info shown in structured layout
  - manual: Home page at 375px → hero image visible (shows above text column), stats below buttons in 2-column grid
  - manual: Mobile at ≤768px → tap hamburger → drawer slides in from left side (not top dropdown)
  - manual: Customer dashboard orders at 375px → table scrolls horizontally
  - manual: Admin dashboard at 375px → floating hamburger button visible, tap opens sidebar drawer from left
---

## Prompt

1. In Checkout Step 1 Will Call Pickup, show location with icon. 2. Make website responsive at 375px minimum width — hero image not visible on mobile, stats not in single line, second section not good on mobile. 3. Mobile navbar should open from side, not top. 4. Customer/Admin dashboard: horizontal scroll when area becomes small.

## Response snapshot

**Fix 1 — Will Call Pickup display (`checkout/address/page.tsx`)**: Special-cased rendering for `opt.id === "will_call"`. Now shows: a red MapPin SVG icon + "10719 Turbeville Rd, Dallas, TX 75243" in bold on one line; then three hour lines (before 12 PM, after 12 PM, Sat/Sun) in 11px muted text indented below the icon.

**Fix 2 — Hero section responsive (`HeroSection.tsx` + `globals.css`)**: Removed `className="hidden lg:flex"` from image column, replaced with `className="hero-img-col"`. Added `className="hero-inner"` to the outer flex container and `className="hero-stats-strip"` to the stats row. Added CSS in globals.css: `hero-img-col` shows on all screens; at ≤1024px it reorders to `order:-1` (image above text on mobile) with 220px height, shrinking to 180px at ≤640px. `hero-stats-strip` switches to `display:grid; grid-template-columns:1fr 1fr` at ≤600px with proper border/padding cleanup.

**Fix 3 — Mobile side drawer navbar (`Header.tsx`)**: Removed the inline `md:hidden` dropdown that opened from the top (rendered inside `<header>`). Replaced with a fixed `position:fixed; zIndex:200` overlay portal rendered OUTSIDE `<header>`, containing: dark backdrop, 280px slide-in drawer from left with dark navy background, header row with logo + close button, and all nav links including auth-aware actions (Apply for Wholesale / Log In buttons styled as solid buttons at bottom).

**Fix 4 — Admin sidebar mobile drawer (`AdminSidebar.tsx` + `admin/layout.tsx`)**: Added `mobileOpen` state to AdminSidebar. Added CSS classes `admin-sidebar-desktop` (hidden at ≤768px) and `admin-mobile-menu-btn` (hidden on desktop, shown on mobile). Added a fixed floating hamburger button (bottom-left, navy, circular) and a full-screen overlay drawer when open. Admin layout div gets `admin-layout-root` class; globals.css adds `flex-direction:column` on mobile. Customer account orders table: added `overflow-x-auto` + `minWidth:560px` on the table. Globals.css adds `.account-main table { min-width:520px }` and `overflow-x:auto` for `.account-main .overflow-hidden` containers.

## Outcome

- ✅ Impact: Will Call shows structured address+hours; hero image visible on mobile; mobile nav is a side drawer; dashboard tables scroll horizontally; admin sidebar accessible on mobile.
- 🧪 Tests: Manual — test all 5 test cases above at 375px viewport.
- 📁 Files: 7 files modified.
- 🔁 Next prompts: Individual dashboard pages may need per-page minWidth on tables.
- 🧠 Reflection: Hero image was `hidden lg:flex` — just needed CSS class swap. Mobile nav was inline dropdown inside header — moved to fixed portal. Admin sidebar had no mobile handling at all — added self-contained mobile state + floating FAB pattern.

## Evaluation notes (flywheel)

- Failure modes observed: hero image hidden on mobile via Tailwind class; inline header dropdown cannot slide from side; admin sidebar always rendered inline with no mobile mode
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: null
