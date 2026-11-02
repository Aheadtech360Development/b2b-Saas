---
id: 544
title: Option rules on the builder product page
stage: general
date: 2026-11-02
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's screenshot of "Answers that rule others out" (Paper Type 14 pt -> Coating); rules do nothing on the shop; competitor narrows Coating to "No Coating" for 14 pt
labels: ["configurable-products", "option-rules", "website-builder", "storefront", "bug"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/optionRules.ts
 - frontend/src/components/storefront/ThemeProductBuy.tsx
 - frontend/src/components/storefront/ProductConfigurator.tsx
 - frontend/src/__tests__/builder-option-rules.test.tsx
 - backend/app/services/configurator_service.py
 - backend/app/services/theme_product.py
 - backend/app/api/v1/product_configurator.py
 - history/prompts/general/544-option-rules-on-builder-page.general.prompt.md
tests:
 - vitest builder-option-rules (4 new) + builder-configured-price (5) + sign-in-comes-back (11): pass
 - pytest tests/test_price_grid.py: 38 passed, 1 skipped
 - tsc --noEmit: no errors in src
---

## Prompt

ye rule shyd sai apply nh hory hain bhai mere kuke isme ye msla arha ha mere bhai ke isme na na hide hori fields na kch horha ha aur dusra abhi mei ek competitor dekhra tha usme ye bhi option tha jese ek field ke 4 options saiha usme se 14 pt coating select kia to already coating wali field mei no coating agya meri jan simple baki sari hatgyin aur baki 16 pt wagera mei options arhy thy jese proper any chayie selectables to plz dekho zara isey proper dekho isey aur mjhy batao saiha meri jan jaldi se

## Response snapshot

Cause: the website builder's product page (ThemeProductBuy, fed by services/theme_product.load) never received or applied the option rules; only the older page (ProductConfigurator via /products/{id}/options) did, and the server applied them when pricing, so a forbidden choice on the builder page only produced "Not available". Fix: theme_product.load sends `rules` (shared `configurator_service.public_rules`, also used by the public options endpoint); `lib/optionRules.evaluateRules` shared by both pages; ThemeProductBuy settles the rules on load and after every click (hide field, grey field with the note, grey a choice with the note and make it unpickable, move off a forbidden answer to the next allowed, leave switched-off answers out of the price and order, required check skips switched-off fields). The owner's two rules: "hide the field" hides Coating entirely on 14 pt. Competitor's behaviour ("14 pt -> Coating shows only No Coating, the rest gone") proposed as a new rule "show only these choices", not built; asked for the go-ahead and for push.

## Outcome

- ✅ Impact: rules work on builder product pages once pushed.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push; yes/no on "show only these choices".
- 🧠 Reflection: two product pages means every buyer-side rule needs both; a shared lib keeps them one.
