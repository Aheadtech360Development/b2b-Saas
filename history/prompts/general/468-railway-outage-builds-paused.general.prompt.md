---
id: 468
title: Railway outage, builds paused on their side
stage: general
date: 2026-10-21
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Owner's Railway screenshot ("Limited Access, deploys have been paused temporarily")
labels: ["deploy", "railway", "outage"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - status.railway.com: Major Outage "Dashboard and API unavailable, builds paused" (QH8L8B3E), started 2026-10-21 07:24 UTC, latest 13:40 UTC "no change", no fix time
---

## Prompt

(screenshot: Railway, service b2b-Saas, banner "Dashboard and API unavailable, builds paused. We've found the cause and are working on a fix.", Deployments: "Limited Access, Deploys have been paused temporarily", active deployment 8723f26 "1 day ago via GitHub") ?????

## Response snapshot

- The block is Railway's own outage, for every customer: builds paused since 12:24 PM today (07:24 UTC), no fix time yet. Nothing on our side or in the owner's settings; the server stays online on the Oct 20 code, so the client's store and every brand keep working.
- When Railway's yellow banner is gone: Ctrl+K → Deploy Latest Commit (Railway never registered these pushes, so it may not deploy them by itself). The watcher keeps checking; then the console and Innterflow are checked.
- Offered once: the old super admin back on the website until Railway returns, only if it is needed today.

## Outcome

- ✅ Impact: the owner knows the wait is Railway's and what to do when it ends.
- 🔁 Next prompts: Railway back, deploy, console and Innterflow checked.
- 🧠 Reflection: check the host's status page early when a deploy never starts.
