---
id: 193
title: Five Fixes — Statement Button, Invoice Pay, Admin Section, Duplicate Email, Mobile Email
stage: green
date: 2026-05-15
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Hide Email Statement button; fix Pay Balance showing Payment Complete; Invoice & Payment section hides when paid; remove duplicate Order Confirmed email; fix mobile view in Order Received email."
labels: ["statements","invoice","pay-invoice","email","mobile","admin-orders","duplicate-email"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/account/statements/page.tsx
  - backend/app/api/v1/orders.py
  - frontend/src/app/(customer)/checkout/invoice/[order_number]/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - backend/app/services/order_service.py
  - backend/app/services/email_service.py
tests:
  - manual: Statements page — Email Statement button no longer visible
  - manual: Admin adds item to paid order → customer clicks Pay Balance in email → payment form shows (not "Payment Complete")
  - manual: Admin clicks Mark as Paid → Invoice & Payment section disappears from admin order detail
  - manual: Place order → customer receives exactly one "Order Received" email (not two)
  - manual: View Order Received email on mobile — product table columns are readable and not cramped
---

## Prompt

Hide the non-working "Email Statement" button in Customer Dashboard → Statements. Fix "Pay Balance" invoice email link — after admin adds items to a paid order, clicking Pay Balance shows "Payment Complete" without charging. Admin Orders → Invoice & Payment section should only be visible when payment is unpaid or balance is due; should disappear when Mark as Paid is clicked. Remove duplicate simple "Order Confirmed" email — only the designed "Order Received" email should be sent. Fix mobile view in "Order Received" email — PRODUCT/VARIANT/QTY/UNIT/TOTAL columns appear cramped on mobile.

## Response snapshot

**Fix 1 — `statements/page.tsx`**: Removed the `<button onClick={handleEmailStatement}>Email Statement</button>` element entirely. The button had no working backend implementation.

**Fix 2 — `orders.py` `pay_invoice` + `invoice/[order_number]/page.tsx`**: Removed the early `if order.payment_status == "paid": raise HTTPException(400, "Order is already paid")` guard from `pay_invoice` — this blocked re-payment when admin added items after the order was marked paid. The subsequent `_balance_due <= 0` check is sufficient. Frontend: changed both `setPaid(true)` calls from `data.payment_status === 'paid'` to `data.payment_status === 'paid' && !(Number(data.balance_due) > 0)` so the payment form shows when balance is still owed.

**Fix 3 — `admin/orders/[id]/page.tsx`**: Wrapped entire Invoice & Payment `<div>` in `{!order.is_fully_paid && (...)}`. Removed the now-redundant inner `{!order.is_fully_paid && (...)}` guards from the two buttons (they're always visible within the wrapper). Also removed the "PAID IN FULL" badge that was inside the section (section is hidden when paid). Removed `marked_paid_at` line from status text since section won't show when paid.

**Fix 4 — `order_service.py` `create_order` Step 11`**: Removed the `email_svc.send(trigger_event="order_confirmation", ...)` customer email block entirely. Kept only the admin notification `send_raw` call. The designed "Order Received" email is sent by `checkout.py` via `email_svc.send_order_confirmation()` — no need to also send a plain template email.

**Fix 5 — `email_service.py` `send_order_confirmation`**: Reduced cell padding from `9px 12px` to `8px 8px`, font-size from `13px` to `12px`, changed table `table-layout` from `fixed` to `auto`, added explicit percentage widths to header `<th>` elements (PRODUCT 40%, VARIANT 28%, QTY 10%, UNIT 11%, TOTAL 11%), added `white-space:nowrap` to numeric/variant cells and `word-break:break-word` to product name cell so the table renders cleanly on narrow screens.

## Outcome

- ✅ Impact: Email Statement button hidden; Pay Balance link now shows payment form on partial-balance orders; Invoice & Payment section disappears after Mark as Paid; customers receive one confirmation email per order; Order Received email product table is readable on mobile.
- 🧪 Tests: Manual — test all 5 test cases above.
- 📁 Files: 6 files modified — statements/page.tsx, orders.py, invoice/page.tsx, admin orders page, order_service.py, email_service.py.
- 🔁 Next prompts: None.
- 🧠 Reflection: Fix 2 was a two-part bug — backend blocked re-payment by checking payment_status alone (not balance_due), while frontend showed "complete" screen based on same stale field. Fix 4 was a duplicate-send introduced when checkout.py adopted the branded email but order_service.py was never cleaned up.

## Evaluation notes (flywheel)

- Failure modes observed: payment_status='paid' used as the sole "is paid" signal when balance_due is the correct signal for partial payments; duplicate customer email from two call sites; table layout with fixed widths cramped on mobile viewports
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: null
