---
id: "170"
title: Retail Identical to Wholesale Except Auto-Approved
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix retail customer flow — retail must be IDENTICAL to wholesale except auto-approved. Do NOT change any existing wholesale logic."
labels: ["retail","activation","company","email","auto-approve","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/auth.py
  - frontend/src/app/(auth)/activate-account/page.tsx
tests:
  - manual: submit activation form — Company + CompanyUser created, no WholesaleApplication in DB
  - manual: activation email received is "Application Approved!" (same as wholesale approval email)
  - manual: after activation, JWT includes company_id and account_type=retail
  - manual: frontend redirects to /account/orders (no query string)
  - manual: login page flow identical — setAccessToken → getProfile → setAuth → redirect
---

## Prompt

Fix retail customer flow — retail must be IDENTICAL to wholesale except auto-approved. Do NOT change any existing wholesale logic. Read ALL files first.

The activate-account endpoint must do EXACTLY what admin does when approving a wholesale customer — same DB changes, same email — just automatically.

## Response snapshot

**Analysis**: User model has no `company_id` or `status` fields (pseudocode was conceptual). Company linkage happens via `CompanyUser` + JWT `company_id` claim (already correct from PHR #169). `send_application_approved(to_email, first_name, company_name)` exists in EmailService.

**`auth.py` `activate_account` changes**:
- Removed `WholesaleApplication` import and creation — retail activation is auto-approved, not a pending application for admin review
- Replaced custom "Welcome! 🎉" email + admin notification email with single `email_svc.send_application_approved(to_email, first_name, company_name)` — same email admin sends on wholesale approval
- Everything else unchanged: Company creation, CompanyUser(owner), JWT with company_id + account_type=retail

**`activate-account/page.tsx`**:
- Changed `router.push("/account/orders?activated=true")` → `router.push("/account/orders")`
- Token-save flow was already identical to login page from PHR #169: `setAccessToken` → `getProfile` → `decodeJwtPayload` → `setAuth` → redirect

## Outcome

- ✅ Impact: Retail activation is now identical to wholesale approval — Company created, user linked as owner, approval email sent, JWT with company_id issued. No WholesaleApplication created (retail = immediately approved, not pending queue).
- 🧪 Tests: Manual verification needed
- 📁 Files: 2 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: PHR #169 had already set up the Company/CompanyUser/JWT correctly; this prompt cleaned up the remaining artifact (WholesaleApplication) and replaced the custom welcome email with the standard approval email.

## Evaluation notes (flywheel)

- Failure modes observed: PHR #169 left WholesaleApplication creation and custom emails — retail activation looked like a pending wholesale application rather than an auto-approved account
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
