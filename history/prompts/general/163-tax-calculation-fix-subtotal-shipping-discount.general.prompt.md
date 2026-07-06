---
id: "163"
title: Tax Calculation Fix — Subtotal + Shipping − Discount
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix tax calculation — tax must apply on (subtotal + shipping - discount), not just subtotal"
labels: ["tax","checkout","discount","taxjar","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/tax_rate.py
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - backend/app/api/v1/checkout.py
tests:
  - manual: apply coupon + add shipping — tax should be based on (subtotal + shipping - discount)
  - manual: TaxJar path passes taxable_subtotal = max(0, subtotal - discount) to calculate_tax
  - manual: manual fallback uses taxable_amount = max(0, subtotal + shipping - discount)
  - manual: review page taxAmount uses freshTaxAmount when storedTaxAmount is 0
  - manual: checkout.py coupon validation uses cart_total including shipping
---

## Prompt

Fix tax calculation — tax must apply on (subtotal + shipping - discount), not just subtotal.

taxable_amount = subtotal + shipping - discount

Backend (tax_rate.py):
- Add `discount: float = Query(0.0)` param
- TaxJar path: pass `taxable_subtotal = max(0, subtotal - discount)` as subtotal to calculate_tax (TaxJar adds shipping internally)
- Manual fallback: `taxable_amount = max(0, subtotal + shipping - discount)`

Frontend address/page.tsx:
- Pass `discount: String(couponDiscount)` in tax-rate API params
- Fix fallback formula: `taxableBase = max(0, subtotal + selectedCost - couponDiscount)`

Frontend review/page.tsx:
- Add `freshTaxAmount` state
- Re-fetch useEffect: pass `discount` param, capture `tax_amount` → `setFreshTaxAmount`
- Fix `taxAmount` formula: storedTaxAmount > freshTaxAmount > rate × (subtotal+shipping-discount)

checkout.py (bonus fix):
- Coupon validation used `float(cart.subtotal)` — must use `float(cart.subtotal + base_shipping + expedited_surcharge)`

## Response snapshot

**tax_rate.py**:
- Added `discount: float = Query(0.0, description="Coupon/discount amount already applied")`
- `taxable_subtotal = max(0.0, subtotal - discount)` passed to TaxJar
- Manual fallback: `taxable_amount = max(0.0, subtotal + shipping - discount)`
- Log includes discount amount

**address/page.tsx**:
- Tax-rate fetch params: added `discount: String(couponDiscount)`
- Added `couponDiscount` to useEffect dependency array
- Fallback formula: `const taxableBase = Math.max(0, subtotal + selectedCost - couponDiscount)`

**review/page.tsx**:
- Added `const [freshTaxAmount, setFreshTaxAmount] = useState(0)`
- Re-fetch useEffect params: added `discount: String(couponDiscount)`, added `couponDiscount` to deps
- Captures `tax_amount` from API: `if (amount > 0) setFreshTaxAmount(amount)`
- `taxAmount` formula: `storedTaxAmount > 0 ? storedTaxAmount : freshTaxAmount > 0 ? freshTaxAmount : rate × max(0, subtotal+shipping-couponDiscount)`

**checkout.py**:
- `cart_total_for_coupon = float(cart.subtotal + base_shipping + expedited_surcharge)`
- Both `validate_discount_code` and `compute_discount_amount` now use `cart_total_for_coupon`

## Outcome

- ✅ Impact: Tax now correctly computed on full taxable base (subtotal + shipping − discount) across all paths — TaxJar, manual fallback, frontend address step, frontend review step, and server-side coupon validation
- 🧪 Tests: Manual verification needed
- 📁 Files: 4 files modified
- 🔁 Next prompts: Run alembic migration `docker exec afapparel_backend alembic upgrade head` (retail customer accounts migration pending)
- 🧠 Reflection: Two separate coupon-base bugs existed — one in tax_rate.py and one in checkout.py. The checkout.py bug was a secondary find during this fix. Both shared the same root cause: discount/shipping not included in the cart_total used for percentage-based calculations.

## Evaluation notes (flywheel)

- Failure modes observed: missing param propagation (discount never passed to tax API); secondary bug in checkout.py coupon validation using subtotal-only base
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
