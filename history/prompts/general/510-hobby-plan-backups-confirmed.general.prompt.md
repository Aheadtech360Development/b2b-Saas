---
id: 510
title: Is it certain Railway Hobby has no backups
stage: general
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: none
branch: retail-plan
user: Aheadtech360Development
command: Is it certain the Hobby plan has no backups?
labels: ["backups", "railway", "ops"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/510-hobby-plan-backups-confirmed.general.prompt.md
tests:
 - none
---

## Prompt

ye pakka hana ke hobby plan mei backups nh hoty?

## Response snapshot

- Yes, for Railway's own backups: the owner's Backups tab says "Upgrade to Pro to create new backups, set up automated schedules, or enable point-in-time recovery" and shows none; Railway support on its forum says Hobby's backup limit is zero and the create call is refused (forum, not the pricing docs).
- Not for backups we make ourselves: a pg_dump, or Railway's "Postgres S3 backups" template sending a nightly copy to Cloudflare R2, runs on Hobby. Pro adds one-click schedules, PITR and restore. Advice: Pro plus the off-site copy; check Usage, since five services likely already pass Hobby's $5.

## Outcome

- ✅ Impact: the owner can decide on the upgrade with the evidence.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: upgrade, or the self-made copy.
- 🧠 Reflection: the strongest evidence was already on the owner's own screen; the forum only confirms it.
