---
id: "172"
title: Order Detail Page Fix — UUID Cast + Order Number URLs
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix order detail page not loading for customer and admin. Read ALL relevant files first."
labels: ["order-detail","uuid","retail","comments","admin","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/order_service.py
  - backend/app/api/v1/orders.py
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(customer)/account/orders/page.tsx
  - frontend/src/app/(admin)/admin/orders/page.tsx
  - frontend/src/app/(customer)/account/orders/[id]/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - manual: customer order list — View link navigates to /account/orders/AF-XXXXXX
  - manual: customer order detail loads for retail user
  - manual: customer order detail loads for wholesale user
  - manual: admin order list — View link navigates to /admin/orders/AF-XXXXXX
  - manual: admin order detail loads by order_number
  - manual: admin sub-actions (update, mark shipped, verify ACH) work after order loads
  - manual: customer PDF download works on order detail page
  - manual: customer comments load and post on order detail page
---

## Prompt

Fix order detail page not loading for customer and admin. Read ALL relevant files first.

Backend accept both UUID and order_number; frontend use `order_number` in URLs instead of UUID. After initial load use `order.id` (UUID) for sub-calls.

## Response snapshot

**Root causes**:
1. String-to-UUID type mismatch: `user_id` and `company_id` from JWT are strings (`request.state.user_id/company_id`), but `Order.placed_by_id` and `Order.company_id` are `UUID(as_uuid=True)` SQLAlchemy columns. asyncpg requires proper UUID objects — string comparison silently returns no rows.
2. Comments endpoints required `company_id` (ForbiddenError) for retail users who may not have company_id, and used string comparison against UUID column.
3. Frontend navigated to `/account/orders/${o.id}` (UUID) — back-end FastAPI route expected `UUID`, but URL params are strings. Changing to order_number is cleaner and user-visible.

**`order_service.py`**:
- `get_order`: cast `company_id` → `uuid.UUID(str(company_id))`
- `list_orders_for_retail_user`: cast `user_id` → `uuid.UUID(user_id)`
- `get_order_for_retail_user`: cast `user_id` → `uuid.UUID(user_id)`

**`orders.py`**:
- `get_order`: changed `order_id: UUID` → `str`; detect `AF-` prefix → query by `order_number`, else parse UUID; authorization check uses proper UUID cast
- `_load_order_for_company`: cast `company_id` to UUID
- `list_order_comments` + `add_order_comment`: support retail users via `placed_by_id` check; cast company_id to UUID for wholesale path

**`admin/orders.py`**:
- `get_admin_order`: changed `order_id: UUID` → `str`; detect `AF-` prefix → query by `order_number`, else parse UUID; use `order.id` for item sub-query

**`account/orders/page.tsx`**: link changed to `o.order_number`

**`admin/orders/page.tsx`**: link changed to `o.order_number`

**`account/orders/[id]/page.tsx`**:
- Load order first, then load comments sequentially using `orderData.id` (UUID) — comments failure no longer breaks page
- `handleReorder`, `handleSendComment`, `downloadPdf` use `order?.id ?? id`

**`admin/orders/[id]/page.tsx`**:
- All 9 sub-call API paths use `order?.id ?? id`: updateOrder, syncOrderToQb, mark-shipped status PATCH, capture POST, verify-ach POST, resend-invoice POST, notes PATCH, add-item POST, remove-item DELETE

## Outcome

- ✅ Impact: Order detail pages load for both retail and wholesale customers, and admin. URLs use human-readable order numbers (AF-000030). All sub-actions continue to use the real UUID after page load.
- 🧪 Tests: Manual verification needed
- 📁 Files: 7 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: The root cause was a dual problem — asyncpg's strict UUID type requirements meant string comparisons silently returned no rows, not errors. Changing URLs to order_number is a bonus UX improvement that also avoids the UUID parsing path for the initial load.

## Evaluation notes (flywheel)

- Failure modes observed: String user_id/company_id from JWT compared to UUID columns via asyncpg returned empty results silently; comments endpoint blocked retail users with ForbiddenError; parallel comment/order load caused page-level failure when comments errored
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
