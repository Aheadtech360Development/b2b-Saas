---
id: "169"
title: Retail Account Company Record, View Button, Nav Fix
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix retail customer account issues — company account required error, missing profile data, missing View button in admin. Read ALL files first."
labels: ["retail","company","activation","orders","admin","profile","nav","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/auth.py
  - backend/app/services/auth_service.py
  - backend/app/services/company_service.py
  - backend/app/api/v1/orders.py
  - frontend/src/app/(customer)/account/layout.tsx
  - frontend/src/app/(admin)/admin/customers/page.tsx
tests:
  - manual: activate retail account — confirm Company + CompanyUser records created in DB
  - manual: activate retail account — JWT includes company_id claim
  - manual: log in as retail user — JWT includes company_id (from CompanyUser lookup in auth_service)
  - manual: retail user visits /account/profile — company section populated with activation data
  - manual: retail user visits /account/addresses — loads without "Company account required" error
  - manual: retail user visits /account/payment-methods — loads without error
  - manual: retail user views /account/orders — shows all placed_by_id orders (retail path prioritized)
  - manual: admin Customers list — retail rows have View button, clicking opens /admin/customers/<company.id>
  - manual: admin Customers list — retail companies appear with "Retail" badge (owner.account_type="retail")
  - manual: old retail users (no Company record) still appear in list via User fallback
---

## Prompt

Fix retail customer account issues — company account required error, missing profile data, missing View button in admin. Read ALL files first.

1. FIX 1: "Company account required" error for retail users
2. FIX 2: Retail customer account should show same pages as wholesale (remove wholesale-only guards)
3. FIX 3: Account Profile should show all form data collected during activation
4. FIX 4: Admin Customers — "View" button missing for retail customer (our PHR #167 removed it, user now wants it back with a working view)
5. FIX 5: Retail user's company data must be saved during activation (currently only WholesaleApplication is created, not a Company record)

## Response snapshot

**Root cause**: `activate_account` created `WholesaleApplication` but no `Company` or `CompanyUser` record. Retail users had no `company_id` in JWT → most account endpoints (profile/company, addresses, payment-methods) returned 403 "Company account required". Profile page showed no company data (null). Admin View button was removed in PHR #167 since retail rows had `user.id` not `company.id`.

**FIX 5 + FIX 1 + FIX 3 — `auth.py` `activate_account`**:
- Import `Company`, `CompanyUser` from `app.models.company`
- After setting user fields, create `Company(status="active", name=company_name, all form fields)`
- `await db.flush()` to get `company.id`
- Create `CompanyUser(company_id=company.id, user_id=user.id, role="owner")`
- JWT extra_claims now includes `company_id: str(company.id)` alongside `account_type: "retail"`

**FIX — `auth_service.py` `login`**:
- Previous code skipped `CompanyUser` lookup for retail users (`if not is_retail`)
- Changed to always look up `CompanyUser` for all non-admin users
- Suspension check only applies to wholesale (`if not is_retail and company.status == "suspended"`)
- Pending/rejected application check also skipped for retail (`elif not is_retail`)
- Result: subsequent logins for retail users now include `company_id` in JWT

**FIX 2 — `account/layout.tsx` `RETAIL_NAV_ITEMS`**:
- Added `Address Book (/account/addresses)` and `Manage Payment Methods (/account/payment-methods)` to retail nav
- Retail users now see 6 nav items instead of 4

**FIX — `orders.py`**:
- `list_orders` and `get_order`: retail path check moved BEFORE company_id check so old `placed_by_id` orders remain visible even after retail users get company_id
- `reorder`: changed from "no company_id → ForbiddenError" to "no company_id AND not retail → ForbiddenError"

**FIX 4 — `admin/customers/page.tsx`**:
- Removed `{!isRetail && ...}` guard around View button — all rows now show View
- All rows now clickable (row click + View button both navigate to `/admin/customers/${co.id}`)
- After FIX 5, retail rows have `company.id` so the admin detail page loads correctly

**FIX — `company_service.py`**:
- Owner query now includes `User.account_type` in SELECT
- Company rows use `owner.get("account_type", "wholesale")` instead of hardcoded `"wholesale"`
- Retail companies (created at activation) will now show "Retail" badge in admin list
- Retail User fallback now excludes users who already have a CompanyUser (owner) record, preventing duplicates

## Outcome

- ✅ Impact: Retail users activated after this fix have full Company records, company_id in JWT, working profile/addresses/payments pages, and are viewable from admin. Orders remain accessible via placed_by_id path. Admin can click View on any customer row.
- 🧪 Tests: Manual verification needed
- 📁 Files: 6 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: The root cause was that activate_account only created WholesaleApplication (review queue entry) but not an actual Company record. This cascaded into no company_id in JWT, 403 on every company-scoped endpoint, null profile data, and a broken admin View flow. The login service also had an explicit `if not is_retail` guard that prevented company_id from appearing in subsequent login JWTs.

## Evaluation notes (flywheel)

- Failure modes observed: login service explicitly skipped CompanyUser lookup for retail users; activate_account created WholesaleApplication only; admin list removed View button (PHR #167) instead of finding a way to make it work
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
