---
id: 637
title: Track order page new look
stage: general
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner says the Track your order page's look was copied from someone; replace it with our own, rounded corners and the like
labels: ["storefront", "track-order", "design"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/storefront/OrderTracking.tsx
 - frontend/src/app/(customer)/track-order/page.tsx
 - frontend/src/app/(customer)/track/[number]/page.tsx
tests:
 - order-tracking and checkout-thank-you tests (14 passed)
 - the new styles drawn in a browser at 1280 and 390 (screenshots looked at)
 - tsc
---

## Prompt

dekho track order ka page saiha good ha pr ye jo abhi design aur layout arha hana ye mene pehli kisi se copy kia tha to isey hatao tum yar ye sai nh ha jani plz yar mere bhai isko hatao tum dusra i mean curved borders wagera kch kro yar meri jan jaldi se saiha mere bhai jaldi kro

(screenshot: the Track your order page: serif title left, square card, uppercase labels, square navy button)

## Response snapshot

New look shared by both tracking pages (TRACKING_CSS): package icon in a rounded tile over a centred sans title, the form in a 20px-rounded card with a soft shadow, rounded 50px fields with hints (e.g. 1042, you@example.com) and a ring in the shop's colour on focus, a full-width rounded button, a help line under it, rounded step bars and an order-number pill in the tracking result. Words, labels and behaviour unchanged.

## Outcome

- ✅ Impact: the tracking pages no longer carry the copied look.
- 🧪 Tests: 14 tracking tests, browser screenshots at two widths, tsc.
- 📁 Files: OrderTracking styles, both tracking pages.
- 🔁 Next prompts: owner's yes to push (with 2a3b8a6).
- 🧠 Reflection: the page keeps platform fonts; the shop's own fonts and colours on app pages would be the next step if asked.
