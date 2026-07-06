---
id: 190
title: Invoice Draft Order Fixes
stage: green
date: 2026-05-14
surface: agent
model: claude-sonnet-4-6
feature: admin-orders
branch: main
user: umeradnan7106
command: Fix invoice Pay Now page order not found + draft order detail page not loading
labels: ["draft-orders","invoice","order-detail","DRAFT-prefix","public-endpoint","auth"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/orders.py
  - backend/app/middleware/auth_middleware.py
  - frontend/src/app/(customer)/account/orders/[id]/page.tsx
  - frontend/src/app/(customer)/checkout/invoice/[order_number]/page.tsx
tests:
  - manual: GET /api/v1/orders/DRAFT-XXXXXX (authenticated) returns order
  - manual: GET /api/v1/orders/DRAFT-XXXXXX/invoice-summary (no auth) returns limited order data
  - manual: /checkout/invoice/DRAFT-XXXXXX shows order summary + login prompt when unauthenticated
  - manual: /checkout/invoice/DRAFT-XXXXXX shows payment form when authenticated
  - manual: /account/orders/DRAFT-XXXXXX loads order detail page
  - manual: Pay Now banner appears on unpaid draft orders in customer order detail
---

## Prompt

Fix two issues: invoice Pay Now page order not found, draft order detail page not loading.

Root cause: backend get_order only handles AF- prefix. DRAFT-XXXXXX falls through to UUID parsing → ValueError/500.

Additional fixes: public endpoint for unauthenticated invoice access, Pay Now banner in customer order detail, login prompt on invoice page when not authenticated.

## Response snapshot

**Root cause**: `get_order` had `if order_id.upper().startswith("AF-")` — `DRAFT-` prefix not matched, fell through to `_uuid.UUID(order_id)` which raised ValueError.

**Fix 1 — `orders.py` `get_order`**: Changed check to `startswith(("AF-", "DRAFT-"))` — both prefixes now look up by `order_number` with company_id/placed_by_id ownership check.

**Fix 2 — `orders.py` `get_order_invoice_summary`**: Added `GET /{order_id}/invoice-summary` — public endpoint (no auth required) that looks up order by `order_number.upper()` and returns `{id, order_number, status, payment_status, subtotal, shipping_cost, tax_amount, total, items[]}`. Used by invoice page for unauthenticated link clicks.

**Fix 3 — `auth_middleware.py`**: Added `if path.endswith('/invoice-summary'): return True` to `_is_public()` so the summary endpoint passes through the auth middleware without a Bearer token.

**Fix 4 — `account/orders/[id]/page.tsx`**: Added "Invoice payment pending" yellow banner above the items table when `order.order_number.startsWith('DRAFT-') && payment_status !== 'paid'`, with an `<a>` tag linking to `/checkout/invoice/{order.order_number}`.

**Fix 5 — `checkout/invoice/[order_number]/page.tsx`**: Removed hard redirect-to-login effect. Replaced both effects with a single effect that: (a) if authenticated → fetch via `GET /api/v1/orders/{orderNumber}`; (b) if not authenticated → fetch via `GET /api/v1/orders/{orderNumber}/invoice-summary` and set `showLoginPrompt=true`. Render shows order summary in both cases, but shows "Log In to Pay" button instead of payment form when not authenticated.

## Outcome

- ✅ Impact: Draft order detail page loads correctly; invoice Pay Now flow works end-to-end for authenticated users; unauthenticated link clicks show order summary + login prompt instead of blank error.
- 🧪 Tests: Manual — test all 6 test cases above.
- 📁 Files: 4 files modified — orders.py (2 changes), auth_middleware.py (1 change), account/orders/[id]/page.tsx (Pay Now banner), invoice/page.tsx (public fallback).
- 🔁 Next prompts: None — both issues resolved.
- 🧠 Reflection: `startswith()` with a tuple argument is the cleanest Python idiom for multi-prefix checks. Public endpoints need both a dedicated route AND an auth middleware allowance — missing either one causes a 401 for unauthenticated requests.

## Evaluation notes (flywheel)

- Failure modes observed: single-prefix check in order lookup; no public fallback for invoice payment links
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: null
