---
id: 143
title: Fix Tax Calculation for Pre-Selected Saved Address
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Fix tax calculation not triggering when a saved address is pre-selected on the address page; add selectedAddressId to useEffect deps; fix state ordering issue; replace 'Calculated at checkout' with actual amount"
labels: ["frontend","checkout","tax","bug"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/checkout/address/page.tsx
tests:
  - manual: Load address page with default saved address — tax calculates immediately without user interaction
  - manual: Switch between saved addresses — tax recalculates for each address's state/zip
  - manual: Tax display shows formatted dollar amount (e.g. $1.63) instead of "Calculated at checkout"
  - manual: If no address state is available yet, still shows "Calculated at checkout"
---

## Prompt

In the checkout address step: The tax calculation is not triggering when a saved address is pre-selected. It only fires when the user manually types/changes the state or zip.

Fix this:
1. When the page loads and a saved address is already selected (default address), immediately trigger the tax calculation using that address's state, zip, and city.
2. The tax useEffect should also depend on the selected address ID — so when user switches between saved addresses, tax recalculates.
3. Add the selected address id to the useEffect dependency array.
4. Also make sure "Calculated at checkout" text is replaced with the actual tax amount once calculated. It should show like: "Tax (CA 8.25%): $1.63"

## Response snapshot

Three root causes identified and fixed in `address/page.tsx`:

**1. Variable ordering — `useState` after the `useEffect` that uses it (React rules violation):**
- Moved `const selectedCost = methodCost(shippingMethod)` from after the useEffect to before it (line 156)
- Moved `const [apiTaxAmount, setApiTaxAmount] = useState(0)` from after the useEffect to before it (line 158)
- Both were being referenced inside the useEffect before they were declared — this caused the tax fetch to use stale/undefined values

**2. Missing dependency — `selectedAddressId` not in useEffect deps:**
- Added `selectedAddressId` to the dependency array: `[activeState, activeZip, subtotal, selectedAddressId]`
- Without this, switching saved addresses (which changes `selectedAddressId` and hence `savedActive`, `activeState`, `activeZip`) would not reliably re-trigger the fetch

**3. Tax display gating on `taxRate` instead of `activeState`:**
- Changed guard from `taxRate ? formatCurrency(taxAmount) : <span>Calculated at checkout</span>`
- To: `activeState ? formatCurrency(taxAmount) : <span>Calculated at checkout</span>`
- "Calculated at checkout" now only shows when no address state is available; once an address is selected, shows `$0.00` or the actual amount while the fetch completes

## Outcome

- ✅ Impact: Tax auto-calculates on page load when default saved address is pre-selected
- ✅ Impact: Tax recalculates when user switches between saved addresses
- ✅ Impact: Tax amount displayed as currency ($0.00+) instead of "Calculated at checkout" once address is set
- 🧪 Tests: Manual
- 📁 Files: 1 file modified
- 🔁 Next prompts: null
- 🧠 Reflection: React hook ordering rules require useState/computed values referenced inside a useEffect to be declared before it in the component body

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
