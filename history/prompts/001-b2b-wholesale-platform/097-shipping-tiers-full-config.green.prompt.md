---
id: "097"
title: Shipping tiers full config, default tiers, rename
stage: green
date: 2026-04-20
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: implement shipping tier management
labels: ["shipping","admin","tiers","settings"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/shipping.py
  - backend/app/schemas/shipping.py
  - backend/app/services/shipping_service.py
  - backend/app/api/v1/admin/shipping.py
  - backend/app/services/order_service.py
  - backend/migrations/shipping_tier_enhancements.sql
  - frontend/src/app/(admin)/admin/settings/shipping-tiers/page.tsx
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
  - frontend/src/components/layout/AdminSidebar.tsx
  - frontend/src/services/admin.service.ts
tests:
  - " - none"
---

## Prompt

Shipping pricing will be calculated in this way:
Tier-1 --> 1 to 200: $20, 201 to 500: $30, 500 to 1000: $45, 1000+: $65. 
Tier-3 --> $1 to $50: $20, $50 to $100: $25, $101 to $199: $35, Over $200 Free. 
Will Call Pick: Free. Cut off Time 12PM.
Create 5-6 more tiers. Build it so it is easily configurable. Also rename Pricing Tier to Shipping Tier.

## Response snapshot

**Backend model changes**: Added `calculation_type` (units/order_value/free) and `cutoff_time` to `ShippingTier`. Added `min_order_value`/`max_order_value` decimal columns to `ShippingBracket` for order-value-based tiers.

**Service fixes + enhancement**: Fixed pre-existing bugs (`shipping_tier_id` → `tier_id` in create/update). Updated `calculate_shipping_cost` to handle all 3 types: unit-based (existing), order_value (new — uses order subtotal), free (returns $0). Added `order_subtotal` parameter to signature. Updated `order_service.py` to pass `order_subtotal=subtotal`.

**API**: Added `DELETE /admin/shipping-tiers/{tier_id}` endpoint. Added `POST /admin/shipping-tiers/seed-defaults` which creates 7 pre-configured tiers (skips existing). `SchippingTierCreate.brackets` now optional (empty list = free tier).

**7 default tiers pre-configured:**
1. Tier 1 — Standard Ground (units): 1-200: $20, 201-500: $30, 501-1000: $45, 1001+: $65 | 12PM cutoff
2. Tier 2 — Economy (units): 1-100: $15, 101-300: $22, 301-600: $35, 601+: $48
3. Tier 3 — Value Order Total (order_value): $1-$50: $20, $50-$100: $25, $101-$199: $35, $200+: FREE
4. Tier 4 — Premium (units): 1-500: $15, 501-1000: $25, 1001+: $35
5. Tier 5 — Express (units): 1-100: $35, 101-300: $55, 301-600: $75, 601+: $95 | 10AM cutoff
6. Tier 6 — Wholesale Plus Order Total (order_value): $0-$100: $25, $100-$250: $20, $250-$500: $15, $500+: FREE
7. Will Call / Pick Up (free): always $0

**Admin UI** (`/admin/settings/shipping-tiers`): Full CRUD page. Cards are collapsible, show read-only bracket table. Edit mode allows all fields including bracket management (add/remove rows, change type). "Load Default Tiers" button calls seed endpoint. New Tier form inline.

**Sidebar**: Added "Shipping Tiers" under Settings. Renamed "Pricing Tiers" → "Customer Tiers" (the customer discount tier section).

**Migration**: `backend/migrations/shipping_tier_enhancements.sql` — adds new columns to existing tables.

## Outcome

- ✅ Impact: Full shipping tier management system implemented
- 🧪 Tests: None added
- 📁 Files: 10 files modified/created
- 🔁 Next prompts: Run `shipping_tier_enhancements.sql` migration, restart backend, then use "Load Default Tiers" button

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
