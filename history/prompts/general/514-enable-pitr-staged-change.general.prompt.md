---
id: 514
title: Enabling PITR, a staged change to deploy
stage: general
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: none
branch: retail-plan
user: Aheadtech360Development
command: Screenshot of Railway's "Enable point-in-time recovery" dialog (backup schedule set, next backup in 7 hours) with "?????"
labels: ["backups", "railway", "ops", "pitr"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/514-enable-pitr-staged-change.general.prompt.md
tests:
 - none
---

## Prompt

?????

(screenshot: "Enable point-in-time recovery. Railway will turn on WAL archiving and create a bucket to store the archives. Your service redeploys once, and only when you deploy the staged change." Behind it: "Next backup in 7 hours", the 17:05 backup)

## Response snapshot

- The schedule took ("Next backup in 7 hours"). Press Enable PITR; Railway then stages the change, and nothing happens until the staged change is deployed from the bar at the top. Before deploying, check the list holds only the Postgres / PITR change: anything else staged (variables, other services) would go live with it, so stop and send a screenshot. Deploying restarts the database once, about a minute; then tell me for the outside health check.

## Outcome

- ✅ Impact: PITR can be switched on without carrying another staged change live by accident.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: deploy done; health check.
- 🧠 Reflection: "staged" means a second click elsewhere; say where it is and what else could ride along.
