---
id: 688
title: Cart settings UI and Purchase check
stage: general
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Settings → Cart and checkout looks broken; GTM says the purchase event does not fire
labels: ["admin", "ui", "upsells", "tracking", "gtm", "purchase"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(admin)/admin-shell.css
 - frontend/src/app/(admin)/admin/settings/cart/page.tsx
 - frontend/src/app/(admin)/admin/upsells/page.tsx
tests:
 - vitest admin-upsells + cart-upsells: 10 passed
 - local screenshots (made-up API answers) of Settings → Cart and checkout (desktop, phone) and Marketing → Upsells → New offer
 - live, read-only: Innterflow's tracking settings (GTM, GA4, Clarity, Meta on; checkout events on); its GTM container read from the public gtm.js (one Google Ads conversion tag on the custom event "purchase", reading ecommerce.transaction_id / value / currency); its thank-you page opened with a held Purchase for a made-up order number and EVERY hit aborted: the purchase reached the data layer and the Ads conversion tag fired
---

## Prompt

bhae ye dekho kitna ajeeb ui ha yar bhai ye to break break horha ha aur dusra ye ke gtag manager kehra event fire nh horha ha purchase ka wo sai kro yar bhai jaldi se yar

## Response snapshot

UI: the two new screens wrapped each label and its input in .pc-field, which in the admin is the bordered search box (flex row, 44px high, 320px wide), so label and input were squeezed into one box. Added .pc-formfield (label over input) to admin-shell.css and used it on Settings → Cart and checkout and on the upsell form. Purchase: on live, the thank-you page sends the purchase to the data layer in the shape Innterflow's GTM tag reads, and the Google Ads purchase conversion tag fires. Seen too: the tag fires twice per order (GA4's gtag event shares the data layer and matches the same trigger); Google Ads counts it once because the order number is the same. Asked the owner where they saw it not firing.

## Outcome

- ✅ Impact: both admin forms laid out properly; Purchase shown to work on live.
- 🧪 Tests: 10 vitest, screenshots, live read-only check.
- 📁 Files: admin-shell.css, cart settings page, upsells page.
- 🔁 Next prompts: owner's yes to push; owner says where (Tag Assistant, Google Ads, which shop) the purchase looked missing.
- 🧠 Reflection: .pc-field is the search box, not a form field.
