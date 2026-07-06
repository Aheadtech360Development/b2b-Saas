---
id: "164"
title: Tax Included in QB Payments Charge Amount
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix tax calculation — shipping must be included in taxable amount"
labels: ["tax","checkout","qb-payments","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/checkout.py
tests:
  - manual: place wholesale order with tax — QB charge amount must equal subtotal + shipping + tax - discount
  - manual: expected: subtotal=129.79 shipping=20.00 discount=14.98 tax=13.14 → charge=$147.95
  - manual: order.total in DB matches QB charge amount
---

## Prompt

Fix tax calculation — shipping must be included in taxable amount. Read files first.

Expected values:
- subtotal = $129.79, shipping = $20.00, discount = $14.98
- taxable = $134.81, tax = $13.14 (9.75%)
- total = $147.95

## Response snapshot

**Root cause**: `checkout.py` line 229 computed `total_float` for QB Payments charge as:
```python
total_float = float(cart.subtotal + base_shipping + expedited_surcharge - coupon_discount_amount)
```
This excluded `payload.tax_amount`, so the card was charged `$134.81` while the order record stored `total = $147.95`.

**Fix** — added `tax_amount_dc` before the charge:
```python
tax_amount_dc = Decimal(str(payload.tax_amount or 0))
total_float = float(cart.subtotal + base_shipping + expedited_surcharge + tax_amount_dc - coupon_discount_amount)
```

**Other paths confirmed correct**:
- `order_service.create_order` line 217-218: `total = subtotal + shipping + tax - discount` ✓
- `guest.py` line 176: `total = subtotal + shipping + tax` ✓
- `tax_rate.py`: manual fallback uses `taxable_amount = subtotal + shipping - discount` ✓
- `admin/orders.py`: recalc uses `subtotal + shipping + tax_amount` ✓
- `cart.py`: no tax logic (thin router only) ✓

## Outcome

- ✅ Impact: QB Payments card charge now matches the stored order total including tax
- 🧪 Tests: Manual verification needed
- 📁 Files: 1 file modified (checkout.py)
- 🔁 Next prompts: none
- 🧠 Reflection: Tax flowed correctly through tax_rate.py → frontend → order_service, but the separate QB charge computation in checkout.py had its own subtotal+shipping formula that never read payload.tax_amount

## Evaluation notes (flywheel)

- Failure modes observed: parallel computation paths (one for charge amount, one for order record) diverging silently — both used different subsets of the total
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
