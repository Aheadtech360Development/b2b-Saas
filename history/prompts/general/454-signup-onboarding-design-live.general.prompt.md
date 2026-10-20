---
id: 454
title: Sign-up and onboarding design, marketing site live
stage: general
date: 2026-10-19
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Build the 12-screen sign-up and onboarding design with working functionality, take the other developer's marketing site live with its forms in our own database and its affiliate page on the partner program
labels: ["signup", "onboarding", "auth", "marketing-site", "partners", "leads", "two-factor"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/signup.py (email+password sign-up, /signup/check, 14-day trial, onboarding progress, default plan)
 - backend/app/services/onboarding.py, backend/app/api/v1/admin/onboarding.py (new)
 - backend/app/services/tenant_auth_service.py (profile read unscoped: owners can sign in on printcopilot.co)
 - backend/app/api/v1/two_factor.py (QR code, issuer)
 - backend/app/services/admin_home.py (Finish setting up step), connect_service.py + admin/connect.py (?back=onboarding, origin allow-list)
 - backend/app/api/v1/leads.py, backend/app/api/v1/platform/leads.py (new), contact.py (public + rate limit + kept)
 - backend/app/middleware/auth_middleware.py, core/permissions.py, core/tenant_settings.py, main.py
 - backend/app/models/wholesale.py, schemas/auth.py, schemas/wholesale.py, services/auth_service.py, services/wholesale_service.py
 - backend/migrations/versions/0064_signup_onboarding.py (trading_name, platform_leads), migrations/env.py
 - frontend/src/components/auth/AuthPage.tsx + auth-page.module.css (new), app/(auth)/* (all pages), lib/countries.ts, lib/passwordRule.ts, lib/pendingSignup.ts
 - frontend/src/app/onboarding/page.tsx, components/onboarding/* (new), services/onboarding.service.ts
 - frontend/src/app/(admin)/admin/settings/security/page.tsx, admin/dashboard/page.tsx
 - frontend/src/components/marketing/leads.ts, pages/Demo.tsx, pages/Partners.tsx; app/api/marketing/lead/route.ts deleted; .env.example
 - frontend/src/components/platform/LeadsTab.tsx (new), ConsoleBar.tsx, app/(platform)/platform/page.tsx
 - frontend/src/components/providers/BrandingProvider.tsx (icon links repointed, not removed; printcopilot.co keeps its own title and icon)
 - frontend/src/components/marketing/pages/Contact.tsx (hidden bot field)
tests:
 - backend tests/test_onboarding.py (13), tests/test_leads.py (6); backend unit suite 394 passed, 0 failed
 - frontend signin-design (11), signup-partner-code (5), onboarding-wizard (5), marketing-forms (3); full suite 61 files, 659 passed; tsc clean
 - local API walk (walk_signup.py): 29 checks, all pass (sign-up to finish, trial, Home, platform sign-in, 2FA, leads, wholesale)
 - browser walk (walk_pages.cjs, local): shop sign in/register/forgot/wholesale in the shop's look, owner sign-up to step 5, carrier dialog, Finish later to Home, two-step QR, affiliate form; found and fixed the sign-up to /onboarding crash (React removeChild of an icon link BrandingProvider had removed) and serif headings on buyer cards
 - review workflow (backend lens): contact form escaping/limits/bot field, platform mail escaping, /signup/check limit; all fixed and tested (test_leads 8)
---

## Prompt

acha saiha dekho abhi ghl mei kch nh chayie filhal bs jese db se sb connected ha wesa hi rhe saiha bhai ab dusra ek file lagai ha mene printcopilot sign and onboarding .html saiha ye dekho poora same wiring krna ha saiha onboarding ka process aur agar already onboarded ha to login ka saiha mere bhai same bnana ha with proper working functionality abhi bhi existing functionality same kam krrhi but design aur features thore kam proper dekhlo aur new home page jo duredev ne banya ha wo bhi live krdi acha usme na affiliates ka link hoga to yad kro mene partners ka wo bnawaya tha tumse poora kam to wo bhi connect krdena in short poora hamara platform connected ho saiha jaldi se kro aur dekho bs aj complete krna proper

(follow-up) continue plz aur ye zara dekhlena jo shru ke login signup apply for wholesale wagera hain na reset wagera wo brand based hain yani brand ke jo customers hongy wo unke forms hain saiha to ye dekhoena thora intelligent rehke kam krna saiha

## Response snapshot

- Owner sign-up is the design's: Work email + Password, then step 1 makes the shop (name, business type, country; address from the name). Already an owner: told to sign in. 14-day trial now starts at sign-up.
- Five setup steps on their own screen, saved as the owner goes, each row reading what the shop really has; Home asks to finish only for shops that started them.
- Buyer screens (sign in, register, reset, wholesale apply, received) wear the shop's logo, name and colour from the first paint; owner pages and buyer pages each stay on their own side.
- Two-step sign-in shows a QR and key, backup codes after.
- Marketing site: demo and contact in our database (console Leads), affiliate form is the partner program's application. GHL removed.
- Found and fixed: owners could not sign in on printcopilot.co; the contact form answered 401; "AF APPARELS" on the account-completion page; Stripe's return link would have gone to a new shop's not-yet-live address; moving between printcopilot.co pages could crash (the platform icon from the marketing commit, removed under React by BrandingProvider); the now-open contact form escapes and bounds what visitors type and no longer repeats it to the address given.

## Outcome

- ✅ Impact: the design's 12 screens work end to end locally; marketing site merged.
- 🧪 Tests: see above.
- 📁 Files: see above.
- 🔁 Next prompts: add each new shop's subdomain in Vercel (or automate it); the owner checks the screens live.
- 🧠 Reflection: a new shop's subdomain not answering decided where the owner works; checking it (DNS resolves, TLS fails) changed the hand-over from the subdomain to the same origin.
