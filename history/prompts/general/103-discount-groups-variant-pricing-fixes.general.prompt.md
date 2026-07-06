---
id: 103
title: Discount Groups & Variant Pricing Fixes
stage: general
date: 2026-04-22
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: continue
labels: ["discount-groups","variant-pricing","browse-ui","flat-rate-brackets","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
  - backend/app/models/discount_group.py
  - backend/app/api/v1/admin/discount_groups.py
tests:
  - null
---

## Prompt

4 issues to fix:
1. Discount Group modal: Selected Collections and Selected Products in Applies To have no browse UI — need a selector to pick collections/products
2. Discount Group modal Flat Rate: nothing appears when Flat Rate is selected — should show Shipping Tier bracket fields (min/max order amount → rate)
3. Individual Variant Pricing: columns are from Customer Tiers (PricingTier), but user wants Discount Groups as columns; also products are completely blank
4. Search features not working properly

## Response snapshot

Fixed all 4 issues across frontend and backend:

1. **Browse UI**: Added inline searchable checkbox picker in Applies To section. When "Selected Collections" is chosen, fetches `/api/v1/products/categories` and flattens the tree. When "Selected Products" is chosen, fetches `/api/v1/admin/products`. Shows selected count + "Clear all". Selections stored in `browseIds` state, serialized as JSON array to backend `applies_to_ids` field.

2. **Flat Rate bracket editor**: Replaced single input with a full bracket table editor (Min Order Amount → Shipping Rate rows). Add/remove brackets, stored in `flatBrackets` state, serialized to `shipping_brackets_json` in backend.

3. **VP columns → Discount Groups**: Changed table headers from `tiers.map(...)` to `groups.map(...)`. Also fixed `useEffect` to load groups when variants tab is active. VP column subtitle shows `@customer_tag` or applies_to scope.

4. **VP products fetch fixed**: Admin products endpoint returns `list[ProductDetail]` directly (not `{items: [...], total: N}`). Fixed `loadVariantPricing` to use `Array.isArray(data) ? data : []` directly. Mapped `categories` array for display instead of non-existent `tags`.

5. **Search fixed**: `filteredGroups` applies `groupSearch` filter. `filteredVpProducts` applies `vpSearch`. Both reactive to input changes.

6. **Save payload fix**: `handleSaveVariantPricing` now wraps overrides as `{ overrides: vpOverrides }` to match backend `VariantPricingIn.overrides` schema.

7. **Backend extended**: Added `applies_to_ids TEXT` and `shipping_brackets_json TEXT` columns to `DiscountGroup` model. Updated `DiscountGroupIn` with `applies_to_ids: list[str]` and `shipping_brackets: list[ShippingBracket]`. Updated create/patch handlers to serialize/deserialize JSON. `_group_out` returns parsed arrays.

SQL queries needed:
```sql
ALTER TABLE discount_groups ADD COLUMN applies_to_ids TEXT;
ALTER TABLE discount_groups ADD COLUMN shipping_brackets_json TEXT;
```

## Outcome

- ✅ Impact: Browse UI for collections/products, flat rate brackets, VP columns use discount groups, products load correctly
- 🧪 Tests: Manual verification needed
- 📁 Files: 3 files modified
- 🔁 Next prompts: Run ALTER TABLE SQL queries; test the modal flows; optionally remove Shipping Tiers admin section
- 🧠 Reflection: Products API returns a flat list not paginated — important distinction from other list endpoints

## Evaluation notes (flywheel)

- Failure modes observed: Wrong API response shape assumption (items wrapper), wrong VP column data source
- Graders run and results (PASS/FAIL): null
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Verify categories API is publicly accessible without auth in the admin context
