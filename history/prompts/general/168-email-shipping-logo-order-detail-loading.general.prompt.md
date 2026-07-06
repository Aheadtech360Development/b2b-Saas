---
id: "168"
title: Email Shipping Dynamic, Logo Fix, Order Detail Loading
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix 3 issues: email shipping static value, AF logo in emails, and order detail page not loading"
labels: ["email","pdf","logo","order-detail","loading","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/email_service.py
  - backend/app/services/pdf_service.py
  - frontend/src/app/(customer)/account/orders/[id]/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - manual: place will-call order (shipping_cost=None) — confirm email and PDF generate without TypeError
  - manual: send order confirmation email — AF logo image appears in header (not text fallback)
  - manual: navigate to customer /account/orders/<id> — loads correctly, shows error+retry on failure
  - manual: navigate to admin /admin/orders/<id> — loads correctly, shows error state on failure
  - manual: timeline "Order placed" entry shows company name (not "null") for guest/retail orders
---

## Prompt

Fix 3 issues: email shipping static value, AF logo in emails, and order detail page not loading. Read ALL files first.

1. Email shipping must use actual order value, not hardcoded
2. AF Logo in emails
3. Order detail page "Loading order..." stuck

## Response snapshot

**FIX 1 — email_service.py + pdf_service.py (shipping None guard)**:
- There were no hardcoded values like `$9.99`; real issue: `float(order.shipping_cost)` throws `TypeError` when `shipping_cost` is `None` (will-call orders)
- Changed `float(order.shipping_cost)` → `float(order.shipping_cost or 0)` in email_service.py and both pdf_service.py occurrences (lines 221 and 362)

**FIX 2 — email_service.py `_base_template`**:
- `LOGO_URL` defaults to `""` in config.py; `_base_template` shows text fallback when empty
- Logo file found at `frontend/public/Af-apparel logo.png`
- Changed: `logo_url = _cfg.LOGO_URL` → `logo_url = _cfg.LOGO_URL or f"{_cfg.FRONTEND_URL}/Af-apparel%20logo.png"`
- Logo now resolves automatically from FRONTEND_URL when LOGO_URL env var is not explicitly set

**FIX 3a — customer `account/orders/[id]/page.tsx`**:
- Root cause: `if (loading || !order)` shows "Loading order…" when loading=false but order=null (fetch failed)
- Added `loadError` state + `retryCount` state
- `load()` now has explicit `catch` that sets `loadError`
- Render shows error message + "Try again" button (increments `retryCount`, which is in useEffect dep array)
- Separate guards: loading → spinner, loadError → error+retry, !order → "not found"
- useEffect dependency: `[id, authLoading, retryCount]`

**FIX 3b — admin `admin/orders/[id]/page.tsx`**:
- Root cause: `adminService.getOrder(id).then(...)` had no `.catch()` — if request failed, order stayed null forever
- Added `orderLoading` and `orderError` states
- Wrapped with `.then()` / `.catch()` / `.finally()` — error set on catch, loading cleared in finally
- Guard: `if (o.company_id)` prevents calling `customers/${null}/stats` for retail/guest orders
- Render: loading → spinner, error/!order → error message + Back button
- Timeline "null · paid" fixed: `order.company_name || order.customer_name || "Customer"`

## Outcome

- ✅ Impact: Will-call order emails/PDFs no longer crash; AF logo appears in emails; order detail pages show error state and retry instead of hanging on "Loading order..."
- 🧪 Tests: Manual verification needed
- 📁 Files: 4 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: The "shipping static value" was actually a None crash rather than a hardcoded value; the admin order page lacked any error handling on its primary data fetch

## Evaluation notes (flywheel)

- Failure modes observed: admin order detail had no .catch() on the initial fetch; customer order detail's loading guard didn't distinguish between "still loading" and "loaded but failed"
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
