---
id: 660
title: Review sources connectors
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for a proper reviews connector for every brand - Google, Judge.me, Yelp - so reviews are authentic
labels: ["reviews", "integrations", "judgeme", "google", "yelp", "builder", "multi-tenant"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/review_sources/__init__.py
 - backend/app/services/review_sources/store.py
 - backend/app/services/review_sources/judgeme.py
 - backend/app/services/review_sources/google_place.py
 - backend/app/services/review_sources/yelp.py
 - backend/app/services/review_sources/rules.py
 - backend/app/services/review_sources/shop.py
 - backend/app/api/v1/admin/review_sources.py
 - backend/app/api/v1/products.py
 - backend/app/api/v1/reviews.py
 - backend/app/schemas/review.py
 - backend/app/services/builder/resolve.py
 - backend/app/services/builder/schema.py
 - backend/app/core/tenant_settings.py
 - backend/app/core/features.py
 - backend/app/core/permissions.py
 - backend/app/core/config.py
 - backend/app/main.py
 - backend/app/services/inventory_sync/config.py
 - backend/tests/test_review_sources.py
 - backend/tests/test_entitlements_locked.py
 - frontend/src/components/admin/reviews/ReviewSources.tsx
 - frontend/src/services/reviewSources.service.ts
 - frontend/src/app/(admin)/admin/products/reviews/page.tsx
 - frontend/src/components/admin/GoogleReviewsConnect.tsx
 - frontend/src/components/builder/islands/StoreReviews.tsx
 - frontend/src/components/builder/islands/YelpEmbeds.tsx
 - frontend/src/components/builder/islands/Reviews.tsx
 - frontend/src/components/builder/render.tsx
 - frontend/src/lib/builder/registry.ts
 - frontend/src/lib/builder/types.ts
 - frontend/src/lib/builder/baseCss.ts
 - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
 - frontend/src/__tests__/review-sources.test.tsx
tests:
 - backend tests/test_review_sources.py (44 new), test_advancepro_sync.py, test_builder_loyalty.py, test_entitlements_locked.py: 72 passed
 - frontend vitest review-sources (13 new), builder-layout-compat, builder-templates, builder-loyalty, builder-site, builder-header-footer: 130 passed
 - frontend tsc --noEmit: clean
 - local demo shop, real routes in-process: Judge.me import/match/hide/prune (rolled back), buyer check, rules (guest 401, staff 403, non-buyer 403, buyer 201 verified and held), Yelp save and public read, other business refused; test rows removed
---

## Prompt

acha ab suno ek cheeez mjhy ye krni ha ke har brand mei reviews ka option ha okay to mjhy wona google se connect krne ka option dena ha ya tumne judgem,reviews ka name suna ha jp shopify mei hota saiha wo bhi dena ke authenctica reviews hon okay mere bhai jese yelp wagera pr to proper reviews system conenctor bhi bana do ek proper saiha jaldi se

## Response snapshot

Built review sources in Marketing → Reviews, one tenant-scoped settings row per brand:
- Judge.me: shop domain + private token (header, never sent back), every product and store review imported into product_reviews (source judgeme), matched by URL handle then unique name, unmatched listed, Judge.me's own verified statuses, published state followed (a review the shop hides is never re-shown), prune only after a complete fetch, re-sync every 6 hours.
- Google: find the business by name (Places API (New), platform key GOOGLE_PLACES_API_KEY); only the place id is stored, details cached 24 h; rating, count and up to 5 Google-picked reviews with author attribution, Report link and Google Maps credit. The older Business Profile import stays and hides when the platform has no Google sign-in.
- Yelp: no API (Yelp's terms forbid platform use for other businesses and storing past 24 h); the brand pastes Yelp's own Embed review code, only the id and yelp.com links are kept, the snippet is rebuilt escaped and drawn by Yelp's script; only the brand's own business.
- Rules for reviews on the shop: any signed-in customer or buyers only, optional approval first; Verified buyer now means a paid or shipped/delivered order of that product; guests and shop staff can no longer post through the API; the product page asks before opening the form.
- New builder block "Reviews from…" (customers, Google or Yelp), each source shown on its own.
- Fixed: the AdvancePro inventory sync settings were one global row for all brands (key missing from TENANT_SCOPED_KEYS) and its scheduler never ran; now per brand with no global fallback, plus a guard test over every per-brand settings key. A stale entitlements test updated for the second add-on.

## Outcome

- ✅ Impact: brands can bring authentic reviews from Judge.me, Google and Yelp, and the shop's own "Verified buyer" is now true.
- 🧪 Tests: 72 backend + 130 frontend passed, tsc clean, local demo run through the real routes.
- 📁 Files: see list above.
- 🔁 Next prompts: owner's yes to push; GOOGLE_PLACES_API_KEY in Railway (Places API (New) on, billing on).
- 🧠 Reflection: a per-brand settings key must be in TENANT_SCOPED_KEYS; the new guard test catches the next one.
