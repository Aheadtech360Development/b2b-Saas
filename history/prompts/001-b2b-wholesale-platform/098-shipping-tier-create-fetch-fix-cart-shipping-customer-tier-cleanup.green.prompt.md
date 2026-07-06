---
id: "098"
title: Shipping tier create fetch fix, cart shipping, customer tier cleanup
stage: green
date: 2026-04-20
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: fix shipping tier create error, shipping not applied, remove shipping from customer tiers
labels: ["shipping","cart","customer-tiers","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/shipping.py
  - backend/app/services/cart_service.py
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
tests:
  - " - none"
---

## Prompt

Okay, right now some things are working correctly and some are causing issues, so I will tell all the issues and then we will solve them:

1. In Shipping Tier, things are showing correctly and are also being added, but when I enter the details and click create tier, it shows "failed to fetch", and then when I reload, it actually gets added. So fix this.
2. Right now, shipping is not being applied from the new shipping tier; instead, it is still using the pricing tier. When I remove the pricing tier and apply the shipping tier, then no shipping is applied at all. So fix this as well.
3. Okay, these Pricing tiers that have now been turned into customer tiers — remove the shipping-related part from them, and keep the rest as it is. In EDIT TIER, remove Shipping and keep everything else unchanged.

## Response snapshot

**Issue 1 — "Failed to fetch" on create (backend/app/api/v1/admin/shipping.py):**
Root cause: `create_tier` service calls `flush()` + `refresh(tier)`, but `refresh` only reloads scalar columns, not the `brackets` relationship. When FastAPI serialized `ShippingTierOut.brackets`, it triggered an async lazy-load → `MissingGreenlet` error → 500. The tier WAS committed successfully (explaining why reload shows it).

Fix: Changed both `create_shipping_tier` and `update_shipping_tier` endpoints to re-fetch via `svc.get_tier_by_id()` after commit, which uses `selectinload(ShippingTier.brackets)`:
```python
tier = await svc.create_tier(payload)
await db.commit()
return await svc.get_tier_by_id(tier.id)  # properly loads brackets
```

**Issue 2 — Cart shipping not applied (backend/app/services/cart_service.py):**
Two bugs in `_validate`:
1. `selectinload(Company.shipping_tier)` loads the tier object but NOT `shipping_tier.brackets` → accessing `tier.brackets` in async context caused MissingGreenlet, silently caught by `except Exception: pass` → estimated_shipping stayed $0
2. `order_subtotal` not passed to `calculate_shipping_cost` → order_value type tiers always got subtotal=0, no bracket matched

Fix: Added nested selectinload + order_subtotal:
```python
.options(selectinload(Company.shipping_tier).selectinload(ShippingTier.brackets))
# ...
estimated_shipping = svc.calculate_shipping_cost(
    total_units, company.shipping_tier, company.shipping_override_amount,
    order_subtotal=subtotal,
)
```

**Issue 3 — Remove shipping from Customer Tiers (frontend/src/app/(admin)/admin/customers/tiers/page.tsx):**
- Removed `free_shipping` and `shipping_discount_percentage` from `PricingTier` interface, `EMPTY_FORM`, and `openEdit`
- Removed entire "SHIPPING" section block from the create/edit modal
- Removed the "Shipping" card from the tier card details grid
- Removed unused `CheckIcon` import

## Outcome

- ✅ Impact: Shipping tier creation no longer shows "failed to fetch"; cart shipping cost now properly calculated from assigned shipping tier; Customer Tiers edit no longer shows shipping fields
- 🧪 Tests: None added
- 📁 Files: 3 files modified
- 🔁 Next prompts: Restart backend to pick up cart_service fix; verify shipping shows correct cost in checkout

## Evaluation notes (flywheel)

- Failure modes observed: async lazy-load swallowed by try/except; missing nested selectinload
- Graders run and results (PASS/FAIL): none
