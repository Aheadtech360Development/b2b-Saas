---
id: 139
title: Remove MOQ/MOV from Order Service + Tax Persistence
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Fix: remove MOQ/MOV checks from order_service (500 on confirm); fix tax not showing on review page (persist to checkout store)"
labels: ["backend","frontend","checkout","tax","orders","moq","mov"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/order_service.py
  - backend/app/models/order.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/guest.py
  - backend/app/main.py
  - backend/migrations/versions/s2t3u4v5w6x7_add_tax_fields_to_orders.py
  - frontend/src/stores/checkout.store.ts
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/services/orders.service.ts
tests:
  - manual: POST /api/v1/checkout/confirm no longer returns 500 — MOQ/MOV block removed from order_service
  - manual: Stock check still blocks when inventory is 0 < requested quantity
  - manual: Tax (TX 6.25%) line shows on review page after selecting TX address
  - manual: Tax persists from address step to review step via checkout store
  - manual: Both guest and wholesale orders save tax_amount, tax_rate, tax_region to DB
---

## Prompt

Fix 1: POST /api/v1/checkout/confirm returning 500 — MOQ/MOV checks still present in order_service.py (per-item moq check and MOV check). Remove entirely.

Fix 2: Tax not showing on review page — tax is fetched at address step but not stored in checkout state, so review page doesn't see it.

## Response snapshot

**Fix 1 — `order_service.py`**: Removed per-item MOQ check (`if cart_item.quantity < product.moq: raise ValidationError(...)`) and MOV check (`if subtotal < mov_amount: raise ValidationError(...)`). Stock check (`available > 0 and available < cart_item.quantity`) is preserved.

**Fix 2 — `checkout.store.ts`**: Added `taxRegion: string | null` and `taxRate: number` fields with `setTaxInfo(region, rate)` action. Initialized to `null`/`0`.

**Fix 2 — `address/page.tsx`**: Tax useEffect calls `setTaxInfo(region, rate)` when tax fetched, clears it when state is empty.

**Fix 2 — `review/page.tsx`**: `taxRate` state seeded from `storedTaxRate`/`storedTaxRegion` in checkout store. useEffect uses store values if present; falls back to API fetch only if navigating directly to review (store empty).

**Tax on orders — `models/order.py`**: Added `tax_rate: Mapped[float | None]` and `tax_region: Mapped[str | None]` columns.

**Tax on orders — `schemas/order.py`**: Added `tax_region: str | None = None` to `CheckoutConfirmRequest`.

**Tax on orders — `guest.py`**: Added `tax_rate`/`tax_region` to `GuestCheckoutRequest`; saved to Order.

**Tax on orders — `order_service.py`**: Saves `tax_rate=confirm.tax_rate` and `tax_region=getattr(confirm, 'tax_region', None)` to Order record.

**Migration**: `s2t3u4v5w6x7` adds `tax_rate` NUMERIC(6,4) and `tax_region` VARCHAR(10) to orders. Also added idempotent `ALTER TABLE` DO block to `_ensure_content_tables()` in `main.py`.

**Frontend payloads**: `orders.service.ts` + both guest/wholesale payloads in review page include `tax_rate` and `tax_region`.

## Outcome

- ✅ Order confirm no longer throws 500 from MOQ/MOV
- ✅ Tax persists from address step to review step
- ✅ Tax shown as "Tax (TX 6.25%): $X.XX" on review page
- ✅ tax_amount, tax_rate, tax_region saved to orders table
- 🧪 Tests: Manual
- 📁 Files: 10 files modified/created

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
