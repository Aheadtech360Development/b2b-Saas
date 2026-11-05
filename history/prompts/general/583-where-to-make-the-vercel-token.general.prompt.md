---
id: 583
title: Where to make the Vercel token
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner sends the Vercel project's General settings, looking for the token
labels: ["vercel", "token", "domains"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/583-where-to-make-the-vercel-token.general.prompt.md
tests:
 - none (deploy of 73eee28 confirmed live before: website + Railway success, health ok)
---

## Prompt

(screenshot: vercel.com/aheadtech360developments-projects/b2b-saas/settings, Project Name b2b-saas) ???????

## Response snapshot

That is the project's settings; tokens live in the account's settings: vercel.com/account/tokens, or the name at the bottom left → Account Settings → Tokens; Create Token, name printcopilot domains, scope the aheadtech360developments-projects team, no expiration, copy it once, straight into Railway as VERCEL_TOKEN (never into the chat). The screen confirms VERCEL_PROJECT = b2b-saas and VERCEL_TEAM = aheadtech360developments-projects.

## Outcome

- ✅ Impact: the owner knows where the token is made.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: check once the Railway variables are in.
- 🧠 Reflection: none.
