---
id: 232
title: Sort Bar Position PDP Sticky Email Flyer Map Theme
stage: general
date: 2026-06-05
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: fix 6 UI issues
labels: ["ui", "responsive", "pdp", "collections", "quick-order", "reviews", "contact", "theme"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/products/ProductListClient.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - frontend/src/app/(customer)/contact/ContactContent.tsx
  - frontend/src/app/(customer)/reviews/page.tsx
  - frontend/src/app/(customer)/quick-order/page.tsx
  - frontend/src/app/globals.css
tests:
  - npm run build (clean, 0 errors)
---

## Prompt

Fix 6 specific issues. Read relevant files first. DO NOT change any functionality except what is listed. All fixes must be mobile responsive.

Fix 1: Collection sort bar below filters button — move sort from <select> to button row (Featured | Price: Low–High | Price: High–Low | New Arrivals) below filter/count row. borderBottom 1px solid #E2E2DE, padding 8px 0 12px. Active: #1C3557 bold.

Fix 2: PDP gallery sticky — add position sticky, top 24px, alignSelf start to left gallery column. Disable on mobile.

Fix 3: PDP replace Download Style Sheet with Email Flyer — change gallery links to row layout, replace link with "↓ Email Flyer" calling handleEmailFlyer().

Fix 4: PDP remove Print Guide tab — remove from TABS array and delete tab content block.

Fix 5: Contact page Google Maps iframe — replace placeholder div with <iframe> embed for 10719 Turbeville Rd, Dallas TX 75243, 220px tall.

Fix 6: Quick Order + Reviews theme — apply AF design system (#F8F8F6 bg, DM Sans/Fraunces, #1C3557 accent, #E2E2DE borders, white header) replacing old dark navy (#1B3A5C) theme.

Then: npm run build, fix TypeScript, commit "fix: sort bar position, PDP sticky gallery, email flyer, map embed, theme quick order and reviews", push.

## Response snapshot

All 6 fixes implemented across 6 files. Build passed clean (0 TypeScript errors, 79 static pages). Committed and pushed as 0bb4384.

- ProductListClient.tsx: sort <select> removed, new button row added below top bar with Featured/Price Low-High/Price High-Low/New Arrivals buttons
- ProductDetailClient.tsx: TABS array lost "Print Guide", left gallery div got sticky styles via className="pdp-gallery-col", gallery links changed to row flex with "↓ Email Flyer", Print Guide tab block removed
- ContactContent.tsx: map placeholder replaced with Google Maps <iframe>
- reviews/page.tsx: full theme rewrite — white header, Fraunces h1, DM Sans body, #1C3557 accents
- quick-order/page.tsx: header bg #FFFFFF, Fraunces h1, DM Sans, #1C3557 buttons, #F8F8F6 page bg
- globals.css: added .pdp-gallery-col { position: static } at 900px breakpoint

## Outcome

- ✅ Impact: 6 UI fixes shipped — sort UX improved, PDP gallery stays visible while scrolling, email flyer link prominent, print guide tab removed, live map embed on contact page, quick-order and reviews now match AF design system
- 🧪 Tests: npm run build — clean, 0 errors
- 📁 Files: 6 files modified
- 🔁 Next prompts: further responsive testing, PDP tab bar reorder if needed
- 🧠 Reflection: Sticky gallery requires alignSelf: start on grid child; mobile override via CSS class avoids sticky-inside-overflow issues

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): build PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): test sticky gallery scroll behavior in browser with real product content
