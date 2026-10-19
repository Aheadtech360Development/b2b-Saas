---
id: 439
title: Block orders for sold-out items
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Fix checkout letting customers order items whose inventory is 0
labels: ["inventory", "checkout", "bugfix", "stock"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/inventory_service.py
 - backend/app/services/order_service.py
 - backend/app/api/v1/guest.py
 - backend/app/services/cart_service.py
 - backend/tests/test_stock_check.py (new)
tests:
 - backend tests/test_stock_check.py — 7 passed
 - real-DB check of guest checkout pricing, old code vs new — sold out x1 was ALLOWED on old code, BLOCKED on new; 2 left x3 BLOCKED; 2 left x2 and untracked x50 ALLOWED
 - related suites (cash on delivery, order attempts, meta capi) still pass
---

## Prompt

bhai isme ek aur jo abhi issue arha hana wo ye arha ha mere bhai ke kuch bhi horha hana jese inventory kisi item ki 0 bhi hana to uska bhi wo order krne derha ha yar plz isko zara check kro yar mere bhai jaldi se issue arha ha log order kry jarhy halake qty 0 ha jani jaldi fix kro isey

## Response snapshot

Root cause: signed-in checkout (order_service.create_order) and guest checkout (guest._price_guest_cart) both summed a
variant's inventory with COALESCE(..., 0) and treated 0 as "no records, so unlimited". A sold-out variant (records
that add up to 0) therefore passed. Added inventory_service.stock_on_hand(), which returns None when there are no
records (stock not tracked), and stock_problem(). Both checkouts now refuse sold-out items or quantities above stock,
and add-to-cart (cart add_matrix_items) does the same. The variant row lock that was already there keeps two buyers
from both getting the last unit. Guest checkout refuses before the card is charged, because the payment intent prices
through the same function.

## Outcome

- ✅ Impact: Sold-out items can no longer be ordered (guest or signed-in). Untracked items still sell without limit.
- 🧪 Tests: 7 new unit tests; real-DB before/after check reproduces the bug and shows the fix
- 📁 Files: 4 changed, 1 new test
- 🔁 Next prompts: reorder and quick-order SKU validation treat untracked items as out of stock (the opposite bug), so fix them with the same helper
- 🧠 Reflection: "0 means unlimited" mixed up "not tracked" and "sold out", so the two states needed separate values

## Evaluation notes (flywheel)

- Failure modes observed: sentinel value overloading (0 used for both "not tracked" and "sold out")
- Graders run and results (PASS/FAIL): pytest PASS, ruff no new issues
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): use stock_on_hand in reorder and validate_sku_list
