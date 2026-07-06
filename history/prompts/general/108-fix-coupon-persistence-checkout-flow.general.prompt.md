---
id: 108
title: Fix Coupon Persistence Through Checkout Flow
stage: general
date: 2026-04-24
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: continue
labels: ["bug-fix","coupon","checkout","localStorage","review-page"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - null
---

## Prompt

The coupon code applied in the cart page is not carrying over to the checkout review page. The discount is not showing in the order summary on the review step, and is not being sent when the order is placed. Fix the coupon to persist through the entire checkout flow — cart → shipping → payment → review — and ensure it is included in the final order payload.

## Response snapshot

**Root cause:** The cart page stored only the code string (`localStorage.setItem("af_coupon", data.code!)`) but the review page needed the full coupon object (discount_amount, discount_type) to display the discount line. Restoring only the code also meant `appliedCoupon` state was never set on page load, so the discount wasn't shown and the input field showed empty.

**Fix 1 — cart/page.tsx:**
- Changed `localStorage.setItem("af_coupon", data.code!)` → `localStorage.setItem("af_coupon", JSON.stringify(coupon))` — stores full `AppliedCoupon` object.
- Updated the restore `useEffect` to `JSON.parse` the stored value and call both `setCouponInput(parsed.code)` AND `setAppliedCoupon(parsed)` so the cart UI correctly shows the applied state on revisit. Falls back gracefully for plain-string legacy entries.

**Fix 2 — checkout/review/page.tsx:**
- Added `appliedCoupon` state (`{ code, discount_amount, discount_type } | null`).
- Added `useEffect` on mount to read and parse `af_coupon` from localStorage, setting `appliedCoupon` state.
- Removed the ad-hoc `localStorage.getItem("af_coupon")` inside `handlePlaceOrder`; now uses `appliedCoupon?.code` from state instead — consistent and avoids reading stale localStorage during the async place-order call.
- Added coupon `total` formula: `const total = subtotal + shipping - couponDiscount`.
- Added coupon display line in order summary JSX: shows "Coupon (CODE) -$X.XX" in green, same style as tier discount.

## Outcome

- ✅ Impact: Coupon now persists cart → review, shows discount amount, deducts from total, and is included in confirmOrder payload.
- 🧪 Tests: Manual: apply code in cart, proceed to checkout, verify discount shows on review page and correct total is charged.
- 📁 Files: 2 files modified
- 🔁 Next: Re-validate coupon on review page load if server-side check is needed (current approach trusts localStorage; acceptable for B2B wholesale flow)

## Evaluation notes (flywheel)

- Failure modes observed: Stored only the code string instead of the full coupon object; review page never re-hydrated coupon state from localStorage
- Graders run and results (PASS/FAIL): null
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
