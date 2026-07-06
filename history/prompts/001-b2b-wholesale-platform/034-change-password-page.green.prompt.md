---
id: "034"
title: Change Password Page
stage: green
date: 2026-03-25
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Create Change Password page for AF Apparels customer dashboard
labels: ["auth","password","frontend","email"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/account/change-password/page.tsx
  - frontend/src/components/layout/CustomerSidebar.tsx
  - backend/app/services/email_service.py
  - backend/app/api/v1/account.py
tests:
  - backend/tests/ (33 passing, no regressions)
---

## Prompt

Create Change Password page for AF Apparels customer dashboard (frontend page + email notification on change + sidebar link).

## Response snapshot

**Frontend (`/account/change-password`):**
- Three password fields with show/hide toggle (SVG eye icons, no emoji)
- Client-side validation: current required, new ≥8 chars + uppercase + digit + different from current, confirm match
- Password strength bar: Weak/Fair/Good/Strong with color-coded fill (red/yellow/blue/green) using inline `style={{ width: pct }}`
- Animated checklist: 3 requirements turn green as they're met
- "Passwords match" confirmation line appears when confirm equals new
- Error handling: 400/VALIDATION_ERROR from API → "Current password is incorrect" on field; other errors → banner
- Success: banner + form reset

**Backend:**
- `EmailService.send_raw(to_email, subject, body_html)` helper added — sends ad-hoc Resend email without needing a DB template
- `change_password` endpoint updated: after `db.commit()`, calls `send_raw` with security notification; wrapped in `try/except` so email failure never blocks the response

**Sidebar:** "Change Password" link added after "Profile"

**Endpoint error paths verified:**
- Wrong current password → 422 VALIDATION_ERROR
- Missing field → 422
- Unauthenticated → 401

## Outcome

- ✅ Impact: Change Password page live at /account/change-password with full validation, strength indicator, and security email
- 🧪 Tests: 33/33 backend tests passing
- 📁 Files: change-password/page.tsx, CustomerSidebar.tsx, email_service.py, account.py
- 🔁 Next: Test in browser; verify email arrives after successful change
