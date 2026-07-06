---
id: "165"
title: Tax on Merchandise Only — Shipping Not Taxed
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix tax calculation — tax must apply ONLY on (subtotal - discount), NOT on shipping"
labels: ["tax","checkout","taxjar","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/tax_rate.py
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - manual: subtotal=129.79 discount=14.98 → taxable=114.81 → tax=11.19 (9.75%) → total=146.00
  - manual: TaxJar path passes shipping=0 so only merchandise is taxed
  - manual: address page fallback formula uses subtotal - discount (no shipping)
  - manual: review page fallback formula uses subtotal - discount (no shipping)
---

## Prompt

Fix tax calculation — tax must apply ONLY on (subtotal - discount), NOT on shipping.

taxable_amount = subtotal - discount_amount
tax_amount     = taxable_amount * tax_rate
total          = subtotal + shipping_cost - discount_amount + tax_amount

Expected: subtotal=129.79 shipping=20.00 discount=14.98 → taxable=114.81 → tax=11.19 → total=146.00

## Response snapshot

**tax_rate.py**:
- TaxJar path: changed `shipping=shipping` → `shipping=0` so TaxJar only taxes merchandise amount
- Manual fallback: `taxable_amount = max(0.0, subtotal - discount)` (removed `+ shipping`)

**address/page.tsx**:
- Fallback: `taxableBase = Math.max(0, subtotal - couponDiscount)` (removed `+ selectedCost`)

**review/page.tsx**:
- Fallback: `Math.max(0, subtotal - couponDiscount) * taxRate.rate / 100` (removed `+ shipping`)

**checkout.py / order_service.py — no changes needed**:
- Total formula `subtotal + shipping + tax - discount` is still correct; tax value itself changed

## Outcome

- ✅ Impact: Tax now applies to merchandise only (subtotal − discount); shipping is never taxed; all three paths (TaxJar, manual, frontend fallback) consistent
- 🧪 Tests: Manual verification needed
- 📁 Files: 3 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: The total formula (subtotal + shipping + tax - discount) is algebraically equivalent to (taxable + shipping + tax); only the taxable base definition changed, not the total arithmetic

## Evaluation notes (flywheel)

- Failure modes observed: three separate places computed taxable base independently and all needed the same fix
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
