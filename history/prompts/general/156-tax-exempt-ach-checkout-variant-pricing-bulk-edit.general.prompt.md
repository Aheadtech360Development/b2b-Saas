---
id: "156"
title: Tax Exempt, ACH Checkout, Variant Pricing Bulk Edit
stage: green
date: 2026-05-08
surface: agent
model: claude-sonnet-4-6
feature: ui-fixes
branch: main
user: umeradnan7106
command: add tax exempt toggle for customers, show saved ACH at checkout, per-variant pricing with bulk select in tiers page
labels: ["tax-exempt","ach","checkout","variant-pricing","bulk-edit","admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/company.py
  - backend/app/schemas/company.py
  - backend/app/schemas/wholesale.py
  - backend/app/services/wholesale_service.py
  - backend/app/api/v1/tax_rate.py
  - backend/app/models/discount_group.py
  - backend/app/models/__init__.py
  - backend/app/api/v1/admin/discount_groups.py
  - backend/migrations/versions/f4a5b6c7d8e9_add_tax_exempt_and_variant_level_pricing.py
  - frontend/src/services/admin.service.ts
  - frontend/src/components/admin/ApprovalModal.tsx
  - frontend/src/app/(admin)/admin/customers/[id]/page.tsx
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
tests:
  - manual: tax_exempt toggle in admin customer profile enables/disables — PATCH /api/v1/admin/companies/{id} with {tax_exempt: true/false}
  - manual: tax_exempt checkbox in ApprovalModal passes to approve endpoint on approval
  - manual: tax-exempt company sees $0 tax at checkout address page (tax-rate endpoint returns exempt source)
  - manual: checkout payment page shows saved ACH as selectable option (like saved cards)
  - manual: selecting saved ACH and continuing works without re-entering bank details
  - manual: "Use a different account" opens the manual ACH form
  - manual: Individual Variant Pricing expanded rows now show price inputs per group column
  - manual: changing a variant price input saves separately from product-level override
  - manual: checkbox on variant row selects it for bulk edit
  - manual: "Apply to Selected" fills selected variant rows with entered bulk prices
---

## Prompt

Okay, now we need to add a new feature called Tax Exempt. I will also explain how this will work and where we will add it: This feature will work in such a way that any customer who has Tax Exempt applied will not be charged any tax. Tax should neither be shown to the customer nor to the Admin. And any customer who is not assigned this should be charged tax just like it is being charged right now. We will assign it like this: in the Admin Dashboard → Customers → All Customers, inside the customer profile, add an option so that if we ever want to enable it, we can simply checkmark it. Also add it in one more place, which is while approving an application — there as well give a Checkmark option. 1. The ACH system is being saved in Payment Methods, but the saved ACH is not being displayed in Checkout the same way cards are displayed there. 2. In Individual Variant Pricing, you have shown all the variants, but the same single price is being applied to all of them. Make them editable so that I can enter different prices for each variant, and whatever I enter here should also be shown there. Also add bulk edit functionality in this, meaning I should be able to select multiple variants that need the same changes and then click Apply to Selected.

## Response snapshot

1. `backend/app/models/company.py`: Added `tax_exempt: Mapped[bool]` column (Boolean, default=False, server_default="false").

2. `backend/app/schemas/company.py`: Added `tax_exempt: bool = False` to `CompanyDetail`; `tax_exempt: bool | None = None` to `CompanyUpdate`.

3. `backend/app/schemas/wholesale.py`: Added `tax_exempt: bool = False` to `ApproveApplicationRequest`.

4. `backend/app/services/wholesale_service.py`: Added `tax_exempt=data.tax_exempt` when constructing Company on approval.

5. `backend/app/api/v1/tax_rate.py`: Added `request: Request` param; if authenticated user's company has `tax_exempt=True`, returns `{"rate": 0, "tax_amount": 0, "source": "exempt"}` immediately — no TaxJar or manual lookup needed.

6. `backend/app/models/discount_group.py`: Added `VariantLevelPricingOverride` model with `variant_id`, `group_id`, `price` columns.

7. `backend/app/api/v1/admin/discount_groups.py`: Added `GET /admin/variant-level-pricing` and `POST /admin/variant-level-pricing` endpoints.

8. `backend/migrations/versions/f4a5b6c7d8e9_…py`: Migration adds `tax_exempt` column to companies + creates `variant_level_pricing_overrides` table.

9. `frontend/src/services/admin.service.ts`: Extended `approveApplication` data type to include `tax_exempt?: boolean`.

10. `frontend/src/components/admin/ApprovalModal.tsx`: Added `taxExempt` state + toggle switch between Discount Group and Admin Notes fields.

11. `frontend/src/app/(admin)/admin/customers/[id]/page.tsx`: Added `tax_exempt` to Customer interface + `taxExempt` state + `handleToggleTaxExempt` handler + "Tax Exempt" card in right column with toggle switch.

12. `frontend/src/app/(customer)/checkout/payment/page.tsx`: Added `SavedAch` interface + `savedAch`/`useNewAch` state + fetch `/api/v1/account/ach-method` on mount. ACH tab now shows saved account as selectable option (like saved cards) with "Use a different account" option; `handleAchContinue` handles both paths.

13. `frontend/src/app/(admin)/admin/customers/tiers/page.tsx`: Added `vpVariantOverrides` state (variantId → groupId → price), `vpBulkSelected` Set, `vpBulkPrices` map. `loadVariantPricing` now also fetches `/admin/variant-level-pricing`. `handleSaveVariantPricing` also POSTs to `/admin/variant-level-pricing`. Expanded variant rows now have: checkbox for bulk select, editable price input per group column (with `$` prefix), highlighted border when value set. Bulk edit bar appears above the table when variants are selected, showing group price inputs + "Apply to Selected" button.

## Outcome

- ✅ Impact: 3 features across customer checkout, admin customer profiles, and admin pricing tools
- 🧪 Tests: Manual verification required — run migration, test each feature path
- 📁 Files: 14 files modified/created
- 🔁 Next prompts: Could expose tax_exempt in customer-facing profile; could auto-apply variant-level prices in checkout pricing middleware
- 🧠 Reflection: Tax exempt works purely via the tax-rate endpoint intercepting the company check — no frontend changes needed for the checkout calculation itself since the endpoint returns 0 for exempt companies

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
