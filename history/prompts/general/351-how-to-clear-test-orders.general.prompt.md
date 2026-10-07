---
id: 351
title: How to clear test orders
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: how do I delete the orders
labels: ["platform-console", "test-data", "how-to"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - none
---

## Prompt

aby delete kese krun orders

## Response snapshot

The steps, short: in the super admin, open the brand's Manage box (the one with the commission setting), scroll down to the yellow "Clear the test data" box, type the brand's address exactly as the box shows it in bold, press "Clear test data". A hard refresh first, so the new box is there. It removes all of that brand's orders at once, not chosen ones, and cannot be undone. Test users are deleted after that, from the shop's Users page.

## Outcome

- ✅ Impact: the owner knows where the button is.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: none.
- 🧠 Reflection: the first answer had the steps under three headings and a lot else; asked again, they are four lines.

## Evaluation notes (flywheel)

- Failure modes observed: the steps were given once already, inside a long reply, and were not found.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
