---
id: 662
title: Marketing site review items
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner pastes a list of fixes for printcopilot.co (logo strip, team section, contact address/email/hours, affiliate page) and asks whether all are done
labels: ["marketing-site", "contact", "affiliate"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/marketing/pages/Contact.tsx
 - frontend/src/components/marketing/pages/Partners.tsx
 - frontend/src/__tests__/marketing-forms.test.tsx
tests:
 - vitest marketing-forms (3 new) and plan-prices: 18 passed
 - tsc --noEmit: clean
 - live read-only: printcopilot.co Home, About, Contact, Affiliate pages checked for each item
---

## Prompt

Home, logo strip. Remove it. Bring it back only with real customers who have agreed to show their logo.
About, team section. Replace the placeholders with real people the owner approves, or remove the section until then.
Contact, address. Use: AheadTech360 LLC, 30 N Gould St, Ste N, Sheridan, WY 82801, USA.
Contact, email. Use: support@printcopilot.co.
Contact, hours. Use: Monday to Friday, 9am to 5pm US Eastern Time.
Affiliate page. Remove the "Coming Soon" label and the "Loading the program..." form text. Either make the application form work, or hide the form.

 ye dekhlo ye sb krdia hana tumne jani

## Response snapshot

Checked the code and the live site. Already done on 2026-11-02 (20ae683): Home logo box removed, About team section removed, Contact email support@printcopilot.co. Not done: Contact had no address or hours (the placeholder box was removed, not filled), and the Affiliate page served "Coming Soon" and "Loading the program…" until the program answered in the browser. Fixed: Contact gets an Address card (AheadTech360 LLC, 30 N Gould St, Ste N, Sheridan, WY 82801, USA) and the hours under Support (Monday to Friday, 9am to 5pm US Eastern Time). Affiliate: the program is live and taking applications, so the form shows from the first paint; the hero button is "Apply to join" and is left out only when the program says applications are closed; the form can be sent once the terms arrive and are accepted; if the program cannot be read the form says to refresh or email support. Committed locally, waiting for the owner's yes to push.

## Outcome

- ✅ Impact: every item on the list is done once pushed.
- 🧪 Tests: 18 vitest passed, tsc clean.
- 📁 Files: Contact.tsx, Partners.tsx, marketing-forms.test.tsx.
- 🔁 Next prompts: owner's yes to push.
- 🧠 Reflection: a client-side "loading" state is what crawlers and screenshots see; default to the working state.
