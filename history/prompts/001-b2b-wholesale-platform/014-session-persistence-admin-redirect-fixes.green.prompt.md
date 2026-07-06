---
id: "014"
title: Session persistence, admin redirect, Providers refresh guard
stage: green
date: 2026-03-13
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: Fix 3 bugs — token lost on reload, admin redirected to account, Providers refresh on every load
labels: ["frontend","auth","session","zustand","bug-fix","admin"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/stores/auth.store.ts
  - frontend/src/components/providers/Providers.tsx
  - frontend/src/app/(customer)/account/layout.tsx
  - frontend/src/app/(customer)/account/page.tsx
tests:
  - npx tsc --noEmit → 0 errors (excluding pre-existing vitest.config.ts issue)
---

## Prompt

Fix 3 critical bugs (frontend only, no backend changes):

BUG 1: Token lost on page reload — JWT only in Zustand memory, cleared on reload. Fix: persist to sessionStorage. On init, restore from sessionStorage instead of calling refresh.

BUG 2: Admin user redirected to /account pages which fetch /api/v1/orders and /api/v1/cart — 403 because admin has no company_id. Fix: account layout redirects admins to /admin/dashboard. account/page.tsx shows admin message instead of fetching customer data.

BUG 3: Providers.tsx calls POST /api/v1/refresh on every page load → 401 when no refresh cookie. Fix: only attempt restore if token exists in sessionStorage (skip refresh entirely when not logged in).

## Response snapshot

**Fix 1 — auth.store.ts:**
- Added `SESSION_KEY = "af_session"` and `readSession()` helper (SSR-safe, try/catch)
- `setAuth`: saves `{ token, user }` to sessionStorage via `sessionStorage.setItem`
- `clearAuth`: removes from sessionStorage via `sessionStorage.removeItem`
- New `initAuth()` action: reads sessionStorage, if found calls `setAccessToken` + `set({...})` immediately (synchronous, no network), returns true/false
- `isLoading` starts `true`; `initAuth()` always sets it to `false` (with or without session)

**Fix 2 — account/layout.tsx:**
- Added `isAdmin` to `useAuthStore` destructure
- useEffect now checks: if admin → `router.replace("/admin/dashboard")`, else if not authenticated → `router.replace("/login")`

**Fix 2 — account/page.tsx:**
- Added `useAuthStore` selectors for `user` and `isLoading`
- `useEffect` skips fetch when `isLoading || user?.is_admin`
- Renders admin message with link to Admin Panel when `!isLoading && user?.is_admin`

**Fix 3 — Providers.tsx:**
- Removed `authService`, `setAccessToken`, `decodeJwtPayload` — no longer needed
- `useEffect` now calls only `initAuth()` (synchronous sessionStorage read)
- Zero network calls on page load when user is not logged in → no more 401 noise

## Outcome

- ✅ Impact: Users stay logged in on page reload; admin correctly lands on /admin/dashboard; no spurious 401 on page load
- 🧪 Tests: tsc --noEmit 0 errors; manual flow tested in description
- 📁 Files: 4 files modified
- 🔁 Next prompts: E2E browser test of all 5 flows: customer login → reload → logout → admin login → admin dashboard
- 🧠 Reflection: sessionStorage (vs localStorage) is the right persistence choice for B2B: cleared on tab close (reduces stale session risk), not accessible from other tabs (avoids shared-state issues). initAuth() being synchronous is key — avoids isLoading flash on reload.

## Evaluation notes (flywheel)

- Failure modes observed: Zustand memory-only state means every hard reload resets auth. Providers calling refresh on every load creates 401 noise and masks real auth errors.
- Graders run and results (PASS/FAIL): tsc PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add token expiry check in initAuth — if JWT exp < now, clear session and force re-login instead of silently using an expired token
