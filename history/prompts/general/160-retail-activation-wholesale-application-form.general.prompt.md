---
id: "160"
title: Retail Activation — Full Wholesale Application Form
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: retail-activation
branch: main
user: umeradnan7106
command: "Update retail customer activation flow — replace simple password form with full wholesale application form"
labels: ["retail","activation","wholesale","auth","frontend","backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(auth)/activate-account/page.tsx
  - backend/app/schemas/auth.py
  - backend/app/api/v1/auth.py
  - backend/app/services/auth_service.py
  - backend/app/services/wholesale_service.py
  - backend/app/middleware/auth_middleware.py
  - frontend/src/app/(auth)/login/page.tsx
tests:
  - manual: validate-activation-token returns pre-fill data
  - manual: expired token shows resend form
  - manual: form submit creates WholesaleApplication + keeps user inactive
  - manual: ACCOUNT_PENDING_APPROVAL shown on login after form submission
---

## Prompt

Update retail customer activation flow — replace simple password form with full wholesale application form. Read ALL relevant files first.

Steps:
1. Frontend: replace the simple password form in /activate-account with full wholesale application form
   - On page load: call GET /validate-activation-token to validate token + get pre-fill data
   - Form sections: Personal Info, Business Info, Business Address, Account Setup
   - Email pre-filled and read-only from token validation
   - No reCAPTCHA (user already verified via email link)
   - On submit: POST /activate-account with full form payload
   - On success: show "Application Submitted" screen — NO auto-login
   - Token expired: show resend form
2. Backend: update POST /activate-account endpoint
   - Accept full wholesale form payload (ActivateAccountSchema updated)
   - Set user password + profile but keep is_active=False (pending admin approval)
   - Clear activation_token from user
   - Create WholesaleApplication with status=pending
   - Send confirmation email to applicant
   - Send admin notification email
   - Return success message (no JWT)
3. Admin: existing wholesale approval flow handles activation
   - WholesaleService.approve() updated to also set is_active=True + account_type='wholesale' for previously-inactive retail users
4. Login: handle ACCOUNT_PENDING_APPROVAL (new error for retail users who submitted form but await admin approval)

## Response snapshot

- Fully rewrote `activate-account/page.tsx` with 4 UI states: loading, invalid token, expired (TokenExpiredView with resend), valid form + SuccessView
- Added GET /validate-activation-token endpoint; returns {valid, first_name, last_name, email}
- Updated ActivateAccountSchema with all wholesale form fields (company_name, business_type, address, etc.)
- POST /activate-account: sets password + profile, creates WholesaleApplication, keeps user inactive
- WholesaleService.approve(): activates retail users (is_active=True, account_type='wholesale') on approval
- PUBLIC_PATHS updated: /api/v1/validate-activation-token added
- AccountPendingApprovalError added to exceptions; AuthService.login distinguishes two inactive states
- Login page updated: ACCOUNT_PENDING_APPROVAL shows blue "Application Under Review" banner

## Outcome

- ✅ Impact: Retail users now go through the full wholesale application form on activation; their WholesaleApplication appears in the admin approval queue; admin approval activates them as wholesale customers
- 🧪 Tests: Manual flow verification required; unit tests not added (endpoints are thin route handlers)
- 📁 Files: 7 files modified
- 🔁 Next prompts: run alembic upgrade head when Docker available; test full end-to-end retail activation → admin approval → login flow
- 🧠 Reflection: Clean reuse of existing wholesale approval infrastructure; two inactive-state distinction (ACCOUNT_NOT_ACTIVATED vs ACCOUNT_PENDING_APPROVAL) gives clear UX for both states

## Evaluation notes (flywheel)

- Failure modes observed: none during implementation
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: end-to-end playwright test for full retail activation flow
