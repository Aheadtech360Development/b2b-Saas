---
id: 243
title: Track Order Page UI Theme Match
stage: general
date: 2026-06-09
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: restyle track-order page to match website design tokens
labels: ["frontend", "ui", "theme", "track-order", "responsive"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/track-order/page.tsx
tests:
  - manual: visit /track-order — verify Fraunces h1, DM Sans body, flat cards, correct status badge colors
  - manual: look up a shipped order — verify IBM Plex Mono on order number and tracking number, #1C3557 tracking link
  - manual: resize to <600px — verify single-column form and full-width button
  - manual: submit invalid order — verify #fff5f5/#fed7d7 error state
---

## Prompt

Fix the "Track Your Order" page UI to match website theme. DO NOT change any tracking functionality or API calls. Design tokens: --bg #F8F8F6, --accent #1C3557, Fraunces heading, DM Sans body, IBM Plex Mono mono. Full spec provided for page layout, form, results, status badges, error state, and mobile responsive.

## Response snapshot

- **Removed** old dark navy header bar (custom branded header not part of sitewide layout)
- **Added** inline page header: Fraunces 36px h1 "Track Your Order" + DM Sans 15px #6B6B6B subtext
- **Form**: flat card (border: 1px solid #E2E2DE, no border-radius), inputs side-by-side via CSS Grid (1fr 1fr), single column on mobile
- **Inputs**: border-radius 0, DM Sans, focus → border-color #1C3557
- **Button**: #1C3557 background, hover opacity 0.88, disabled → #E2E2DE
- **Results**: restructured into named sections (Order Summary / Shipping / Items / Order Total) each with a section title (11px uppercase, border-bottom) and detail rows (flex, 10px 0 padding, alternating border-bottom)
- **Order number**: IBM Plex Mono 13px
- **Status badge**: per-spec bg+color pairs (confirmed #d1fae5/#065f46, pending #fef3c7/#92400e, processing #dbeafe/#1e40af, shipped #ede9fe/#5b21b6, delivered #d1fae5/#065f46)
- **Tracking number**: IBM Plex Mono 13px color #1C3557; tracking link color #1C3557, hover underline
- **Error**: #fff5f5 background, #fed7d7 border, #c53030 text
- **Mobile** (<600px): 32px 16px padding, 26px h1, 20px 16px form padding, single column grid, full-width button
- **STATUS_LABELS** updated to store `{ label, bg, color }` instead of `{ label, color }` to support new badge style
- All API calls, state hooks, interfaces, and data display logic unchanged

## Outcome

- ✅ Impact: Track order page now matches the sitewide visual language (Fraunces, DM Sans, IBM Plex Mono, navy accent, flat borders)
- 🧪 Tests: Manual — track a real order, check badge colors, check mobile layout, check error state
- 📁 Files: 1 file (frontend/src/app/(customer)/track-order/page.tsx)
- 🔁 Next prompts: Check on mobile device for any overflow issues
- 🧠 Reflection: Used a scoped `<style>` tag for hover/focus/responsive effects rather than mixing inline state handlers — keeps the JSX clean and makes media queries easy

## Evaluation notes (flywheel)

- Failure modes observed: none — build passed clean
- Graders run and results (PASS/FAIL): npm run build → PASS
- Prompt variant (if applicable): none
- Next experiment: none
