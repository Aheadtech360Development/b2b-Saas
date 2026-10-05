---
id: 279
title: Hide Theme template on Website builder shops
stage: general
date: 2026-10-05
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: hide the old "Theme template" card on Website builder shops; keep it unchanged on imported-theme shops; test both; push
labels: ["visual-builder", "templates", "product-admin", "legacy-theme"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/admin/builder.py (assignment answer says builderLive)
 - backend/tests/test_builder_integration.py (3 new checks)
 - frontend/src/services/builder.service.ts (builderLive)
 - frontend/src/components/admin/WebsiteTemplateField.tsx (onSettled)
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx (Theme template card only when the builder is not live)
 - frontend/src/__tests__/product-edit-template-cards.test.tsx (new: the real page, both kinds of shop)
 - frontend/src/__tests__/website-template-field.test.tsx (4 new)
tests:
 - frontend vitest 199 passed (12 new; 2 pre-existing api-client failures)
 - backend test_builder_schema.py 47/47, test_builder_integration.py 105/105 (3 new), test_builder_security.py 35/35
 - browser probe_theme_card 21/21; regression probe_assign 29/29, probe_templates 60/60, probe_builder 41/41, probe_gaps 32/32
---

## Prompt

Yes, hide the old "Theme template" card for shops that are using the Website Builder.

Keep the old "Theme template" field unchanged for shops that are still using the imported/legacy theme system.

For Website Builder shops:
- Show only "Website template".
- Hide the old "Theme template" card completely.
- Do not remove or migrate the old database field.
- Do not change any existing legacy theme functionality.
- The "Website template" dropdown should remain the single source of truth for Website Builder product templates.

The goal is simply to avoid showing two confusing template options to merchants when only the Website Builder template is actually used.

Please add/update the relevant tests for both cases:
1. Website Builder shop → old Theme template hidden, Website template visible.
2. Legacy/imported theme shop → old Theme template still visible and unchanged.

Then run the relevant regression tests and push the change to main.

## Response snapshot

**What "using the Website builder" means here.** Exactly what the storefront checks before it draws a product page with the builder: the shop is in builder mode *and* has a site published. The server now says so in one field, `builderLive`, on the answer the product page already asks for (`GET …/builder/assignment`), so the admin page and the storefront cannot disagree — and no extra request is made.

**The product page.** The "Theme template" card is drawn only when `builderLive` is false. While the answer is still out it is not drawn at all, so a builder shop never sees it flash by. On any failure to find out (no builder, no permission to the design, no connection) the answer is "not live" and the page shows what it always has.

**Nothing else moved.** `products.template_id`, the `product_templates` table, the legacy product page and its API are untouched; the save still sends the product's `template_id` as it holds it, so a hidden card never clears it. A shop that goes back to its imported theme gets the card back with its value intact. The collection page has no old card, so nothing to hide there.

**Three states, tested:**

| Shop | Website template | Theme template |
|---|---|---|
| On the Website builder (switched + published) | shown | hidden |
| Imported theme, never opened the builder | — | shown, unchanged |
| Imported theme, with a builder draft (not switched) | shown | shown, unchanged |

## Outcome

- ✅ Impact: a merchant on the Website builder sees one template choice for a product, the one that is used; a merchant on an imported theme sees exactly what they saw before.
- 🧪 Tests: as listed above. The page-level test renders the real product edit page for each kind of shop, including that Save still sends template_id (kept on a builder shop, changed on a legacy one).
- 📁 Files: as listed above.
- 🔁 Next prompts:
  - "Theme layout" (the imported theme's product layouts) is a third template-like card; it only appears for a shop whose imported theme has product layouts, and on a builder shop it too does nothing.
- 🧠 Reflection: the first browser run "proved" there was no flash with a watcher that had failed to attach; a check that cannot fail proves nothing. The fixed probe includes a control: the same watcher must see the card on the legacy shop.

## Evaluation notes (flywheel)

- Failure modes observed:
  - A vacuous assertion (MutationObserver attached to a document with no root yet).
  - A half-written generated file (.next/dev/types) stopping tsc before it reached the source.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): gate "Theme layout" on the same builderLive flag if the owner wants it.
