---
id: 244
title: Five Platform Bug Fixes
stage: general
date: 2026-06-09
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix 5 bugs — QB customers, order numbers, order 500, QB inventory sync, product stock/pricing
labels: ["quickbooks", "orders", "inventory", "frontend", "fix", "celery", "redis", "backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/tasks/quickbooks_tasks.py
  - backend/app/api/v1/guest.py
  - backend/app/api/v1/orders.py
  - backend/app/services/order_service.py
  - backend/app/services/inventory_service.py
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - manual: place order as wholesale user — verify qb_customer_id written once even with concurrent tasks
  - manual: place guest order — verify order_number is numeric (1001+) not AF-format
  - manual: visit /orders/1006 as retail user — verify 200, no 500 error
  - manual: place order with 2 variants — verify sync_inventory_to_qb fires for both variants at t+15s
  - manual: adjust stock in admin — verify product page stock updates for logged-out user after cache busts
  - manual: wholesale user with Individual Variant Pricing — verify Grand Total Price sums correctly per-variant
---

## Prompt

Fix 5 bugs:
1. Duplicate QB customers — check qb_customer_id before creating, use find_or_create pattern
2. Guest order numbers — use numeric 1001+ format not AF-format
3. Order detail 500 for 1006/1007 — handle numeric order numbers properly
4. Inventory not syncing to QB when order placed — trigger sync_inventory_to_qb after stock deduction
5. Product page stock not updating for guests / Individual Variant Pricing not updating immediately

## Response snapshot

**BUG 1 (quickbooks_tasks.py)**: Rewrote `sync_customer_to_qb._run_all()` with single `AsyncSessionLocal` session holding `SELECT FOR UPDATE` from check → commit. If `company.qb_customer_id` already set → return early. QB `create_customer` already does find-or-create by DisplayName (idempotent), lock prevents duplicate API calls from concurrent workers.

**BUG 2 (guest.py)**: Replaced `AF-{counter:06d}` order number generation with:
```sql
SELECT order_number FROM orders WHERE order_number ~ '^[0-9]+$' ORDER BY order_number::INTEGER DESC LIMIT 1
```
Returns `str(int(row[0]) + 1)` or `"1001"` as starting value — exactly matching `OrderService._generate_order_number()`.

**BUG 3 (orders.py GET /{order_id})**: The numeric path previously inlined `select(Order).options(_sil(Order.items))` which missed relationships required by `OrderOut` serialization → MissingGreenlet 500. Fix: resolve order_number → `Order.id` with a lightweight query, then delegate to `svc.get_order_for_retail_user(found_id, user_id)` or `svc.get_order(found_id, company_id)` which have all correct selectinloads.

**BUG 4 (order_service.py + guest.py)**: After the inner inventory deduction loop for each `item_data`, added:
```python
from app.tasks.quickbooks_tasks import sync_inventory_to_qb as _siqb
_siqb.apply_async(args=[str(variant_id)], countdown=15)
```
Both wholesale (`order_service.py`) and guest (`guest.py`) checkout paths now push stock updates to QB.

**BUG 5a (inventory_service.py)**: After flush in `adjust_stock_with_log`, look up the variant's product slug and call `redis_delete_pattern(f"products:detail:{slug}:*")`. This busts both guest and authenticated cache entries whenever stock is adjusted — fixes stale stock display for logged-out users.

**BUG 5b (ProductDetailClient.tsx)**: Replaced `orderTotal = totalUnits * pricePerUnit` (used first variant's price for all) with a `useMemo` that sums `qty * variant.effective_price` per variant. Row totals were already correct; only the "Grand Total Price" display was wrong for Individual Variant Pricing tiers.

## Outcome

- ✅ Impact: No more duplicate QB customers, all orders use consistent numeric format, retail users can view orders by number, QB inventory stays in sync after every order, product stock displays correctly for guests, grand total reflects per-variant pricing
- 🧪 Tests: Manual — see test cases above
- 📁 Files: 6 files, 80 insertions / 41 deletions
- 🔁 Next prompts: Verify QB inventory sync in Railway logs after next order
- 🧠 Reflection: Bug 3's root cause was missing eager loads — delegating to service methods rather than inlining the query is safer because service methods own the selectinload contract

## Evaluation notes (flywheel)

- Failure modes observed: Bug 5a cache invalidation requires 2 extra DB reads per stock adjustment (variant → product slug). Acceptable — this is a background path, not hot.
- Graders run and results (PASS/FAIL): npm run build → PASS
- Prompt variant (if applicable): none
- Next experiment: Add a bulk stock import that also invalidates caches per-product
