---
id: 438
title: Which token goes in the field
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Confirm that the marketer's Conversions API token is the one to paste into the new admin field
labels: ["tracking", "conversions-api", "secrets", "how-to"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/438-which-token-goes-in-the-field.general.prompt.md
tests:
 - none
---

## Prompt

[REDACTED — Meta Conversions API access token; a secret, deliberately not recorded]

6:18
This is the Meta Conversions API access token for Pixel 1131707639791414. Please store it ONLY as a server environment variable named META_CAPI_TOKEN (in .env or the hosting settings). Do NOT put it in frontend code, JS files or git, and do not share it. capi-server.js reads it from there to send events from our server to Meta. aby is token ki bat krrha hn bhai mere

(Note: the token is redacted here on purpose; recording it would put a secret into git.)

## Response snapshot

Yes, this is the right kind of token, and it is for the same pixel (1131707639791414) that is saved on the Tracking
page. Paste it into Settings → Tracking & Analytics → Server-side tracking → Meta Conversions API → Access token,
not into .env or META_CAPI_TOKEN. Strongly recommend regenerating it first, because it has now been shared in Slack
and twice in chat. It does nothing until the branch is deployed.

## Outcome

- ✅ Impact: User knows exactly where this token goes and why not the env var
- 🧪 Tests: none
- 📁 Files: this PHR only (token redacted)
- 🔁 Next prompts: read the result of "Test only" after deploy
- 🧠 Reflection: Keep secrets out of records even when the user pastes them repeatedly

## Evaluation notes (flywheel)

- Failure modes observed: secret pasted into chat again
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
