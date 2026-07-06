---
id: 216
title: Shippo selected rate save to order flow
stage: general
date: 2026-05-26
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "feat: save customer selected Shippo rate to order, pre-select in admin, use for label generation"
labels: ["shippo","shipping","label","rate-id","checkout","admin","order"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/stores/checkout.store.ts
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - backend/app/schemas/order.py
  - backend/app/models/order.py
  - backend/app/services/order_service.py
  - backend/app/api/v1/admin/orders.py
tests:
  - npx tsc --noEmit (PASS — only 2 pre-existing test file errors)
  - git push PASS
---

## Prompt

Add selected Shippo rate saving to order flow.
IMPORTANT: Do NOT break existing flat rate / bracket rate / will call flow.
Only add new behavior when customer selects a live Shippo rate.

Fix 1: Save selected rate to order on checkout — include shipping_rate_id, shipping_carrier, shipping_service in order payload when shippingType === 'live_shippo'.
Fix 2: Backend accept and save — add optional fields to CheckoutConfirmRequest; save via raw SQL on order creation; add shipping_rate_id column to Order model.
Fix 3: Admin order detail — pre-select customer's chosen carrier; show "Customer selected" info banner above carrier buttons.
Fix 4: Label generation — use saved rate_id with fallback to fresh rate if expired.
Railway SQL needed: ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_rate_id VARCHAR(255);

## Response snapshot

**checkout.store.ts:**
- Added `SelectedLiveRate` interface (rate_id, carrier, service, price)
- Added `shippingType: string` and `selectedRate: SelectedLiveRate | null` to CheckoutState
- Added `setShippingType` and `setSelectedRate` actions

**address/page.tsx:**
- Imported new store setters
- In `handleContinue()`: calls `setShippingType(shippingTypeForUser)` and `setSelectedRate()` with the selected live rate, or `null` for non-Shippo flows

**review/page.tsx:**
- Destructures `shippingType` and `selectedRate` from store
- Both guest and wholesale `basePayload` include `shipping_rate_id`, `shipping_carrier`, `shipping_service` only when `shippingType === "live_shippo"` and `selectedRate` is non-null

**backend/app/schemas/order.py:**
- Added `shipping_rate_id`, `shipping_carrier`, `shipping_service` (all `str | None = None`) to `CheckoutConfirmRequest`
- Added `carrier: str | None = None` and `shipping_rate_id: str | None = None` to `AdminOrderDetail`

**backend/app/models/order.py:**
- Added `shipping_rate_id: Mapped[str | None] = mapped_column(String(255), nullable=True)` after `carrier` column

**backend/app/services/order_service.py:**
- After ACH save block, added raw SQL UPDATE for `shipping_rate_id`, `carrier`, `courier_service` when `shipping_rate_id` is present on the confirm payload

**admin/orders/[id]/page.tsx:**
- Added `carrier?: string | null` and `shipping_rate_id?: string | null` to `AdminOrder` interface
- Fixed carrier pre-selection to use `_cMap` mapping (USPS→usps, UPS→ups, FedEx→fedex) for both label-exists and customer-selection cases
- Added "Customer selected" banner (blue) above carrier buttons showing carrier/service/cost

**backend/app/api/v1/admin/orders.py (label endpoint):**
- If `order.shipping_rate_id` exists, tries direct Shippo transaction from saved rate_id
- On SUCCESS, builds result from transaction; on any failure/expired, falls through to `create_shippo_label` with admin-selected carrier

**NOT changed:** flat rate, bracket rate, will call flows; items table; summary table; any unrelated functionality

## Outcome

- ✅ Impact: Customer's live Shippo rate selection is saved on order; admin sees it pre-selected with a banner; label generation uses it (with expiry fallback)
- 🧪 Tests: TypeScript PASS (0 new errors); git push PASS (7533042)
- 📁 Files: 8 files modified, +105/-3 lines
- 🔁 Next prompts: Run Railway SQL migration: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_rate_id VARCHAR(255);`
- 🧠 Reflection: Raw SQL pattern (with try/except) used for `shipping_rate_id` to match existing deployment pattern; `carrier` and `courier_service` columns already existed in model so updated directly. Shippo rate_ids expire after ~1-2 hours so the fallback is essential for production.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): TypeScript PASS
- Prompt variant (if applicable): null
- Next experiment: null
