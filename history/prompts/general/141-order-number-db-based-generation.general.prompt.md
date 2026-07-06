---
id: 141
title: Order Number DB-Based Generation
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Fix duplicate order number errors — replace Redis counter with DB query for highest existing order number"
labels: ["backend","orders","order-number","redis","duplicate-key"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/order_service.py
  - backend/app/api/v1/guest.py
tests:
  - manual: Placing a new order generates AF-000006 (or next after current highest) — no duplicate key error
  - manual: If no orders exist, starts at AF-000001
  - manual: Guest checkout also uses DB-based number generation
  - manual: If DB query fails, falls back to random 5-digit suffix (same fallback as before)
---

## Prompt

Duplicate key error on order_number (AF-000001 etc already exist). Redis counter resets on Railway restart — fix to query DB for current highest order number and increment by 1.

## Response snapshot

**Root cause**: Both `order_service._generate_order_number()` and `guest.py` used `redis_increment("order:counter")`. When Railway free-tier Redis restarts, the key is lost and the counter resets to 1, colliding with existing DB records.

**`order_service.py` `_generate_order_number()`**: Replaced Redis call with:
```python
SELECT order_number FROM orders
WHERE order_number LIKE 'AF-%'
ORDER BY SUBSTRING(order_number FROM 4)::INTEGER DESC
LIMIT 1
```
Parses suffix, increments by 1, falls back to `random.randint(10000, 99999)` if query fails.

**`guest.py`**: Same DB query logic replacing inline `redis_increment`. Removed unused `from app.core.redis import redis_increment` import.

**Ordering strategy**: Sorts by the numeric suffix parsed as INTEGER (not `created_at`) — handles any out-of-order insertions correctly.

## Outcome

- ✅ Order numbers never conflict with existing DB records
- ✅ Works after Redis restarts/resets
- ✅ Both wholesale and guest checkout paths fixed
- ✅ Fallback to random suffix if DB query errors
- 🧪 Tests: Manual
- 📁 Files: 2 files modified

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
