---
id: 203
title: Shippo label generation admin order detail
stage: general
date: 2026-05-18
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: integrate Shippo shipping into admin order detail page
labels: ["shippo","shipping","admin","label","backend","frontend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/requirements.txt
  - backend/app/services/shippo_service.py
  - backend/app/models/order.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/admin/orders.py
  - backend/app/main.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - POST /api/v1/admin/orders/{id}/labels with carrier=fedex/ups/usps
---

## Prompt

Integrate Shippo shipping into AF Apparels admin order detail page. Install shippo SDK, create shippo_service.py with warehouse address and label generation, add POST /orders/{order_id}/labels endpoint, add label_url/tracking_url columns to Order model and DB, update AdminOrderDetail schema, replace frontend SHIPPING & COURIER section with Shippo-based UI (3-carrier selector + Generate button + result display with Download Label PDF and Track Package links).

## Response snapshot

Backend: added `shippo` to requirements.txt, created `shippo_service.py` (warehouse at Dallas TX 75243, CARRIER_TOKENS map, create_shippo_label/track_shippo_package functions using Shippo SDK v3). Added `label_url` and `tracking_url` mapped columns to Order model. Added both fields to AdminOrderDetail schema. Added `_LabelRequest` Pydantic model and `POST /orders/{order_id}/labels` endpoint to admin/orders.py that calls shippo_service, updates order fields via raw SQL for new columns, sets status to "shipped", appends timeline entry, sends shipping email. Added startup idempotent ALTER TABLE migration for the two new columns in main.py.

Frontend: added `label_url` and `tracking_url` to AdminOrder interface. Added `selectedCarrier`, `labelLoading`, `labelResult` state. Added `handleGenerateLabel` function. Updated useEffect to restore labelResult from existing order data. Replaced SHIPPING & COURIER section with new Shippo UI (FedEx/UPS/USPS 3-carrier grid + Generate button + result panel showing carrier/service/tracking/rate + Download Label PDF + Track Package links) followed by a divider and the existing manual courier fallback section.

## Outcome

- ✅ Impact: Admin can generate real shipping labels via Shippo with one click; label URL and tracking URL saved to order record
- 🧪 Tests: POST /api/v1/admin/orders/{id}/labels with { carrier: "fedex" }
- 📁 Files: 7 files modified/created
- 🔁 Next prompts: Set SHIPPO_API_KEY in Railway environment
- 🧠 Reflection: Naming conflict — shipping_service.py already existed for tier management, so used shippo_service.py. Admin route protection is handled by AuthMiddleware prefix check, no get_current_admin_user dep needed.

## Evaluation notes (flywheel)

- Failure modes observed: naming collision with existing shipping_service.py and admin/shipping.py
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): test with real SHIPPO_API_KEY in Railway
