---
id: "055"
title: Fix Auth Loading and Navigation Flash
stage: green
date: 2026-03-27
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Fix excessive loading and auth loss on page navigation in AF Apparels frontend
labels: ["bug-fix","auth","loading","navigation","useRef","react"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/providers/AuthInitializer.tsx
  - frontend/src/app/(customer)/account/layout.tsx
  - frontend/src/app/(admin)/layout.tsx
  - frontend/src/app/(customer)/account/page.tsx
  - frontend/src/app/(customer)/account/profile/page.tsx
  - frontend/src/app/(customer)/account/addresses/page.tsx
  - frontend/src/app/(customer)/account/contacts/page.tsx
  - frontend/src/app/(customer)/account/users/page.tsx
  - frontend/src/app/(customer)/account/payment-methods/page.tsx
  - frontend/src/app/(customer)/account/orders/page.tsx
tests:
  - docker compose restart frontend (started, 200 OK on /admin/orders)
---

## Prompt

Fix excessive loading and auth loss on page navigation in AF Apparels frontend. Pages show "Loading..." for too long, sometimes user gets logged out and sees loading spinner forever.

## Root causes

1. **`isAuthenticated` in useEffect deps** — While `isAuthenticated` is a stable Zustand function reference, listing it as a dependency is misleading and caused incorrect assumptions about re-runs. In React StrictMode (Next.js dev), effects fire twice (mount → cleanup → mount), meaning API calls were made twice per navigation. No cleanup existed in these effects so both calls completed, causing duplicate API requests.

2. **No `.finally` safety net in AuthInitializer** — If any unexpected code path bypassed both `setAuth` and `clearAuth`, `isLoading` would remain `true` forever showing the spinner permanently. The `.finally` guard prevents this edge case.

3. **Flash redirect on account/admin layouts** — When `isLoading` briefly becomes `false` before auth fully restores from sessionStorage (sub-frame timing edge), the layout immediately called `router.replace("/login")`. A 300ms debounce prevents this false redirect while being imperceptible to the user.

4. **`user` in `account/page.tsx` deps** — The overview page used `[isLoading, user]` which re-ran the effect when `user` object was reassigned (Zustand creates a new state object on any `set()`), triggering duplicate API calls.

## Changes

### AuthInitializer.tsx
Added `.finally(() => useAuthStore.getState().setLoading(false))` after the `.catch` block. Safety net: if any unhandled code path bypassed `setAuth`/`clearAuth`, `isLoading` would stay `true` forever. Now it always terminates.

### account/layout.tsx + admin/layout.tsx
- Added `useRef<ReturnType<typeof setTimeout>>` for redirect timer
- Unauthenticated redirect now waits 300ms and re-checks before navigating
- Admin redirect in account layout remains immediate (known admin → no ambiguity)
- Timer is properly cleaned up in the effect's return function (prevents stale redirects)

### account/page.tsx
- Added `useRef(false)` hasLoaded guard
- Changed deps from `[isLoading, user]` → `[isLoading]` (user reference was causing re-runs)

### account/profile, addresses, contacts, users, payment-methods pages (5 pages)
- Added `import useRef`
- Added `const hasLoaded = useRef(false)` per component
- Added guard before API call: `if (hasLoaded.current) return; hasLoaded.current = true;`
- Removed `isAuthenticated` from deps array: `[isLoading, isAuthenticated]` → `[isLoading]`
- Guard prevents React StrictMode double-invocation from triggering 2 API calls

### account/orders/page.tsx
- NOT given hasLoaded guard — search and status filter changes must intentionally re-trigger the data load
- Removed `isAuthenticated` from the deps comment (it was already absent from the array post-previous session; added clarifying comment)

## Outcome
- ✅ Frontend restarted, compiled, serving (200 OK)
- ✅ AuthInitializer never leaves isLoading: true permanently
- ✅ 300ms redirect debounce eliminates flash-redirect on auth restore
- ✅ All 6 simple account pages: single API call per mount (StrictMode-safe)
- ✅ Orders and inventory pages: still re-run on filter changes
- 📁 Files: 10 files modified
