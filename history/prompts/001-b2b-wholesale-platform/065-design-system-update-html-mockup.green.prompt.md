---
id: "065"
title: Design System Update from HTML Mockup
stage: green
date: 2026-04-03
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: design system update
labels: ["design", "frontend", "branding", "tailwind", "homepage", "header", "register"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/tailwind.config.ts
  - frontend/src/app/globals.css
  - frontend/src/app/layout.tsx
  - frontend/src/components/layout/Header.tsx
  - frontend/src/app/page.tsx
  - frontend/src/app/(customer)/products/page.tsx
  - frontend/src/app/(auth)/wholesale/register/page.tsx
tests:
  - npm run build (passed — all 48 routes compiled successfully)
---

## Prompt

Implement a design system update for the AF Apparels Next.js frontend using a provided HTML design reference. Steps included:

1. Update tailwind.config.ts with AF color palette (af.black, af.dark, af.mid, af.red, af.blue, af.gold, af.offwhite, af.border, af.text, af.muted) and Bebas Neue + Plus Jakarta Sans fonts.
2. Update globals.css with CSS custom properties for all AF colors, font variables, scrollbar styling, and AF design system component classes (af-btn-red, af-btn-ghost, af-btn-blue).
3. Update layout.tsx to load Google Fonts (Bebas Neue + Plus Jakarta Sans) via link tags and apply AF body styles.
4. Redesign Header.tsx: black background (#080808), AF logo with blue "A" + red "F", announcement bar, dark nav, ghost cart button, mobile hamburger — preserving all auth/cart functionality.
5. Redesign homepage (page.tsx): hero with black bg + radial gradient + grid pattern, trust strip, category grid, How It Works 4-step grid, Who We Serve dark section, Why Choose Us feature list, certifications, FAQ accordions, CTA, and footer.
6. Update products/page.tsx: dark banner (#111016) with Bebas Neue heading, updated layout wrapper.
7. Redesign wholesale/register/page.tsx: offwhite background, dark page header, two-column layout (form card + dark benefits sidebar), uppercase labels — preserving all form logic, state, and API calls.

## Response snapshot

All 7 files updated successfully. Build passed with 0 TypeScript errors (48 routes compiled). Committed and pushed to main (commit 0632cce).

Key design decisions applied:
- Colors: #080808 black, #111016 dark, #E8242A red, #1A5CFF blue, #F4F3EF offwhite, #E2E0DA border
- Fonts: Bebas Neue for headlines, Plus Jakarta Sans for body (loaded via Google Fonts link tags)
- Inline styles used for exact hex values not covered by Tailwind utility classes
- CSS variables (--font-bebas, --font-jakarta, --af-*) defined in :root for consistent cross-component use
- crossOrigin="" used in layout.tsx (not "anonymous") for Next.js JSX compatibility
- All existing API calls, auth logic, routing, and form validation preserved

## Outcome

- ✅ Impact: Full visual rebrand of public-facing pages matching HTML design mockup
- 🧪 Tests: npm run build passed — 48 routes, 0 TypeScript errors
- 📁 Files: 7 files modified
- 🔁 Next prompts: Product detail page redesign, login page redesign, admin dashboard theme update
- 🧠 Reflection: Inline styles were the right approach for exact hex values; CSS variables in globals.css enable consistent theming without requiring Tailwind config for every custom value

## Evaluation notes (flywheel)

- Failure modes observed: none — build passed first try after using crossOrigin="" instead of crossOrigin="anonymous"
- Graders run and results (PASS/FAIL): npm run build — PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add hover effects via CSS classes in globals.css instead of inline onMouseEnter handlers
