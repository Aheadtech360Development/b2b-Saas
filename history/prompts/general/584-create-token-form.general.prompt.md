---
id: 584
title: Create token form
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner sends Vercel's Create Token form (name, scope, expiration)
labels: ["vercel", "token", "domains", "railway"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/584-create-token-form.general.prompt.md
tests:
 - none
---

## Prompt

(screenshot: vercel.com/account/settings/tokens, Create Token: Token name, Scope, Expiration, Create) ?????

## Response snapshot

Fill the form: name printcopilot domains; scope the aheadtech360developments-projects team (not the whole account); expiration No Expiration (or the longest offered, renew before it ends or domains stop being added); Create; copy the token shown once straight into Railway → backend → Variables as VERCEL_TOKEN with VERCEL_PROJECT=b2b-saas and VERCEL_TEAM=aheadtech360developments-projects; never into the chat.

## Outcome

- ✅ Impact: the owner can finish the setup.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: check after the Railway redeploy.
- 🧠 Reflection: none.
