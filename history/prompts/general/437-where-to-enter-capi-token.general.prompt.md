---
id: 437
title: Where to enter CAPI token
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Explain where in the admin a brand enters its Meta Conversions API token
labels: ["tracking", "conversions-api", "admin-ui", "how-to"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/437-where-to-enter-capi-token.general.prompt.md
tests:
 - none
---

## Prompt

ye token dalunga kaha pe jake admin side se?

## Response snapshot

Admin sidebar → Settings → Tracking & Analytics (/admin/settings/tracking). First make sure the Meta Pixel ID is
on and saved. Then scroll down to "Server-side tracking" → Meta Conversions API → Connect. Paste the access token,
optionally add the Test event code, click "Test only" and then "Test & connect"; the card then shows Connected.
This only appears after the branch is deployed. Use a freshly generated token.

## Outcome

- ✅ Impact: Exact click path given
- 🧪 Tests: none
- 📁 Files: this PHR only
- 🔁 Next prompts: help read a failed Test message, if any
- 🧠 Reflection: Button labels taken from IntegrationsPanel.tsx and AdminSidebar.tsx, not guessed

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
