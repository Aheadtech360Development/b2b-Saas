---
id: 192
title: Four Platform Fixes — Pricing Stock Email Cart
stage: green
date: 2026-05-15
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix 4 regressions: Individual Variant Pricing not applying after group assignment; stock takes 7-10 min to update; approval email says wholesale for retail accounts; Quick Order cart icon not updating."
labels: ["variant-pricing","discount-group","redis-cache","stock","email","quick-order","cart-count"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/company_service.py
  - backend/app/services/order_service.py
  - backend/app/services/email_service.py
  - frontend/src/app/(customer)/quick-order/page.tsx
tests:
  - manual: Assign customer to Discount Group → variant pricing applies immediately (no 1-hour wait)
  - manual: Place order → product page stock updates within seconds, not 10 minutes
  - manual: Approve retail account → email says "your application" (not "your wholesale application")
  - manual: Quick Order → add to cart → cart icon count updates immediately without page reload
---

## Prompt

Fix 4 regressions: Individual Variant Pricing not applying after group assignment; stock takes 7-10 min to update; approval email says wholesale for retail accounts; Quick Order cart icon not updating.

## Response snapshot

**Fix 1 — `company_service.py` `update_company_tiers`**: Added Redis cache invalidation for `company:{company_id}:discount_group_id` key when `tags` is in the update payload. Root cause: `PricingMiddleware` caches `discount_group_id` per company for 1 hour; when admin assigns a customer to a Discount Group (adding tag to company.tags), the stale "none" cache prevented variant pricing from applying until TTL expired.

**Fix 2 — `order_service.py` `create_order`**: Collected `ordered_product_slugs` set during the cart item validation loop (step 3). After step 9.5 inventory deduction, added step 9.6 to call `redis_delete_pattern(f"products:detail:{slug}:*")` for each ordered product. Root cause: `_DETAIL_TTL = 600` (10 min) meant product page cached stock did not reflect deductions until cache expired.

**Fix 3 — `email_service.py` `send_application_approved`**: Changed "your wholesale application for" to "your application for" and updated subject from "Your AF Apparels Wholesale Account is Approved!" to "Your AF Apparels Account is Approved!". Root cause: email text was hardcoded for wholesale; retail approval now goes through the same function.

**Fix 4 — `quick-order/page.tsx` `handleAddToCart`**: Added `window.dispatchEvent(new Event("cart_updated"))` after any successful add. Root cause: Header listens for `cart_updated` event to refresh cart count; Quick Order was not dispatching it after `cartService.addMatrix` succeeded.

## Outcome

- ✅ Impact: Variant pricing applies immediately after admin assigns customer to Discount Group; stock updates instantly after order; approval email is neutral (no "wholesale" text); Quick Order cart icon updates without reload.
- 🧪 Tests: Manual — test all 4 test cases above.
- 📁 Files: 4 files modified — company_service.py, order_service.py, email_service.py, quick-order/page.tsx.
- 🔁 Next prompts: None.
- 🧠 Reflection: All 4 were Redis cache or event-dispatch gaps. Variant pricing broke because no cache invalidation on tag update; stock lag was exactly the 10-min product cache TTL; email was hardcoded; cart count uses a window event that Quick Order never fired.

## Evaluation notes (flywheel)

- Failure modes observed: stale Redis cache for discount_group_id; stale product detail cache after inventory deduction; hardcoded "wholesale" in shared email function; missing cart_updated event dispatch
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: null
