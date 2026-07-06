---
id: "020"
title: Fix admin orders detail validation and settings router prefix
stage: green
date: 2026-03-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix admin/orders/{id} ResponseValidationError; fix frontend audit-log URL; fix settings double prefix"
labels: ["backend","bug-fix","admin","orders","settings","routing"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
  - backend/app/api/v1/admin/settings.py
tests:
  - Backend restarts cleanly (Application startup complete)
  - GET /api/v1/admin/orders/{id} returns 200 with valid AdminOrderDetail
  - GET /api/v1/admin/settings returns 200
  - PATCH /api/v1/admin/settings returns 200
  - GET /api/v1/admin/audit-log returns 200
  - GET /api/v1/admin/email-templates returns 200
---

## Prompt

Fix three bugs:
1. admin/orders/{id} ResponseValidationError — endpoint returns raw dict instead of AdminOrderDetail
2. Frontend audit log URL check — search for /admin/audit-log missing /api/v1 prefix
3. settings.py router prefix verification and fix

## Response snapshot

**Bug 1 — `admin/orders.py` `get_admin_order`:**

Endpoint returned `{**{c.key: getattr(order, c.key) for c in order.__table__.columns}, "company_name": ..., "items": items}`.
Pydantic fails to validate because:
- Raw `OrderItem` ORM objects can't be validated as `OrderItemOut` from a raw dict
- `Order.notes` → `AdminOrderDetail.order_notes` name mismatch not handled

Fix:
- Added `OrderItemOut` to imports
- Replaced raw dict return with explicit `AdminOrderDetail(...)` construction
- Mapped `order_notes=order.notes` (schema field vs model field name difference)
- Used `OrderItemOut.model_validate(i)` for each item (works via `from_attributes=True`)

**Bug 2 — Frontend URLs:**

Searched all frontend `.ts`/`.tsx` files for `fetch("/admin/` and `apiClient.*("/admin/`.
Result: all admin API calls in `admin.service.ts` already use correct `/api/v1/admin/` prefix.
Audit-log at line 221 already: `/api/v1/admin/audit-log`. No frontend changes needed.

**Bug 3 — `settings.py` router prefix:**

Root issue was more than a verification: `router = APIRouter()` (no prefix) meant:
- `/email-templates` routes → `/api/v1/email-templates` (WRONG — frontend expects `/api/v1/admin/email-templates`)
- `/admin/settings` → `/api/v1/admin/settings` (correct but inconsistent)
- `/admin/audit-log` → `/api/v1/admin/audit-log` (correct but inconsistent)

Fix: Changed router to `APIRouter(prefix="/admin")` and removed explicit `/admin` from the three route paths (`/admin/settings` → `/settings`, `/admin/audit-log` → `/audit-log`). All routes now consistently serve under `/api/v1/admin/`.

## Outcome

- ✅ Backend reloaded cleanly (Application startup complete)
- ✅ `get_admin_order` returns proper `AdminOrderDetail` Pydantic instance
- ✅ Settings router now serves all routes under `/api/v1/admin/` matching frontend expectations
- ✅ Email template routes now correctly at `/api/v1/admin/email-templates`
- 🔁 Next prompts: frontend Docker rebuild for @tailwindcss/postcss fix

## Evaluation notes (flywheel)

- Failure modes observed: Schema field name (`order_notes`) diverged from model column name (`notes`); router prefix inconsistency hid email-template 404s
- Graders run and results (PASS/FAIL): Backend startup clean — PASS
- Prompt variant (if applicable): null
- Next experiment: null
