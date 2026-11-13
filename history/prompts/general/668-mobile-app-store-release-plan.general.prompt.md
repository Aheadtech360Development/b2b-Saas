---
id: 668
title: Mobile app store release plan
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks how the mobile app goes live (the structure for publishing it)
labels: ["mobile", "app-store", "play-store", "release"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - none (read: mobile/ has no icon or splash assets and no eas.json; the backend has no buyer self-delete route)
---

## Prompt

ab ye app live krni ha to kia structure ha iska

## Response snapshot

Recommended one platform app, "PrintCoPilot", in both stores (buyers of any brand sign in to their own shop, owners get the console), with per-brand white-label apps later as a separate product under each brand's own developer account. Owner side: Apple Developer Program and Google Play Console as an organisation (AheadTech360 LLC, D-U-N-S number; a Play organisation account skips the 12-tester, 14-day closed test that new personal accounts need), an Expo account for EAS builds. Code side before submitting: app icon and splash, in-app account deletion with a backend route (App Store guideline 5.1.1(v), since the app creates accounts through Apply), EAS setup (eas.json, version 1.0.0, iPhone-only at first so no iPad screenshots), over-the-air updates for JS fixes, and the manager's call on limiting the app to the Scale plan. Store material: screenshots, description, category, privacy policy and support links, privacy and data-safety answers, and demo buyer and owner logins for reviewers. Physical goods are paid through Stripe, not Apple's or Google's in-app purchase. Then eas build, eas submit, review, live.

## Outcome

- ✅ Impact: the owner has the release path and the list of what each side does.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: go-ahead to build account deletion, icon and splash (logo files needed), EAS setup.
- 🧠 Reflection: none.
