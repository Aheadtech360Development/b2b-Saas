---
id: 147
title: Guest Checkout Fixes — ACH, Tax, Style Sheets, Product Specs Public
stage: general
date: 2026-05-05
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Fix four guest user issues — ACH, tax, style-sheets, product-specs
labels: ["guest-checkout", "ach", "tax", "auth-middleware", "public-endpoints"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/middleware/auth_middleware.py
  - backend/app/api/v1/guest.py
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - none
---

## Prompt

Fix four issues where guest (logged-out) users are missing features that work for logged-in users:

1. ACH/Bank Transfer not showing for guest checkout payment step
2. Tax not calculating for guest checkout (tax-rate API returning 401)
3. Style Sheets page returning 401 for guests
4. Product Specs page returning 401 for guests

## Response snapshot

**Root cause for Fixes 2, 3, 4:** All three paths (`/api/v1/tax-rate`, `/api/v1/style-sheets`, `/api/v1/product-specs`) were missing from the auth middleware's public path handling. `_is_public()` in `auth_middleware.py` only allowed products, reviews, guest, and tokenize — nothing else.

**Fix:** Added `startswith` checks for all three paths in `_is_public()`.

**Root cause for Fix 1:** Payment type selector and ACH form were both gated behind `{!isGuest && (...)}` in `payment/page.tsx`. Backend `GuestCheckoutRequest.qb_token` was `str` (required), with no ACH fields defined.

**Fix (backend):** Made `qb_token` optional, added `payment_method`, `ach_bank_name`, `ach_account_holder`, `ach_routing_number`, `ach_account_last4`, `ach_account_type` to `GuestCheckoutRequest`. In the handler, if `payment_method == "ach"` skip QB charge and set `payment_status = "pending"`, else validate `qb_token` is present and charge card. ACH fields saved to Order model (which already had all columns).

**Fix (frontend payment page):** Removed `!isGuest` gate from payment type selector block. Changed ACH form condition from `!isGuest && paymentType === "ach"` to `paymentType === "ach"`. Changed card form condition from `(isGuest || paymentType === "card")` to `paymentType === "card"`.

**Fix (frontend review page):** Added `payment_method` to guest checkout POST payload. For card: send `qb_token`. For ACH: send `ach_*` fields, omit `qb_token`.

## Outcome

- ✅ Impact: Guests can now: (a) use ACH at checkout, (b) see correct tax, (c) view style sheets, (d) view product specs — all without a 401
- 🧪 Tests: none added (guest flow fixes)
- 📁 Files: 4 files modified
- 🔁 Next prompts: verify ACH guest order appears in admin with correct pending status
- 🧠 Reflection: Auth middleware public path pattern is the single gate for all unauthenticated access — any new public endpoint must be added there

## Evaluation notes (flywheel)

- Failure modes observed: New public endpoints added to routers are silently blocked for guests until explicitly added to `_is_public()` — no dev-time warning
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Add a startup check or test that verifies all non-admin public-facing routers have their paths whitelisted
