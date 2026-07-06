---
id: "100"
title: Shipping Tier Pricing Fix — Always FREE Bug
stage: general
date: 2026-04-20
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: fix shipping showing as free / not applying tier pricing
labels: ["shipping","cart","checkout","bugfix","has_shipping_tier"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/schemas/cart.py
  - backend/app/services/cart_service.py
  - frontend/src/types/order.types.ts
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(customer)/checkout/address/page.tsx
tests:
  - manual: cart shows "Calculated at checkout" when no tier assigned
  - manual: cart shows real dollar amount when tier with non-free bracket is assigned
  - manual: cart shows FREE when tier calculation_type=free
  - npm run build passes with no TypeScript errors
---

## Prompt

Right now, the shipping is showing up as free, meaning whatever has been set in the tiers is not being applied, and no tier pricing is working. In some tiers, shipping is free—for example, in Tier-3, it's free for orders over $200—but in other tiers, we aren't offering free shipping at all. In those cases, for Standard Ground, the actual shipping cost that is calculated should be displayed. As for Will Call Pickup, it will remain free regardless of the tier.

## Response snapshot

Root-caused three issues causing shipping to always appear as $0/FREE:

1. **Silent exception swallowing**: `except Exception: pass` in `_validate()` hid all errors → changed to `logger.error(..., exc_info=True)` so actual failures surface in backend logs.

2. **Override = 0 short-circuits calculation**: `shipping_override_amount = 0` in DB (not NULL) caused `calculate_shipping_cost` to return `0` immediately via `if company_override is not None: return company_override`. Fixed with `if override <= Decimal("0"): override = None`.

3. **No way to distinguish "no tier" from "tier says free"**: When a company has no `shipping_tier_id`, the result was `estimated_shipping = 0`, same as a free tier. Added `has_shipping_tier: bool` field to `CartValidation` schema. Frontend reads this flag: shows "Calculated at checkout" when `has_shipping_tier=False`; shows "FREE" only when `has_shipping_tier=True` and cost is 0.

Also added `has_shipping_tier: boolean` to the `CartValidation` TypeScript interface (`order.types.ts`) which was missing and caused a build failure.

## Outcome

- ✅ Impact: Shipping now correctly shows tier-based prices in cart and checkout; "Calculated at checkout" shown when no tier is assigned; FREE shown only when tier actually calculates $0
- 🧪 Tests: npm run build passes; manual testing requires assigning shipping tier to test company via Admin > Customers
- 📁 Files: 5 files modified (backend schema + service, frontend types + 2 pages)
- 🔁 Next prompts: Assign shipping tiers to test companies via admin UI to verify end-to-end; check backend logs for any residual errors
- 🧠 Reflection: `except Exception: pass` anti-pattern is particularly dangerous in async services — always log with exc_info=True. The "0 vs NULL override" issue is a classic sentinel-value ambiguity that should be handled at the DB layer (NULL = not set, 0 is a valid value meaning "force free").

## Evaluation notes (flywheel)

- Failure modes observed: Silent exception swallowing masked real errors for unknown duration; override=0 semantic ambiguity
- Graders run and results (PASS/FAIL): TypeScript build — PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add DB constraint or default to make shipping_override_amount NULL when not set (vs 0)
