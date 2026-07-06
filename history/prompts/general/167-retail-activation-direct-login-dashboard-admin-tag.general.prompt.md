---
id: "167"
title: Retail Activation Direct Login + Dashboard + Admin Tag
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix retail customer activation flow — direct login after form submit, fix dashboard loading errors, add retail tag in admin customers list"
labels: ["retail","activation","auth","account-dashboard","admin-customers","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/auth.py
  - frontend/src/app/(auth)/activate-account/page.tsx
  - frontend/src/app/(customer)/account/layout.tsx
  - frontend/src/types/user.types.ts
  - frontend/src/app/(auth)/login/page.tsx
  - backend/app/schemas/company.py
  - backend/app/services/company_service.py
  - frontend/src/app/(admin)/admin/customers/page.tsx
tests:
  - manual: complete retail activation form → user is immediately logged in and redirected to /account/orders?activated=true
  - manual: retail user account sidebar shows only Overview, Account Profile, Change Password, Orders Status
  - manual: admin customers list shows Retail badge (purple) on retail users and Wholesale badge (blue) on companies
  - manual: retail users appear in admin customers list with order count and total spend
  - manual: retail rows in admin list are not clickable (no View button)
---

## Prompt

Fix retail customer activation flow — direct login after form submit, fix dashboard loading errors, add retail tag in admin customers list. Read ALL relevant files first.

1. Activate Account → Direct Login: backend `activate_account` should set `is_active = True` and return JWT tokens
2. Frontend activate page: save token + redirect to `/account/orders` instead of showing success screen
3. Fix "failed to load" errors in customer dashboard for retail users
4. Admin Customers list — show Retail/Wholesale tag badge
5. Make sure retail customers appear in All Customers list

## Response snapshot

**auth.py** `activate_account`:
- Added `create_refresh_token` to security import
- Changed `user.is_active = False` → `user.is_active = True`
- Updated success email: "Your Account is Active!" (removed pending review messaging)
- Returns `{ access_token, refresh_token, token_type, user }` instead of `{ message }`

**activate-account/page.tsx**:
- Added imports: `useRouter`, `useAuthStore`, `setAccessToken`, `authService`, `decodeJwtPayload` helper
- On success: `setAccessToken()` → `authService.getProfile()` → `decodeJwtPayload` → `setAuth()` → `router.push("/account/orders?activated=true")`
- No longer shows `SuccessView` — redirects immediately after JWT login

**user.types.ts**: Added `account_type?: string` to `UserProfile`

**login/page.tsx**: Added `account_type` from JWT payload to `fullProfile` (alongside existing `is_admin`)

**account/layout.tsx**:
- Added `RETAIL_NAV_ITEMS` (Overview, Account Profile, Change Password, Orders Status only)
- `NavLinks` now accepts `items` prop
- Computes `navItems = user?.account_type === "retail" ? RETAIL_NAV_ITEMS : NAV_ITEMS`

**company.py schema**: Added `account_type: str = "wholesale"` to `CompanyListItem`

**company_service.py** `list_companies_paginated`:
- Added `"account_type": "wholesale"` to each company row dict
- When no q/status filter: also queries `User` where `account_type == "retail"` and `is_active == True`
- Fetches order counts and totals for retail users via `placed_by_id`
- Appends retail users as synthetic rows with `account_type: "retail"`
- Increments `total` count to include retail users

**admin/customers/page.tsx**:
- Added `account_type?: string` to `CompanyRow` interface
- Avatar background: purple (#7C3AED) for retail, blue (#1A5CFF) for wholesale
- Shows Retail/Wholesale badge inline with company name
- Retail rows: not clickable, no "View" button

## Outcome

- ✅ Impact: Retail activation → immediate JWT login and redirect; no more pending-approval dead end; dashboard shows retail-appropriate nav; admin can see all retail customers in one list with type badges
- 🧪 Tests: Manual verification needed
- 📁 Files: 8 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: Retail users bypassed the wholesale approval queue entirely (is_active=True, return JWT). Wholesale application record still created for admin visibility/future upgrade. Dashboard nav filtered by account_type to prevent wholesale-only 403 errors for retail users.

## Evaluation notes (flywheel)

- Failure modes observed: retail users previously stuck in pending-approval limbo with no way to log in after submitting the activation form
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
