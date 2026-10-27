---
id: 487
title: Home Sales with sessions, conversion rate and custom dates
stage: general
date: 2026-10-27
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Add Sessions, Conversion rate and a custom date range to Home's Sales, and move it to the top, on every brand
labels: ["dashboard", "sessions", "conversion-rate", "attribution", "migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0067_storefront_visits.py
 - backend/app/services/visits.py
 - backend/app/services/attribution.py
 - backend/app/services/admin_home.py
 - backend/app/services/report_view.py
 - backend/app/api/v1/admin/home.py
 - backend/app/api/v1/storefront.py
 - backend/app/api/v1/checkout.py
 - backend/app/api/v1/guest.py
 - backend/tests/test_visits.py
 - frontend/src/lib/attribution.ts
 - frontend/src/components/admin/HomeSales.tsx
 - frontend/src/app/(admin)/admin/dashboard/page.tsx
 - frontend/src/app/(admin)/admin-shell.css
 - frontend/src/__tests__/attribution-journey.test.ts
 - frontend/src/__tests__/home-sales.test.tsx
 - frontend/src/app/(customer)/account/portal.css (separate commit)
 - frontend/src/__tests__/builder-header-footer.test.tsx (separate commit)
tests:
 - backend/tests/test_visits.py (new, 8); whole backend suite: 537 passed, 0 failed (89 errors = tests that need the 5432 database or Redis, not running here)
 - frontend: attribution-journey (10) + home-sales (3, new) + server-tracking pass; whole suite 678 passed, 2 failed before the portal fix, both from the portal redesign d9c2353 (header layer test now passes; the buyer order page test still fails on its mocks)
 - tsc --noEmit clean
 - local DB (5440): migration 0067 applied; in a rolled-back transaction 3 visits kept (crawler and repeat refused), the order's last visit marked converted once, Today / 7 days / All time / custom: 3 sessions, 1 converted, 33.33%; another shop's admin sees none (row security)
---

## Prompt

Add Conversion Rate and of Number of sessions. also add custom date range. And take this section on top   acha ab ye krna ha har brand ke dashboard pe plz isko proper dekho meri jan

(then, mid-way) ek min dekhlena conversion rate ka formula ha 100 bndy ae website ae 5 log ne buy kra to ye 5 percent hogya saiha jani dekhlo na

## Response snapshot

- Formula confirmed: conversion rate = sessions that placed an order ÷ all sessions × 100 (100 visits, 5 ordered = 5%), as Shopify counts it; counted per visit, so one person on two days is two sessions.
- Nothing counted visits before (the Reports "conversion rate" is paid orders out of all orders). New table `storefront_visits` (0067, row security like the builder tables): the storefront reports each new visit once with its own id (lib/attribution.ts → public POST /storefront/visits, rate limited, crawlers and test browsers skipped, same naming as the order page: direct, Google search, Google Ads, Meta…); the checkout (signed-in and guest) marks the visit that placed the order (`visits.mark_converted`, never fails an order).
- GET /admin/home/sales (today | 7d | 30d | 90d | all | custom with date_from/date_to, the viewer's or the shop's clock as Reports): total sales, orders, average order (Reports' own count), sessions, converted sessions, conversion rate, and since when visits are counted.
- Home: Sales moved to the top, full width, with Total sales, Orders, Average order, Sessions, Conversion rate ("5 of 100 sessions placed an order"), periods Today / 7 days / 30 days / All time / Custom (From, To, Apply); sessions note "Counted since …" for days before counting began; phone layout two tiles a row.
- Found on the way: the customer portal's top bar had the same layer as the shop's header (40), so a builder header's menu opened under it on account pages (fixed before in 4a1bd71, undone by the portal redesign). Bar set to 35; the test reads portal.css now.

## Outcome

- ✅ Impact: every brand's Home shows sessions and a real conversion rate for any days, at the top.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's yes to push (migration 0067 runs at start); the buyer order page test mocks.
- 🧠 Reflection: sessions start from the day the storefront reports them; the card says so instead of showing 0% for the past.
