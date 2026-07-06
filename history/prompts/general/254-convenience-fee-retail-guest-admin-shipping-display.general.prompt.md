---
id: 254
title: Convenience Fee Retail Guest Admin Shipping Display
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: remove convenience fee for retail/guest, admin order shows customer-selected rate directly
labels: ["checkout","convenience-fee","wholesale","retail","guest","admin","shipping","shippo"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/checkout.py
  - backend/app/services/order_service.py
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/app/(customer)/about/page.tsx
tests:
  - npm run build (PASS — 80 static pages, 0 TypeScript errors)
---

## Prompt

Two fixes needed:

Fix 1 — Remove Convenience Fee for Retail/Guest customers. The 3% convenience fee should only apply to wholesale customers. Currently it is charged to all users (retail, guest, and wholesale). Frontend shows fee to all users; backend charges all card users regardless of account type.

Fix 2 — Admin order page should show customer-selected Shippo rate directly; only show "Fetch Rates" UI for Standard Ground flat-rate orders. Live Rate orders (shipping_rate_id set) currently show carrier tiles (FedEx/UPS/USPS) — replace with a direct Generate Label button since the carrier is already known.

## Response snapshot

**Fix 1 — Convenience fee wholesale-only:**

- `frontend/src/app/(customer)/checkout/payment/page.tsx`: `isWholesale` variable already existed at line 67. Added `isWholesale &&` guard to `convenienceFeeEarly` (line 173), `convenienceFee` (line 228), and the 3% warning toast (line 261). These changes were already committed to HEAD from prior session.
- `backend/app/api/v1/guest.py`: Changed `convenience_fee = (subtotal * 0.03) if card` to `Decimal("0.00")` always. Already in HEAD.
- `backend/app/api/v1/checkout.py`: Added `_account_type = getattr(request.state, "account_type", "wholesale")` at function start. Gated `_convenience_fee_dc` behind `_account_type == "wholesale"`. Passed `is_wholesale=_account_type == "wholesale"` to `create_order`.
- `backend/app/services/order_service.py`: Added `is_wholesale: bool = True` parameter to `create_order`. Changed fee gate from `if _payment_method_for_fee in ("card",...)` to `if is_wholesale and _payment_method_for_fee in ("card",...)`. Default `True` preserves behavior for all existing callers (admin draft orders, etc.).

**Fix 2 — Admin Live Rate label generation:**

Replaced CASE 1 carrier tiles (28 lines) in admin orders page with a single "Generate Label" button. `selectedCarrier` is already pre-set to the customer's carrier by the `useEffect` when the order loads (`setSelectedCarrier(_cMap[o.carrier] ?? o.carrier.toLowerCase())`). The button calls the existing `handleGenerateLabel` which sends `{ carrier: selectedCarrier }` to `/api/v1/admin/orders/{id}/labels`. The "Customer Selected" info banner above already shows carrier/service/cost for live rate orders.

**Bonus fix:** `about/page.tsx` had a pre-existing TypeScript error (`c.p` property not defined on certification objects) — fixed by removing the undefined reference.

## Outcome

- ✅ Impact: Retail and guest customers no longer see or are charged the 3% convenience fee; wholesale checkout unchanged. Admin can generate Shippo labels for live-rate orders with one click instead of navigating carrier tiles.
- 🧪 Tests: npm run build PASS (80 static pages, 0 TypeScript errors after about/page.tsx fix)
- 📁 Files: 4 files changed (checkout.py +3 lines, order_service.py +2 lines, admin orders page -28 lines, about/page.tsx -1 line)
- 🔁 Next prompts: Verify QB charge amount matches order total for retail card payments (no fee should appear in QB charge); test admin label generation for live-rate orders
- 🧠 Reflection: Frontend convenience fee fix was already committed to HEAD from a prior session. Backend was the missing piece — `checkout.py` was using `request.state.account_type` (already available, same pattern used in `orders.py`) and `order_service.create_order` needed an `is_wholesale` flag to avoid re-charging retail customers.

## Evaluation notes (flywheel)

- Failure modes observed: convenience_fee already fixed on frontend+guest in prior session but backend checkout.py was still applying 3% to all card payments; admin carrier tiles added unnecessary friction for live-rate orders
- Graders run and results (PASS/FAIL): TypeScript build PASS
- Prompt variant (if applicable): none
- Next experiment: add an integration test that verifies retail checkout produces zero convenience_fee on the order record
