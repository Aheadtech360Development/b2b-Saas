---
id: 218
title: Persist shipping rate selection across checkout pages
stage: general
date: 2026-05-26
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "fix: persist shipping rate selection across checkout pages"
labels: ["zustand","persist","sessionStorage","checkout","shippo","shipping-rate"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/stores/checkout.store.ts
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - npx tsc --noEmit (PASS — only 2 pre-existing test file errors)
  - git push PASS
---

## Prompt

Debug: shipping rate data is in store but not reaching order payload.
Console shows address page saves correctly (shippingType: "live_shippo", rate_id, carrier, etc).
But order saved to DB has blank carrier and shipping_rate_id.

Fix: add sessionStorage persistence to checkout store for shippingType and selectedRate using Zustand persist middleware.

## Root cause

Zustand is in-memory only with no persistence. Any hard navigation, browser refresh, or Next.js route transition that caused the module to re-initialize would wipe shippingType and selectedRate back to their initial values ("" and null). The address page logs the correct values being SET, but by the time the review page reads them, the in-memory state was gone.

## Response snapshot

**checkout.store.ts:**
- Added `import { persist, createJSONStorage } from "zustand/middleware"`
- Wrapped store with `persist(...)` middleware using curried `create<CheckoutState>()(persist(...))`
- Persist options: `name: "af-checkout"`, `storage: createJSONStorage(() => sessionStorage)`
- `partialize` persists only `shippingType` and `selectedRate` — all other state (addresses, payment tokens) stays in-memory only
- Full store logic unchanged; only the create() call wrapping changed

**review/page.tsx:**
- Added specific payload field log before wholesale confirmOrder call:
  ```
  console.log("[Review] Final shipping fields in payload:", {
    shipping_rate_id, shipping_carrier, shipping_service
  })
  ```

## Outcome

- ✅ Impact: shippingType and selectedRate survive page refreshes and hard navigations between checkout steps; persist middleware restores them from sessionStorage on load
- 🧪 Tests: TypeScript PASS (0 new errors); git push PASS (f14395d)
- 📁 Files: 2 files modified, +51/-33 lines
- 🔁 Next prompts: Test checkout flow end-to-end; confirm `[Review] Final shipping fields in payload` shows correct values; remove console.log debug statements once confirmed working
- 🧠 Reflection: partialize is used to avoid storing sensitive payment tokens (qbToken, savedCardId, clientSecret) in sessionStorage — only the shipping rate identifiers are persisted

## Evaluation notes (flywheel)

- Failure modes observed: Forgot that Zustand has no built-in persistence — in-memory state is lost on page reinit
- Graders run and results (PASS/FAIL): TypeScript PASS
- Prompt variant (if applicable): null
- Next experiment: null
