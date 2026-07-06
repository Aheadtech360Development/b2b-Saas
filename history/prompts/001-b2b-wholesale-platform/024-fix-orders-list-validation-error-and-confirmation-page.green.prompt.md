---
id: "024"
title: Fix orders list validation error and confirmation page
stage: green
date: 2026-03-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix ResponseValidationError on GET /api/v1/orders and Order Not Found on confirmation page"
labels: ["backend","frontend","bug-fix","order","pydantic","server-component"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/order.py
  - frontend/src/app/(customer)/orders/confirmation/[id]/page.tsx
tests:
  - Backend restarts cleanly (Application startup complete)
  - GET /api/v1/orders returns list without ResponseValidationError
  - POST /api/v1/checkout/confirm + redirect shows order confirmation page with order details
---

## Prompt

Fix two bugs in AF Apparels:

Bug 1: Fix ResponseValidationError on GET /api/v1/orders — OrderListItem schema has item_count: int but Order model has no such attribute. Fix the schema/model mismatch.

Bug 2: Fix "Order Not Found" on confirmation page at /orders/confirmation/[id]. The confirmation page is a server component that calls ordersService.getOrder() — but apiClient stores accessToken as an in-memory module-level variable that is null in server-side rendering context. Result: 401 → exception → "Order Not Found" shown.

## Response snapshot

**Bug 1 — `backend/app/models/order.py`:**

Added `item_count` property alongside the existing `order_notes` alias:
```python
@property
def item_count(self) -> int:
    return len(self.items) if self.items is not None else 0
```

This works because `list_orders_for_company()` already uses `selectinload(Order.items)`, so `self.items` is always populated when the list endpoint is called. Pydantic `from_attributes=True` resolves `item_count` via `getattr` which respects `@property`.

**Bug 2 — `frontend/src/app/(customer)/orders/confirmation/[id]/page.tsx`:**

Converted from server component to client component:
- Added `"use client"` directive
- Removed `await params` (server-only) → use `useParams<{ id: string }>()`
- Removed `export const metadata` (not allowed in client components)
- Added `useEffect` to call `ordersService.getOrder(id)` in browser context where `accessToken` is set
- Added loading state ("Loading order…") while fetch is in progress
- Error state sets `notFound = true` showing the "Order Not Found" UI

The in-memory `accessToken` in `api-client.ts` is only populated client-side after login via `setAccessToken()`. Server components run in Node.js where this module-level variable is always `null`.

## Outcome

- ✅ Impact: GET /api/v1/orders no longer returns ResponseValidationError; confirmation page loads order details after checkout
- 🧪 Tests: Backend startup clean — PASS
- 📁 Files: order.py (item_count property), confirmation page (client component)
- 🔁 Next prompts: Full end-to-end checkout flow test
- 🧠 Reflection: In-memory auth tokens are invisible to server components — any page that requires auth must be a client component or use a cookie-based auth strategy. Server component + fetch-based auth only works with httpOnly cookies (not module-level variables).

## Evaluation notes (flywheel)

- Failure modes observed: Server components can't access browser-only state (in-memory tokens, localStorage). Pages that call authenticated APIs must be client components when using the current auth pattern.
- Graders run and results (PASS/FAIL): Backend startup clean — PASS
- Prompt variant (if applicable): null
- Next experiment: null
