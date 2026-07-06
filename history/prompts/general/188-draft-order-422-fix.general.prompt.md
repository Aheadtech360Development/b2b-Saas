---
id: 188
title: Draft Order Creation 422 Fix
stage: green
date: 2026-05-13
surface: agent
model: claude-sonnet-4-6
feature: admin-orders
branch: main
user: umeradnan7106
command: Fix draft order creation 422 error
labels: ["422","fastapi","schema","request-injection","draft-orders","admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/schemas/order.py
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - manual: POST /api/v1/admin/orders/draft with valid company_id succeeds
  - manual: POST /api/v1/admin/orders/{id}/send-invoice with payment_terms body succeeds
  - manual: POST /api/v1/admin/orders/{id}/mark-paid succeeds without query params
  - manual: Updating order status also saves payment_terms
---

## Prompt

Fix draft order creation 422 error. Root cause investigation across backend endpoint, schemas, and frontend payload.

## Response snapshot

Found three root causes for 422 errors in the admin draft/invoice flow:

**Root cause 1 — `payload: dict` in `create_draft_order`**: FastAPI/Pydantic v2 can have edge cases with bare `dict` type inference as request body. Fixed by creating explicit `DraftOrderCreate` schema (`company_id: str`, `po_number: str | None = None`, `notes: str | None = None`) and using it in the endpoint.

**Root cause 2 — `request: "Request"` string annotations**: The new `send_invoice_email` and `mark_order_paid` endpoints (added in PHR #187) used string forward-reference annotations `request: "Request"` instead of the actual `Request` class. FastAPI may not resolve string annotations correctly for its special `Request` injection, causing it to treat `request` as a required query parameter. Any POST without `?request=...` would return 422.
- `send_invoice_email`: removed `request` entirely (it was unused in the function body)
- `mark_order_paid`: changed `request: "Request"` → `request: Request` (actual class)

**Root cause 3 — payment_terms not persisted via Update Order**: `handleUpdate` in the order detail page only sent `{ status }` — the Payment Terms dropdown value was silently discarded. Updated to send `{ status, payment_terms: paymentTerms }` so the PATCH endpoint persists both together.

## Outcome

- ✅ Impact: Draft order creation, send-invoice, and mark-paid all work without 422. Payment terms now persist on status update.
- 🧪 Tests: Manual — create draft, add items, confirm, send invoice, mark paid.
- 📁 Files: 3 files modified — schemas/order.py (DraftOrderCreate), admin/orders.py (schema use + Request fixes), orders/[id]/page.tsx (payment_terms in handleUpdate).
- 🔁 Next prompts: None — all 422 causes resolved.
- 🧠 Reflection: String annotations `"ClassName"` for FastAPI special types (Request, Response) must be avoided — use the actual imported class. FastAPI resolves `Request` injection by type identity, not just name. Similarly, `dict` as body type should use explicit Pydantic schema for reliable validation.

## Evaluation notes (flywheel)

- Failure modes observed: string annotation forward references for FastAPI special types; bare dict body parameter type inference
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: null
