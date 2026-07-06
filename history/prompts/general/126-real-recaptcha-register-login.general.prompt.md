---
id: 126
title: Real reCAPTCHA on Register and Login Pages
stage: general
date: 2026-04-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["recaptcha","security","login","register","frontend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(auth)/wholesale/register/page.tsx
  - frontend/src/app/(auth)/login/page.tsx
tests:
  - none
---

## Prompt

Fix the reCAPTCHA implementation in the wholesale register page. Currently it has a fake hand-crafted checkbox instead of real reCAPTCHA. Replace it with the real react-google-recaptcha widget using NEXT_PUBLIC_RECAPTCHA_SITE_KEY environment variable, same pattern as email-flyer/page.tsx. Also add real reCAPTCHA to the login page.

## Response snapshot

**Register page** (`wholesale/register/page.tsx`):
- Added `dynamic` import from `next/dynamic` and `ReCAPTCHAType` type import
- Added `const ReCAPTCHA = dynamic(() => import("react-google-recaptcha"), { ssr: false })`
- Added `recaptchaRef` (useRef) and `recaptchaToken` state
- Removed `captcha_checked` from form state (no longer needed)
- Updated `handleSubmit` guard: replaced `!form.captcha_checked` check with `!recaptchaToken`
- Added `recaptchaRef.current?.reset()` + `setRecaptchaToken(null)` after successful registration
- Replaced fake checkbox div with real `<ReCAPTCHA sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? ""} ...>`
- Submit button disabled when `!recaptchaToken`

**Login page** (`login/page.tsx`):
- Same imports + dynamic component added
- Added `recaptchaRef` and `recaptchaToken` state
- Added `!recaptchaToken` guard at top of `handleSubmit`
- Added `recaptchaRef.current?.reset()` + `setRecaptchaToken(null)` on login error
- Added `<ReCAPTCHA theme="dark" ...>` between password field and submit button (dark theme matches dark login card)
- Submit button disabled when `!recaptchaToken`

## Outcome

- ✅ Wholesale register now requires real reCAPTCHA — bots can no longer trivially submit the form
- ✅ Login now requires real reCAPTCHA — brute-force login attempts blocked
- ✅ reCAPTCHA resets automatically on login error and on successful registration
- ✅ Both use `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` — same env var as email-flyer page
- ✅ Login uses `theme="dark"` to match the dark background card
- 🧪 Tests: None automated
- 📁 Files: 2 files modified
- 🔁 Next prompts: Backend login/register endpoints could optionally also verify the token server-side for defense-in-depth
- 🧠 Reflection: The fake checkbox was client-side only with no cryptographic token — any bot could set captcha_checked=true in memory. Real reCAPTCHA issues a signed token from Google's servers that is much harder to spoof.

## Evaluation notes (flywheel)

- Failure modes observed: fake checkbox provided zero bot protection
- Graders run and results: none
- Prompt variant: null
- Next experiment: null
