---
id: 221
title: Admin carrier fields, invoice PDF eager-load, carrier logos
stage: general
date: 2026-05-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "fix: admin carrier not showing, invoice PDF crash, carrier logos FedEx/UPS/USPS"
labels: ["admin","shippo","carrier","pdf","invoice","logo","MissingGreenlet","eager-load"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
  - backend/app/api/v1/orders.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - npx tsc --noEmit (PASS — only 2 pre-existing test file errors)
  - git push PASS
---

## Prompt

Three bugs reported by user:

1. Admin Panel → Orders: customer's selected shipping not showing at all (carrier, service, days) — `carrier`, `shipping_rate_id`, `shipping_method` always null in API response even though model/schema have them.
2. Customer Dashboard → Invoice PDF not downloading — crash traced to `MissingGreenlet` in `pdf_service._bill_to()` accessing `order.placed_by` and `order.company` (lazy relationships) through `_load_order_for_company` which only eager-loaded `Order.items`.
3. Shipping & Courier section in admin: use actual FedEx/UPS/USPS logos instead of text abbreviations ("FX", "UPS", "US").

Also noted: tracking number "1ZXXXXXXXXX" is Shippo sandbox/test mode returning dummy UPS numbers — not code masking. Requires Shippo live mode credentials to get real tracking numbers.

## Response snapshot

**backend/app/api/v1/admin/orders.py:**
- Added to `AdminOrderDetail(...)` constructor:
  ```python
  carrier=getattr(order, "carrier", None),
  shipping_rate_id=getattr(order, "shipping_rate_id", None),
  shipping_method=getattr(order, "shipping_method", None),
  ```
  These were already in the `AdminOrderDetail` Pydantic schema and on the `Order` model but were simply never serialized — silent null gap.

**backend/app/api/v1/orders.py:**
- `_load_order_for_company()`: added `selectinload(Order.placed_by)` and `selectinload(Order.company)` alongside existing `selectinload(Order.items)`.
- Root cause: `pdf_service._bill_to()` accesses `order.placed_by.email` and `order.company.name` — lazy relationships that raise `MissingGreenlet` in async SQLAlchemy context without explicit eager loading.

**frontend/src/app/(admin)/admin/orders/[id]/page.tsx:**
- Carrier grid: replaced `{ id, name, icon }` array (with text icons "FX"/"UPS"/"US") with `{ id, name, logo }` array using Shippo CDN:
  - FedEx: `https://shippo-static.s3.amazonaws.com/providers/75/FedEx.png`
  - UPS: `https://shippo-static.s3.amazonaws.com/providers/75/UPS.png`
  - USPS: `https://shippo-static.s3.amazonaws.com/providers/75/USPS.png`
- Logo renders as `<img height="28px">` with `objectFit: contain`; disabled state uses `filter: grayscale(1)` instead of just opacity.
- Card layout changed to `flexDirection: column` with `alignItems: center` for logo + label stacking.

## Outcome

- ✅ Impact: Admin now receives `carrier`, `shipping_rate_id`, `shipping_method` from API — Customer Selected banner shows correctly; non-customer carriers are disabled with the right carrier pre-selected. Invoice PDF no longer crashes for customer dashboard download. Carrier buttons now show real FedEx/UPS/USPS logos.
- 🧪 Tests: TypeScript PASS (0 new errors); git push PASS (571d9ff)
- 📁 Files: 3 files modified, +17/-4 lines
- 🔁 Next prompts: Verify customer-selected carrier banner shows on orders that have `carrier` set; check Railway logs confirm no more invoice PDF 500 errors; confirm logos load in browser (no CSP block on shippo-static.s3.amazonaws.com)
- 🧠 Reflection: Two classic silent gaps — (1) a schema field that exists but is never populated in the serializer returns null forever with no error, (2) a lazy relationship accessed in async context only fails at runtime. Both required reading the full serialization call to spot.

## Evaluation notes (flywheel)

- Failure modes observed: Pydantic schema field declared but never populated in serializer constructor; lazy SQLAlchemy relationship access in async context (MissingGreenlet)
- Graders run and results (PASS/FAIL): TypeScript PASS
- Prompt variant (if applicable): null
- Next experiment: null
