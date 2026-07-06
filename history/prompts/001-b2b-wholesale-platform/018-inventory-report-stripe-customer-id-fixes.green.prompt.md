---
id: "018"
title: Inventory report and stripe_customer_id fixes
stage: green
date: 2026-03-16
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix inventory report bad kwarg; add stripe_customer_id to Company; migrate"
labels: ["backend","database","migration","inventory","stripe","bug-fix"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/account.py
  - backend/app/models/company.py
  - backend/migrations/versions/e114fbbfad6b_company_stripe_customer_id.py
tests:
  - alembic current == e114fbbfad6b (head)
  - Backend starts cleanly (Application startup complete)
  - GET /api/v1/account/inventory-report?stock_level=low returns low-stock variants
  - GET /api/v1/account/inventory-report (no filter) returns all variants
---

## Prompt

Fix two bugs in backend:
1. account.py line 485: `get_low_stock_variants(low_stock_only=...)` — wrong kwarg name
2. Company model missing `stripe_customer_id` field
3. Generate + run Alembic migration
4. Restart backend

## Response snapshot

**Fix 1 — account.py `get_inventory_report`:**

`get_low_stock_variants` signature is `(threshold_override: int | None = None)` — no `low_stock_only` param.
- `stock_level == "low"` → call with no args (uses per-record `low_stock_threshold`)
- otherwise → `threshold_override=999999` (returns all variants, effectively no filter)

**Fix 2 — company.py:**
Added after `qb_customer_id`:
```python
stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
```

**Migration:**
- Generated: `e114fbbfad6b_company_stripe_customer_id.py`
- Note: ruff post-write hook failed (ruff not at `/app/.venv/bin/ruff`) but file was still written
- `alembic upgrade head` → upgraded `473e7e0a8dd3 → e114fbbfad6b`
- `alembic current` → `e114fbbfad6b (head)` ✓

**Backend:** Restarted → `Application startup complete` ✓

## Outcome

- ✅ DB schema: `companies.stripe_customer_id VARCHAR(255)` column added
- ✅ Migration at head: `e114fbbfad6b`
- ✅ Inventory report endpoint uses correct `threshold_override` parameter
- ✅ Backend healthy
