---
id: 547
title: Retail in menu and partner link
stage: general
date: 2026-11-03
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner says Retail shows nowhere on printcopilot.co's menu and partners have no Retail link
labels: ["retail-launch", "marketing-site", "partners", "launch-switch"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/retailNav.ts
 - frontend/src/components/marketing/MarketingShell.tsx
 - frontend/src/components/marketing/MobileNav.tsx
 - frontend/src/app/(customer)/retail/page.tsx
 - frontend/src/app/(partners)/partners/(portal)/link/page.tsx
 - frontend/src/app/(partners)/partners/(portal)/dashboard/page.tsx
 - frontend/src/__tests__/retail-site.test.tsx
 - frontend/src/__tests__/partner-retail-link.test.tsx
 - history/prompts/general/547-retail-in-menu-and-partner-link.general.prompt.md
tests:
 - vitest retail-site (9, 2 new), partner-retail-link (3 new), signup-partner-code, partner-program-settings: 23 passed
 - tsc --noEmit: no errors in src
---

## Prompt

bhai sb se pehle ye bat suno meri jan retail ka kam kraya tha mene yad hana ? affiliates mei retail ka link nh aya aur na hi printcopilot ke menu mei retail ka kch show horha ha to plz dekho isey bhai mere jaldi se yar bhai jan

## Response snapshot

Cause: every Retail page change sits behind NEXT_PUBLIC_RETAIL_LAUNCH (lib/retailLaunch), unset on live by design (spec T605: held for the manager), and the Retail plan is `public: False` in billing_plans; live /retail answers 404 and Pricing has no Retail tab. Two gaps even with the switch on: the header menu (and the design's) had no Retail item, and the partner portal offered only the home link `/?ref=CODE`. Built behind the switch: Retail beside Pricing in the header, phone menu and footer (`lib/retailNav.withRetail`; /retail marks it current), and a "Retail brands link" (`/retail?ref=CODE`, campaign tag included) on the partner Link page and Dashboard (`retailLinkOf`). Nothing changes live until the launch. Launch steps: manager's yes, NEXT_PUBLIC_RETAIL_LAUNCH=1 in Vercel (Production), then a push with Retail `public: True` builds the site with the switch on. Committed locally, not pushed.

## Outcome

- ✅ Impact: when Retail launches, it is in the menu and partners have a Retail link.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's go (manager's yes), the Vercel env var, then the push with `public: True`.
- 🧠 Reflection: a launch switch hid the whole feature, so "not showing" was the switch; the real gaps were the menu and the partner link.
