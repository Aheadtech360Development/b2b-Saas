---
id: 104
title: Customer Detail Discount Group Pricing & Shipping
stage: general
date: 2026-04-23
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: continue
labels: ["customer-detail","discount-groups","pricing-shipping","cleanup"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/customers/[id]/page.tsx
tests:
  - null
---

## Prompt

(Session continuation) Update the customer detail page Pricing & Shipping section: remove Pricing Tier and Shipping Tier dropdowns, remove handleSaveTiers, and instead show which Discount Group the customer belongs to based on tag matching.

## Response snapshot

Updated `frontend/src/app/(admin)/admin/customers/[id]/page.tsx`:

1. Added `apiClient` import from `@/lib/api-client`
2. Removed `PricingTierFull` and `ShippingTier` interfaces; added `DiscountGroup` interface
3. Removed state: `pricingTiers`, `shippingTiers`, `editPricing`, `editShipping`, `editOverride`, `savingTiers`
4. Added state: `discountGroups: DiscountGroup[]`
5. Replaced `Promise.all([listPricingTiers, listShippingTiers])` in useEffect with `apiClient.get("/api/v1/admin/discount-groups")`
6. Removed `handleSaveTiers()` function entirely
7. Removed `pricingTierName`/`shippingTierName` derived variables
8. Replaced "Pricing & Shipping" card content with read-only Discount Group badge: filters `discountGroups` where `g.customer_tag` is in `tags`, shows group title, @tag, applies_to scope, shipping type, and status. Falls back to "No discount group assigned" when none match.

## Outcome

- ✅ Impact: Customer detail Pricing & Shipping section now shows which Discount Group the customer is assigned to via tag matching instead of Pricing Tier / Shipping Tier dropdowns
- 🧪 Tests: Manual verification needed
- 📁 Files: 1 file modified
- 🔁 Next prompts: Run the pending SQL queries for shipping_calc_type and shipping_cutoff_time columns; test customer detail page
- 🧠 Reflection: Tag-based group membership (customer.tags includes group.customer_tag) is the clean pattern — no join table needed

## Evaluation notes (flywheel)

- Failure modes observed: None
- Graders run and results (PASS/FAIL): null
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Verify discount groups load correctly from /api/v1/admin/discount-groups on customer detail page
