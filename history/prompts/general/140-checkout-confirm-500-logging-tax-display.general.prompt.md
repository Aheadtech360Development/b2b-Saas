---
id: 140
title: Checkout Confirm 500 Logging + Tax Display Fix
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Add error logging to confirm endpoint; make tax_rate/tax_region DB writes resilient; fix tax line showing '$0.00' instead of 'Calculated at checkout'"
labels: ["backend","frontend","checkout","tax","logging","500"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/checkout.py
  - backend/app/services/order_service.py
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - manual: 500 from confirm now includes actual exception type and message in response detail
  - manual: Railway logs show full traceback via logger.exception on any unhandled error
  - manual: Order creation succeeds even if tax_rate/tax_region columns are missing in DB (raw SQL UPDATE skipped gracefully)
  - manual: Tax line always shows a dollar amount ($0.00 when no rate configured)
  - manual: Tax included in order total on review page
---

## Prompt

Fix 1: confirm endpoint returning 500 with no useful info. Add try/except + logging. Wrap QB sync separately.
Fix 2: Tax line showing "Calculated at checkout" instead of $0.00 on review page.

## Response snapshot

**`checkout.py`**:
- Added `import logging`, `import traceback`, `from fastapi import HTTPException` at top; created module-level `_log = logging.getLogger(__name__)`.
- Extracted endpoint body into `_confirm_checkout_inner()`. The route handler `confirm_checkout` wraps it in try/except: re-raises `ForbiddenError`/`ValidationError`/`HTTPException` as-is; for all other exceptions calls `_log.exception("confirm_checkout UNHANDLED ERROR ...")` then raises `HTTPException(500, detail=f"Order creation failed: {type(exc).__name__}: {exc}")`.
- QB payment was already wrapped in its own `try/except RuntimeError`.

**`order_service.py`**:
- Removed `tax_rate` and `tax_region` from the `Order(...)` constructor (prevents DB error if columns don't exist yet).
- After flush, applies them via raw SQL `UPDATE orders SET tax_rate=:tr, tax_region=:trg WHERE id=:oid` wrapped in its own try/except — logs a warning if columns are missing (migration not yet run) but does NOT raise. Order creation proceeds in all cases.

**`review/page.tsx`**: Simplified tax line — always shows `{formatCurrency(taxAmount)}` (which is $0.00 when taxRate is null). Label still shows region+rate when available.

## Outcome

- ✅ 500 errors now surface the actual exception message in the response and full traceback in logs
- ✅ Order creation resilient to missing tax_rate/tax_region columns
- ✅ Tax line always shows a dollar amount on the review page
- 🧪 Tests: Manual
- 📁 Files: 3 files modified

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
