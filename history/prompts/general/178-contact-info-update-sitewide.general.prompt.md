---
id: 178
title: Sitewide Contact Info Update — Phone, Email, Address
stage: general
date: 2026-05-12
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Update contact information (address, email, phone) across entire AF Apparels frontend
labels: ["contact-info","phone","email","address","display-text"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/layout/Footer.tsx
  - frontend/src/app/(customer)/privacy-policy/PrivacyPolicyContent.tsx
  - frontend/src/app/(customer)/contact/ContactContent.tsx
  - frontend/src/app/(customer)/about/page.tsx
  - frontend/src/app/(auth)/activate-account/page.tsx
  - frontend/src/app/(auth)/login/page.tsx
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(customer)/private-label/page.tsx
  - frontend/src/app/(customer)/print-guide/page.tsx
  - frontend/src/app/(auth)/wholesale/register/page.tsx
tests:
  - none
---

## Prompt

Update contact information (address, email, phone) across entire AF Apparels frontend. Only change display text — do NOT change any backend email sending configuration or Resend settings.

New contact info:
- Address: 10719 Turbeville Rd, Dallas, TX 75243
- Email (display only): info@afblanks.com
- Phone: +1 (469) 367-9753

## Response snapshot

Searched all .tsx files for old phone (214) 272-7213, old email variants (info.afapparel@gmail.com, info@afapparel.com, sales@afapparel.com, support@afapparel.com, privacy@afapparel.com, tax@afapparel.com, legal@afapparel.com, privatelabel@afapparel.com), and address placeholder [FULL ADDRESS].

Changes applied across 10 files:
- Footer.tsx: phone updated
- PrivacyPolicyContent.tsx: phone, all @afapparel.com emails → info@afblanks.com, legal address placeholder filled with 10719 Turbeville Rd, Dallas, TX 75243
- ContactContent.tsx: announce bar, phone card, email card, address card (replaced [FULL ADDRESS — ADD BEFORE LAUNCH] with real address), FAQ answers, department cards, error fallback email — all updated
- about/page.tsx: mailto: and tel: hrefs + display text updated
- activate-account/page.tsx: tel: href and display text, mailto: href and display text updated
- login/page.tsx: two instances of tel: href and display phone updated
- cart/page.tsx: phone and email in USP list updated
- private-label/page.tsx: phone and email in footer note updated
- print-guide/page.tsx: phone and email in footer note updated
- wholesale/register/page.tsx: phone in Questions panel updated

No backend files touched. No .env files touched. No Resend configuration changed.

## Outcome

- ✅ Impact: All customer-facing contact info now shows +1 (469) 367-9753, info@afblanks.com, and 10719 Turbeville Rd, Dallas, TX 75243
- 🧪 Tests: Manual verification — grep confirms zero remaining old contact strings
- 📁 Files: 10 frontend .tsx files modified
- 🔁 Next prompts: none
- 🧠 Reflection: ContactContent had a [FULL ADDRESS — ADD BEFORE LAUNCH] placeholder that was filled as part of this task

## Evaluation notes (flywheel)

- Failure modes observed: Multiple department-specific email aliases (sales@, support@, privacy@, tax@, legal@, privatelabel@) all pointed to old domain — caught in iterative verification pass
- Graders run and results (PASS/FAIL): final grep confirms 0 matches for afapparel.com or 272-7213
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
