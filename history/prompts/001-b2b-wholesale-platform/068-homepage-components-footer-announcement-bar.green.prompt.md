---
name: Homepage Components, Footer, Announcement Bar
description: Refactored homepage into 9 separate components, created global branded Footer with fixed colors, and sliding marquee AnnouncementBar
type: green
stage: green
date: 2026-04-03
feature: 001-b2b-wholesale-platform
surface: agent
model: claude-sonnet-4-6
branch: main
user: RT
id: "068"
labels: ["refactor", "components", "footer", "announcement-bar", "mobile", "frontend"]
links:
  spec: "null"
  ticket: "null"
  adr: "null"
  pr: "null"
---

## Prompt

Refactor AF Apparels frontend - components, footer, and announcement bar fixes.
- Break homepage into components (HeroSection, TrustStrip, CategoryGrid, HowItWorks, WhoWeServe, WhyChooseUs, Certifications, FaqSection, CtaSection)
- Create global Footer component with fixed colors (#888 links, #aaa headings, #666 body text)
- Add Footer to customer/auth/admin layouts
- Create AnnouncementBar with desktop static + mobile marquee animation
- Replace inline announcement bar in Header.tsx with AnnouncementBar component

## Response

### Files Created
- `frontend/src/components/home/HeroSection.tsx` — hero with stats, CTA buttons, image placeholder
- `frontend/src/components/home/TrustStrip.tsx` — 6 trust badges on white bar
- `frontend/src/components/home/CategoryGrid.tsx` — 3-col category cards with fallback static data
- `frontend/src/components/home/HowItWorks.tsx` — 4-step process grid
- `frontend/src/components/home/WhoWeServe.tsx` — 4 customer type cards on dark bg
- `frontend/src/components/home/WhyChooseUs.tsx` — 5 reasons list + image placeholder
- `frontend/src/components/home/Certifications.tsx` — 4 cert cards
- `frontend/src/components/home/FaqSection.tsx` — 5 FAQ accordion items
- `frontend/src/components/home/CtaSection.tsx` — final CTA on dark bg
- `frontend/src/components/layout/AnnouncementBar.tsx` — "use client", desktop static, mobile marquee

### Files Modified
- `frontend/src/app/page.tsx` — reduced to 35 lines, imports all home components
- `frontend/src/components/layout/Footer.tsx` — full branded footer replacing placeholder; fixed text colors
- `frontend/src/components/layout/Header.tsx` — replaced inline announcement bar with `<AnnouncementBar />`
- `frontend/src/app/(customer)/layout.tsx` — added `<Footer />`
- `frontend/src/app/(auth)/layout.tsx` — added `<Footer />`
- `frontend/src/app/(admin)/layout.tsx` — added `<Footer />`
- `frontend/src/app/globals.css` — added `@keyframes marquee`, `.marquee-track`, `.marquee-track:hover` pause

### Color fixes in Footer
- Link text: `#888` (was `#333` — invisible on `#040406` bg)
- Headings: `#aaa` (was `#333`)
- Brand description: `#666` (was `#3a3a4a`)
- Payment badges text: `#666`, border `rgba(255,255,255,.08)` (was `rgba(255,255,255,.04)`)
- Copyright: `#444` (was `#222`)

## Outcome

- Build: PASS (no TS errors, 48 pages)
- Commit: `1b94db1` — "refactor: homepage components, global footer, sliding announcement bar"
- Pushed to: origin/main
