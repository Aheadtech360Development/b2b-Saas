---
id: 681
title: Buyer app for one brand
stage: general
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for a proper way to give Innterflow (not on Scale) the buyer app
labels: ["mobile-app", "scale-plan", "super-admin", "entitlements"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/tests/test_buyer_app.py (one test added)
tests:
 - backend test_buyer_app: 7 passed (a Wholesale brand with the switch On has the buyer app; without it, not; a Scale brand can have it removed)
---

## Prompt

Ek baat dhyan mein rakhein: app jab stores mein aayegi to Innterflow ke buyers app mein shop nahi kar sakenge, unhein website par bheja jayega. Agar Innterflow ko buyer app dena hai to use Scale plan par karna hoga, ya bata dein to super admin se sirf us brand ke liye on karne ka raasta dekh leta hun. Abhi koi farq nahi padta kyun ke app abhi stores mein nahi hai. hn ye proper kro na bhai

## Response snapshot

The way already exists: super admin, Brands, the brand, Features, "Buyer mobile app", On (Granted; Plan puts it back). It writes the brand's feature switch, which every buyer app check reads (the console's Buyer app page, the code lookup, the app's branding check). Added a test proving a Wholesale brand with the switch On gets the buyer app. Not switched on for Innterflow by me: that is a write to the live database, so the owner does it from the console (it shows in the brand's activity log).

## Outcome

- ✅ Impact: one brand can have the buyer app without Scale, from the console, no code change needed.
- 🧪 Tests: 7 backend.
- 📁 Files: one test.
- 🔁 Next prompts: owner switches it on for Innterflow.
- 🧠 Reflection: check the console for an existing switch before building one.
