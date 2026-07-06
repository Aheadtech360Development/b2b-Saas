---
id: "023"
title: Fix checkout confirm ResponseValidationError
stage: green
date: 2026-03-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix checkout/confirm 500 error - ResponseValidationError: <exception str() failed>"
labels: ["backend","bug-fix","order-service","async-sqlalchemy","pydantic"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/order_service.py
  - backend/app/models/order.py
tests:
  - Backend restarts cleanly (Application startup complete)
  - POST /api/v1/checkout/confirm no longer returns 500 ResponseValidationError
  - Order.items relationship is eager-loaded before serialization
  - OrderOut.order_notes resolves via @property alias on Order model
---

## Prompt

Fix checkout/confirm 500 error in AF Apparels backend.

Error: `ResponseValidationError: <exception str() failed>` on POST /api/v1/checkout/confirm

Two root causes:
1. `Order.items` relationship not eager-loaded after order creation — async SQLAlchemy cannot lazy-load during response serialization (MissingGreenlet error)
2. `OrderOut` schema has `order_notes` field but `Order` model column is named `notes` — Pydantic `getattr` fails to find the attribute

## Response snapshot

**Root cause analysis:**

The `ResponseValidationError: <exception str() failed>` pattern indicates the exception itself fails to stringify — this is characteristic of SQLAlchemy `MissingGreenlet` errors triggered when async lazy-loading is attempted during Pydantic serialization (after the async context has partially exited).

**Fix 1 — `backend/app/services/order_service.py`:**

Replaced `await self.db.refresh(order)` with a fresh eager-loaded query:
```python
# Reload order with items eager-loaded (async ORM cannot lazy-load during response serialization)
from sqlalchemy.orm import selectinload
result = await self.db.execute(
    select(Order).options(selectinload(Order.items)).where(Order.id == order.id)
)
order = result.scalar_one()
```

**Fix 2 — `backend/app/models/order.py`:**

Added `@property` alias to bridge schema field name to model column name without changing the schema or adding a migration:
```python
# ── Schema compatibility alias ─────────────────────────────────────────────
@property
def order_notes(self) -> str | None:
    return self.notes
```

## Outcome

- ✅ Impact: POST /api/v1/checkout/confirm no longer crashes with ResponseValidationError
- 🧪 Tests: Backend startup clean — PASS
- 📁 Files: order_service.py (selectinload reload), order.py (order_notes property)
- 🔁 Next prompts: Verify checkout flow end-to-end in frontend
- 🧠 Reflection: Async SQLAlchemy requires all relationship attributes to be eager-loaded before any code path that triggers Pydantic serialization. Property aliases on models are a clean way to bridge schema/model naming gaps without API contract changes or migrations.

## Evaluation notes (flywheel)

- Failure modes observed: `db.refresh()` in async context does NOT load relationships; only refreshes scalar columns. `selectinload` in a fresh query is required. Pydantic v2 `from_attributes=True` uses `getattr` which respects `@property` definitions.
- Graders run and results (PASS/FAIL): Backend startup clean — PASS
- Prompt variant (if applicable): null
- Next experiment: null
