---
id: 461
title: Platform wordmark on every header
stage: general
date: 2026-10-20
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Use the owner's wordmark files, off-white on navy grounds and navy on light ones, everywhere the platform names itself
labels: ["branding", "logo", "wordmark"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/public/wordmark-horizontal_color_600w.png (the owner's, now tracked)
 - frontend/src/components/shared/PlatformLogo.tsx
 - frontend/src/components/marketing/MarketingShell.tsx, marketing.module.css
 - frontend/src/components/layout/AdminSidebar.tsx, frontend/src/app/(admin)/admin-shell.css
 - frontend/src/components/platform/ConsoleBar.tsx
 - frontend/src/components/partners/PartnerShell.tsx, AuthFrame.tsx, ProgramPage.tsx
 - frontend/src/app/(partners)/partners/login/page.tsx
 - frontend/src/components/auth/AuthPage.tsx, frontend/src/components/onboarding/OnboardingFrame.tsx
 - backend/app/services/partners/mail.py, backend/tests/test_partner_mail_logo.py
 - frontend/src/__tests__/signin-design.test.tsx
tests:
 - tsc clean
---

## Prompt

(two screenshots of the owner's brand guide: wordmark-horizontal_color-on-dark.svg for the website header and footer, wordmark-horizontal_color.svg "Light backgrounds. Default." for the partner program page)
ye dekho mene na frontend ke andar public folder mei na dark navy krke aur offwhite krke logos daldie ahin saiha  ye lo ye use kro accrordingly jaha dark navy bg ha waha offwhite wala jaega aur baki jaga header wagera mei dark navy wala jaega saiha meri jan ye krdo dasti dasti meri jan footer wagera har jaga partnwers wagera super admin har jaga krdena accordingly consistently

choro abhi rk jao

(a screenshot of the folder: wordmark-horizontal_color_600w and wordmark-horizontal_color-on-dark_1200w)
daldie jani

## Response snapshot

- The first two files dropped in (darknavvvv.png, offwhite.png) were screenshots of the brand guide, caption included; asked for the real files, which the owner then added. The screenshots are left out of the commit.
- PlatformLogo now draws the wordmark: wordmark-horizontal_color-on-dark_1200w.png on navy, wordmark-horizontal_color_600w.png on light grounds.
- Navy: site header (135px wide on a phone) and footer, admin sidebar, Platform Console bar, partner sidebar ("PARTNERS" under it, the rail is narrow), partner sign-in left panel, onboarding bar. Light: platform sign-in/sign-up card, partner phone header, partner sign-in, partner program page, partner emails.

## Outcome

- ✅ Impact: one wordmark, chosen by the ground, on every platform header and footer.
- 🔁 Next prompts: the owner's look at it live.
- 🧠 Reflection: a brand guide's screenshot is not the asset; the caption named the file to ask for.
