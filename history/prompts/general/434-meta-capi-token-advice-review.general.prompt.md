---
id: 434
title: Meta CAPI token advice review
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Check whether the marketer's advice to store a Meta Conversions API token as META_CAPI_TOKEN for capi-server.js is right for this platform
labels: ["tracking", "meta-pixel", "conversions-api", "secrets", "multi-tenant"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/434-meta-capi-token-advice-review.general.prompt.md
tests:
 - none (code search only)
---

## Prompt

anas raza
6:18 PM
@Bilal sajjad

[REDACTED — Meta Conversions API access token; a secret, deliberately not recorded]

6:18
This is the Meta Conversions API access token for Pixel 1131707639791414. Please store it ONLY as a server environment variable named META_CAPI_TOKEN (in .env or the hosting settings). Do NOT put it in frontend code, JS files or git, and do not share it. capi-server.js reads it from there to send events from our server to Meta. ye kia bolrha ha marketor dekhna zara jani kia ye sai bolrha ha kia

(Note: the token in the original prompt is redacted here on purpose. Recording it would put a secret into git, which the project's rules forbid.)

## Response snapshot

The security advice is right: the token is a server-only secret, and it must stay out of frontend code and git.
But it does not fit this platform:
- There is no capi-server.js and no Conversions API code in the repo (searched for capi, Conversions API,
  graph.facebook.com and META_CAPI). Setting the env var alone does nothing.
- The platform is multi-brand. One META_CAPI_TOKEN env var would be platform-wide, but this is one brand's
  (innterflow) token. Per analytics_config.py, such secrets belong per brand in integrations_service as masked secrets.
- Building CAPI is possible. Browser Purchase already sends eventID = order number, so server events can be deduplicated.
- The token has been shared in Slack and in chat. Recommend generating a fresh one once the feature exists, and not
  pasting it in chat again.

## Outcome

- ✅ Impact: User knows the advice is half right and why env-var storage is wrong for multi-tenant
- 🧪 Tests: none
- 📁 Files: this PHR only (token redacted)
- 🔁 Next prompts: if approved, /sp.specify a per-brand Meta Conversions API connector
- 🧠 Reflection: Generic single-site guidance does not map onto a multi-tenant SaaS

## Evaluation notes (flywheel)

- Failure modes observed: a secret was pasted into chat
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
