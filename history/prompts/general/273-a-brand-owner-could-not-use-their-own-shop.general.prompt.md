---
id: 273
title: A brand owner could not use their own shop
stage: general
date: 2026-09-25
surface: agent
model: claude-opus-5
feature: none
branch: main
user: Aheadtech360Development
command: live-launch debugging
labels: ["auth","rbac","multi-tenant","dns","favicon","onboarding"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/auth_service.py
 - backend/app/api/v1/platform/tenants.py
 - backend/app/api/v1/storefront.py
 - frontend/src/lib/api-client.ts
 - frontend/src/app/(auth)/login/page.tsx
 - frontend/src/app/layout.tsx
 - frontend/src/app/page.tsx
 - frontend/src/components/home/NewShopHome.tsx
 - frontend/src/components/platform/PlatformChrome.tsx
 - frontend/src/components/storefront/ThemeChrome.tsx
tests:
 - scratchpad/t_owner_login.py (ALL PASSED — 15 checks)
 - scratchpad/t_chrome.py, t_two_brands.py, t_entitlements.py, t_signup.py, t_reset.py (ALL PASSED)
 - npx tsc --noEmit clean, npx next build clean
---

## Prompt

ye dekho dashboard pr kisi ke bhi click krrha hn na mere bhai ye dekho isme kia bhanda arha ha kabhi ye error ajata ha kabhi sai chal jatra ha … aur jo mail jati hana brand ko shop bnne ke bad usme bhi ye dekho kia arha ha … jb koi bnda new brand ata ha to uski website mei kch hota hi nh to shru mei bs ye likha ae na acha si catchy se line likhdo … brand phir jb admin dashboard access krega konsy url se krega … likha arha ha interflow not found … header bhi nh arha ha na hi footer arha ha login pe … kiaye issue vercel ka * wala ha to batao phir uska kch krty … printcopilot pr favicon dekho whi arha ha jo har brand pe arha ha

## Response snapshot

Four separate faults, one of them serious.

1. **A brand's owner could not use their own brand.** `_build_access_token_claims`
   put `is_admin` (a column the platform console never set) and nothing else in
   the token — no `tenant_id`, no `role`, no `is_platform_admin`. So login
   returned 200 and every `/api/v1/admin/` call returned 403. Only the console's
   impersonation link worked, because it mints those claims itself. `is_admin`
   is now derived from role, and the brand, its slug, the role and the platform
   flag all travel in the token. The console also sets `is_admin` on create.
2. **"Tenant 'interflow' not found"** — `api-client.currentTenantSlug()` still
   read sessionStorage and the cookie on the platform's own host, so the browser
   kept asking for a brand that had since been renamed. The platform host now
   resolves to no tenant and forgets what it was holding.
3. **A new brand's site looked broken** — the built-in storefront with nothing
   in it. `NewShopHome` replaces it until a theme or a product exists.
4. **Every shop wore the platform's favicon** — the layout's `metadata` was a
   fixed object; it is `generateMetadata()` now, reading the brand's
   `favicon_url` and `store_name` from `/theme-active`. Sign-in pages also left
   `NOT_STOREFRONT`, so they wear the brand's chrome, and the platform's own get
   `PlatformChrome`.

Not code: `beesknees.printcopilot.co` is absent from Vercel's domain list, which
is the `ERR_CONNECTION_CLOSED`. A wildcard needs the domain's nameservers
pointed at Vercel — and the Resend records re-created there.

## Outcome

- ✅ Impact: a brand owner can sign in and run their shop; staff roles work.
- 🧪 Tests: t_owner_login.py (owner, staff, refusals) + five existing suites.
- 📁 Files: 10 files across both halves.
- 🔁 Next prompts: wildcard DNS; PLATFORM_NAME on Railway; brand-side login on
  the brand's own host.
- 🧠 Reflection: the impersonation link hid this — every brand looked fine from
  the platform's side and was unusable from the owner's.

## Evaluation notes (flywheel)

- Failure modes observed: an admin flag stored in two places (column and role)
  that disagreed; a convenience path (impersonation) masking a broken main path.
- Graders run and results (PASS/FAIL): PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a smoke test that signs in as each
  brand's own owner after a deploy.
