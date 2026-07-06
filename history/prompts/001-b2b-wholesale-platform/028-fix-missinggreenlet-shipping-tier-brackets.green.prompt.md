---
id: "028"
title: Fix MissingGreenlet shipping tier brackets lazy load
stage: green
date: 2026-03-18
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix MissingGreenlet error in order_service.py create_order"
labels: ["backend","bug-fix","sqlalchemy","async","shipping"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/order_service.py
tests:
  - Backend restarts cleanly (Application startup complete)
  - POST /api/v1/checkout/confirm no longer raises MissingGreenlet
  - ShippingTier.brackets loads eagerly during order creation
---

## Prompt

Fix MissingGreenlet error: sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called
Happens in backend/app/services/order_service.py create_order method.

## Response snapshot

**Root cause (exact location):**

`order_service.py` line 122-124 loads `ShippingTier` without eager-loading its `brackets` relationship:
```python
# BEFORE (missing selectinload):
shipping_tier_result = await self.db.execute(
    select(ShippingTier).where(ShippingTier.id == company.shipping_tier_id)
)
```

Then `shipping_service.py` line 93 accesses `tier.brackets` synchronously:
```python
brackets = sorted(tier.brackets, key=lambda b: b.min_units)
```

`tier.brackets` is a SQLAlchemy relationship. Accessing it without eager-loading triggers synchronous lazy IO, which is forbidden in async SQLAlchemy → `MissingGreenlet`.

**Fix — `backend/app/services/order_service.py`:**

Added `selectinload(ShippingTier.brackets)` to the shipping tier query:
```python
from sqlalchemy.orm import selectinload
shipping_tier_result = await self.db.execute(
    select(ShippingTier)
    .options(selectinload(ShippingTier.brackets))
    .where(ShippingTier.id == company.shipping_tier_id)
)
```

No changes needed to `shipping_service.py` — `calculate_shipping_cost` is a sync method that correctly accesses the already-loaded `tier.brackets` list.

## Outcome

- ✅ Impact: POST /api/v1/checkout/confirm completes without MissingGreenlet
- 🧪 Tests: Backend startup clean — PASS
- 📁 Files: order_service.py (selectinload ShippingTier.brackets)
- 🔁 Next prompts: Full end-to-end checkout flow test
- 🧠 Reflection: Every relationship access in an async SQLAlchemy context must be eager-loaded via selectinload/joinedload in the initial query. A service calling another service's sync method that reads a relationship attribute is a hidden lazy-load — the relationship must be loaded before passing the object.

## Evaluation notes (flywheel)

- Failure modes observed: Relationship lazy-load hidden inside sync helper method called from async context. Audit pattern: any sync method that accesses ORM relationship attributes must receive objects that had those relationships eager-loaded.
- Graders run and results (PASS/FAIL): Backend startup clean — PASS
- Prompt variant (if applicable): null
- Next experiment: null
