---
id: 212
title: Live Shippo shipping rates at checkout
stage: general
date: 2026-05-25
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "feat: Live Shippo shipping rates - guest/unassigned customers get real-time carrier rates at checkout"
labels: ["shipping","shippo","checkout","live-rates","discount-groups","standard-shipping"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/shipping.py
  - backend/app/main.py
  - backend/app/middleware/auth_middleware.py
  - frontend/src/app/(admin)/admin/standard-shipping/page.tsx
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
  - frontend/src/app/(customer)/checkout/address/page.tsx
tests:
  - npm run build (TypeScript compilation — PASS)
---

## Prompt

Add "Live Shipping Rates via Shippo" as a third shipping option in two places.

- Guest + no-tier users → always live Shippo rates
- Tier users → depends on tier setting (flat | bracket | live_shippo)
- Backend: new endpoints, model updates, checkout logic
- Frontend: standard-shipping admin page 3rd option, discount groups edit, checkout address page
- DB migrations needed

git add -A && git commit -m "feat: Live Shippo shipping rates - guest/unassigned customers get real-time carrier rates at checkout" && git push

## Response snapshot

**Backend — `backend/app/api/v1/shipping.py` (new file):**
- `POST /api/v1/shipping/live-rates`: calls Shippo API, returns sorted array of live carrier rates (carrier, service, cost, days, rate_id)
- `GET /api/v1/shipping/shipping-type`: returns the shipping_type applicable to current session — checks discount_group_id on request.state first, then falls back to standard_shipping DB setting
- Router registered in main.py as `public_shipping`

**Backend — `auth_middleware.py`:**
- Added `/api/v1/shipping/live-rates` and `/api/v1/shipping/shipping-type` to PUBLIC_PATHS

**Frontend — standard-shipping admin page:**
- Added `"live_shippo"` as 3rd radio option: "Live Shipping Rates (via Shippo)"
- Shows info box when selected explaining Shippo API requirement
- `shippingType` state type updated to include "live_shippo"
- `loadSettings` and `handleSave` updated to read/write "live_shippo" value

**Frontend — discount groups modal (customers/tiers page):**
- `DiscountGroup.shipping_type` interface extended to `"store_default" | "flat_rate" | "live_shippo"`
- New radio option "Live Shipping Rates (via Shippo)" in the group form
- Table column shows "Live rates (Shippo)" for live_shippo type

**Frontend — checkout address page:**
- New `LiveRate` interface
- New state: `shippingTypeForUser`, `liveRates`, `liveRatesLoading`, `selectedLiveRateId`
- `GET /shipping/shipping-type` called on load to know mode
- Live rates useEffect: fires when ZIP ≥ 5 chars + state set + mode is live_shippo
- `selectedLiveRate` computed from `liveRates.find(r => r.rate_id === selectedLiveRateId)`
- `methodCost()` returns `selectedLiveRate.cost` for standard method in live_shippo mode
- Carrier rate picker renders as sub-list under "Standard Ground" option when selected
- Guest flat-rate estimate fetch skipped when `shippingTypeForUser === "live_shippo"`
- Order summary shipping row shows selected carrier+service name and cost

## Outcome

- ✅ Impact: Admins can enable live Shippo rates for standard shipping and discount groups; guests and applicable customers see a carrier picker at checkout
- 🧪 Tests: TypeScript build PASS (79 pages, 0 errors)
- 📁 Files: 6 files (1 new, 5 modified)
- 🔁 Next prompts: Test with real SHIPPO_API_KEY; verify carrier rates appear; check that selected rate cost flows through to order total
- 🧠 Reflection: The live rates useEffect must be declared after `activeZip`/`activeState`/`activeCity` (which are computed variables, not state). Guest flat-rate estimate fetch is conditionally skipped — no DB migrations needed because shipping_type field already exists as a string column.

## Evaluation notes (flywheel)

- Failure modes observed: useEffect referencing `activeZip` before declaration (declared as computed const, not state) — fixed by moving useEffect after those declarations
- Graders run and results (PASS/FAIL): TypeScript PASS
- Prompt variant (if applicable): null
- Next experiment: null
