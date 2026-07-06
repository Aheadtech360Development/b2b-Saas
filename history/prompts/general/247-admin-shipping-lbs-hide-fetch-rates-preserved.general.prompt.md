---
id: 247
title: Admin Shipping LBS Conversion Hide Fetch UI Rates Preserved
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix three bugs — weight unit to LBS, hide fetch UI after label generated, rates state preserved with useRef
labels: ["shippo", "admin", "orders", "shipping", "weight-units", "useRef", "state-management"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - manual: Standard Ground order — rates fetch sends weight in LBS to Shippo (not OZ)
  - manual: Calculated weight minimum is 0.5 lbs not 1.0
  - manual: After label is generated, fetch/rates UI disappears; only label success box shown
  - manual: Rates list does not disappear during re-renders or React Strict Mode double-invocation
  - manual: Manual "Fetch Rates" button still clears and re-fetches correctly
  - build: npm run build → PASS (0 TypeScript errors, 80 pages)
---

## Prompt

Fix three bugs in the admin order shipping / rate fetcher section:

FIX 1 — Weight unit conversion: fetch-rates endpoint was converting weight_lbs × 16 → oz and sending to Shippo with mass_unit=OZ. Change to send weight in LBS directly with mass_unit=LB. Also change minimum calculated_weight_lbs from 1.0 to 0.5 lbs.

FIX 2 — Hide Fetch Rates UI after label is generated: after handleGenerateManualLabel succeeds (labelResult.success = true), the weight input, rates list, and Fetch Rates button remain visible. Wrap the entire Standard Ground fetch UI in {!labelResult?.success && (...)}.

FIX 3 — Rates list disappearing: setAdminRates([]) in auto-fetch useEffect wipes rates on React Strict Mode re-trigger. Fix: add adminRatesRef = useRef<AdminRate[]>([]), skip re-fetch if ref already has rates, sync ref whenever rates are set, add safeguard restore useEffect.

## Response snapshot

**FIX 1 — Backend (`orders.py`):**
- Changed `weight_oz = payload.weight_lbs * 16.0` → `weight_lbs = max(payload.weight_lbs, 0.5)`
- Changed parcel `weight=str(round(weight_oz, 2))` → `weight=str(round(weight_lbs, 2))`
- Changed `mass_unit=WeightUnitEnum.OZ` → `mass_unit=WeightUnitEnum.LB`
- Changed both `calculated_weight_lbs = max(..., 1.0)` → `max(..., 0.5)` in get_admin_order

**FIX 2 — Frontend (`page.tsx`):**
- Wrapped entire Standard Ground fetch UI block (weight input + loading + rate list + no-rates message + generate button) in `{!labelResult?.success && (...)}` — hides when label exists from fresh generation or page load with existing tracking

**FIX 3 — Frontend (`page.tsx`):**
- Added `const adminRatesRef = useRef<AdminRate[]>([]);` beside other shipping state
- Auto-fetch useEffect: removed `setAdminRates([])` before fetch; added `if (adminRatesRef.current.length > 0) return;` guard to prevent double-fetch; syncs `adminRatesRef.current = rates` on success; catch no longer clears rates
- `handleFetchAdminRates` (manual button): syncs ref on clear (`adminRatesRef.current = []`), on success, and on error
- Added safeguard `useEffect` (no deps) that restores rates from ref if state is ever wiped while loading is false

## Outcome

- ✅ Impact: Shippo receives correct weight unit (LBS); fetch/rates UI hidden after label generated; rates list stable across re-renders
- 🧪 Tests: npm run build → PASS, 0 TypeScript errors, 80 pages
- 📁 Files: 2 files changed, 95 insertions / 78 deletions
- 🔁 Next prompts: verify live rate fetch with LBS unit returns correct prices on Railway
- 🧠 Reflection: OZ→LB unit change is cosmetically equivalent but cleaner; the real fix is the ref-based rates preservation which prevents Strict Mode from wiping the rate list on double-invoke

## Evaluation notes (flywheel)

- Failure modes observed: React Strict Mode double-invokes effects in dev — setAdminRates([]) before async fetch meant rates were wiped before the second invocation could set them
- Graders run and results (PASS/FAIL): build PASS
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): test fetch-rates with actual Shippo sandbox to confirm LB unit returns identical rates vs OZ
