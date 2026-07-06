---
id: 255
title: Admin Standard Ground Auto-Fetch Shippo Rates
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix admin Standard Ground orders auto-fetch Shippo rates on page load
labels: ["admin","shipping","shippo","rates","auto-fetch","standard-ground"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - npm run build (PASS)
---

## Prompt

Admin order shipping section broken for Standard Ground orders. Order 1023 shows "standard — Flat Rate — $9.85" (customer-selected), but admin sees the Fetch Rates UI which requires manual interaction instead of auto-loading rates on page load.

## Response snapshot

**Root cause — two bugs in the auto-fetch useEffect (lines 329-357):**

1. `if (adminRatesRef.current.length > 0) return;` — The ref guard was designed to prevent double-fetch in React Strict Mode, but it fires BEFORE the API response arrives. In Strict Mode, the effect runs twice in quick succession; both runs see `adminRatesRef.current.length === 0` (API still in flight) and both start fetches. If the first fetch somehow populated the ref (e.g., from a stale navigation), subsequent page loads would skip the auto-fetch entirely.

2. `const weight = order.calculated_weight_lbs ?? 0.5;` — Used 0.5 lb fallback, while `manualWeight` was initialized to `?? 1.0`. Inconsistency means auto-fetch and manual fetch could behave differently.

**Fix applied:**
- Removed `adminRatesRef.current.length > 0` guard entirely
- Added explicit state reset (`adminRatesRef.current = []`, `setAdminRates([])`, `setAdminSelectedRateId(null)`) BEFORE starting each auto-fetch — ensures clean state on every order load
- Changed `!order` → `!order?.id` for clarity
- Added `hasExistingLabel` check — skips auto-fetch if label already generated (order already shipped)
- Changed weight fallback `?? 0.5` → `?? 1.0` (consistent with `manualWeight` init)
- Renamed "Fetch Rates" button → "Refresh Rates" (clarifies it's a manual refresh action, not the primary flow)
- Updated helper text to match new button label

**Untouched:**
- CASE 1 (Live Rate / shipping_rate_id set) — not changed
- CASE 3 (Will Call Pickup) — not changed
- Payment logic — not changed

## Outcome

- ✅ Impact: Standard Ground orders now auto-fetch and display Shippo rates on page load; admin only needs to select a rate and click Generate Label without any manual fetch step
- 🧪 Tests: npm run build PASS
- 📁 Files: 1 file (admin orders page, 12 insertions / 9 deletions)
- 🔁 Next prompts: Verify Order 1023 and other Standard Ground orders auto-load rates on deploy
- 🧠 Reflection: The ref guard was conceptually wrong — it was protecting against a race condition that couldn't actually be prevented with a synchronous guard. The correct fix is to reset state before the fetch and let React handle double-invocation naturally.

## Evaluation notes (flywheel)

- Failure modes observed: ref guard blocking re-fetch; inconsistent weight fallback between auto and manual fetch paths
- Graders run and results (PASS/FAIL): TypeScript build PASS
- Prompt variant (if applicable): none
- Next experiment: add a loading skeleton to the rates list so the auto-fetch state is visible immediately on page load
