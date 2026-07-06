---
id: "016"
title: Fix 403 Company Required and auth state bugs
stage: green
date: 2026-03-15
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix 403 'Company account required' on cart/orders, and stale is_admin in sessionStorage"
labels: ["frontend","auth","bug-fix","cart","orders"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/stores/auth.store.ts
  - frontend/src/components/layout/Header.tsx
  - frontend/src/app/(customer)/account/layout.tsx
  - frontend/src/app/(customer)/account/page.tsx
tests:
  - Login as admin → Header never calls GET /api/v1/cart
  - Login as customer → GET /api/v1/cart 200
  - Page reload as admin → is_admin correctly decoded from JWT → no cart fetch
  - Page reload as customer (john@downtownretail.com) → cart and orders load normally
  - Navigate to /account as admin → redirected to /admin/dashboard
---

## Prompt

Fix 403 "Company account required" errors on cart and orders endpoints seen after auth fixes.
Console errors:
- POST /api/v1/refresh 401 (expected, no cookie)
- GET /api/v1/cart 403 — "Company account required"
- GET /api/v1/orders?page=1 403 — "Company account required"
- ApiClientError: Company account required (uncaught)

## Response snapshot

**Root cause analysis:**

The `company_id` claim is only present in JWTs for customer users (not admin). The 403 "Company account required" fires when the backend sees a valid JWT with no `company_id`. Three bugs caused this:

**Bug 1 — auth.store.ts `initAuth()` stale `is_admin`:**
Sessions stored in sessionStorage before the JWT `is_admin` decoding was added had `is_admin: undefined/false` even for admin users. On page reload, `initAuth()` restored the session without re-checking the JWT. So an admin user had `isAdmin()` returning `false`, `isAuthenticated()` returning `true` → Header.tsx cart fetch ran with an admin JWT (no `company_id`) → 403.

Fix: decode the JWT in `initAuth()` to always get `is_admin` from the JWT payload:
```typescript
const payload = decodeJwtPayload(session.token);
const user = { ...session.user, is_admin: !!payload.is_admin };
```

**Bug 2 — Header.tsx: `useEffect` deps `[isAuthenticated, isAdmin]` are stable function refs:**
The effect only fired once on mount. More critically, it depended on functions rather than the actual auth state, making it immune to auth state changes after mount. Replaced with:
```typescript
useEffect(() => {
  if (isLoading || !user || user.is_admin) return;
  // fetch cart
}, [isLoading, user]);
```

**Bug 3 — account/page.tsx null-user guard:**
`if (isLoading || user?.is_admin) return` — when `user = null` and `isLoading = false` (after clearAuth), `user?.is_admin` is `undefined` (falsy), so the guard didn't fire and orders fetch ran unauthenticated.
Fix: `if (isLoading || !user || user.is_admin) return;`

**Bug 4 — account/layout.tsx function-ref deps:**
Same issue as Header.tsx — `[isLoading, isAuthenticated, isAdmin, router]` used function refs. Changed to use `user?.is_admin` state directly.

## Outcome

- ✅ Impact: Admin users never trigger cart/orders fetches; null-user case properly guarded; stale sessionStorage sessions correctly patched via JWT re-decode
- 🧪 Tests: Manual — login as admin → no 403s; login as customer → cart and orders load
- 📁 Files: 4 files modified
- 🔁 Next prompts: Run full E2E browser test to verify no remaining 403 errors

## Evaluation notes (flywheel)

- Root cause: sessionStorage sessions can become stale when code changes. Always decode JWT claims at restore time, not just at login time.
- Using stable function references (Zustand store methods) in useEffect dependency arrays is a silent bug — changes to the underlying state don't trigger re-runs.
