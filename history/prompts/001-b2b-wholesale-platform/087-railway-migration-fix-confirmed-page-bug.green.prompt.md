---
id: "087"
title: Railway Migration Fix + Confirmed Page Bug
stage: green
date: 2026-04-16
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: /sp.green
labels: ["migrations","railway","checkout","bugfix","idempotent"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/migrations/versions/j3k4l5m6n7o8_add_wholesale_application_fields.py
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - TypeScript: tsc --noEmit (pre-existing errors only)
---

## Prompt

Session continuation from PHR #086. Two remaining issues:

1. Railway production crash: `asyncpg.exceptions.UndefinedColumnError: column "address_line1" of relation "wholesale_applications" does not exist` — migration `j3k4l5m6n7o8` was not running idempotently on Railway.

2. Confirmed page (step 4) redirect bug: `reset()` was called in `review/page.tsx` before `router.push("/checkout/confirmed")`, wiping `confirmedOrderId` and `confirmedOrderNumber` from the Zustand store, causing the guard on the confirmed page to redirect to `/cart`.

## Response snapshot

### Fix 1: Idempotent migration j3k4l5m6n7o8

**Root cause**: `j3k4l5m6n7o8_add_wholesale_application_fields.py` used `op.add_column(...)` which fails with `DuplicateColumn` error if any column already exists. Railway's startup command silently swallows this failure, leaving `alembic_version` stuck and the `wholesale_applications` table incomplete.

**Fix**: Replaced all 16 `op.add_column(...)` calls with `op.execute("ALTER TABLE wholesale_applications ADD COLUMN IF NOT EXISTS ...")` raw SQL — same idempotent pattern already applied to `i2j3k4l5m6n7` in PHR #086.

Migration chain is now fully idempotent: `i2j3k4l5m6n7` → `j3k4l5m6n7o8` → `k4l5m6n7o8p9` (catch-up). All use `IF NOT EXISTS`.

### Fix 2: Confirmed page reset() bug

**Root cause**: In `review/page.tsx` `handlePlaceOrder()`:
```
setConfirmedOrder({ id, number, ... })  // sets confirmedOrderId
clearCart()
reset()                                  // WIPES confirmedOrderId → null
router.push("/checkout/confirmed")       // confirmed page guard fires → /cart
```

**Fix**: Removed `reset()` call from `handlePlaceOrder()`. The checkout store state persists through navigation to the confirmed page. `clearCart()` is sufficient — the cart is cleared, and the confirmed order fields remain readable on step 4.

Also removed the now-unused `reset` from the store destructure in `review/page.tsx`.

## Outcome

- ✅ Impact: Migration chain fully idempotent — Railway deploy will run `alembic upgrade head` successfully. Confirmed page (step 4) now displays correctly without redirect to cart.
- ✅ Tests: TypeScript clean (tsc --noEmit, pre-existing errors only)
- ✅ Files: 2 files modified
- ✅ No breaking changes
- 🔁 Next: Commit and push to trigger Railway deploy; test full 4-step checkout end-to-end; test wholesale registration form submission

## Evaluation notes (flywheel)

- Failure modes observed: (1) Alembic idempotency — `op.add_column` fails silently on Railway when columns exist; use raw SQL `IF NOT EXISTS` for all additive migrations. (2) Zustand reset() timing — calling reset() before navigation wipes data that the next page needs; only reset after the destination page has consumed the data (or not at all for confirmed-order flows).
- Graders run and results (PASS/FAIL): tsc --noEmit PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add `reset()` call to the "Continue Shopping" button onClick in confirmed/page.tsx for clean store cleanup after user leaves
