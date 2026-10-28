---
id: 496
title: Live database has no backups on Railway Hobby
stage: general
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Screenshot of Railway Postgres Backups tab ("Upgrade to Pro to create new backups ... No Backups") with "?????"
labels: ["backups", "railway", "postgres", "security", "ops"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/496-railway-no-backups-hobby-plan.general.prompt.md
tests:
 - none
---

## Prompt

?????

(screenshot: Railway project successful-achievement / production, Postgres service, Backups tab: "You can view, restore, and delete existing backups. Upgrade to Pro to create new backups, set up automated schedules, or enable point-in-time recovery." / "No Backups. This service's volume does not have any backups." Banner: "Railway Recovery after October 21 Incident. A fix is out and we're monitoring it.")

## Response snapshot

- Meaning: the live database has never been backed up; the account is on Hobby, where Railway makes no backups at all. Losing the volume would lose both brands' data for good.
- Step 1 (owner, today): upgrade to Pro ($20 a month with $20 of usage included, so the bill rises by less than that), then turn on Daily, Weekly and Monthly, Enable PITR, and take one manual backup.
- Step 2 (now, until then): owner saves DATABASE_PUBLIC_URL from Railway Postgres Variables into a file on this PC, never in chat; I take a full pg_dump into D:\db-backups (outside the repo) with a pg_dump that matches the server's version, and restore it into a throwaway local database to prove it is whole.
- Step 3 (after): nightly copy off Railway (official "Postgres S3 backups" template to Cloudflare R2), because Railway's own backups go with the volume or project.
- Checked here: no working Railway CLI on this PC; local Docker has pg_dump 16.15 (a newer server needs a newer image).

## Outcome

- ✅ Impact: the owner knows there are no backups and has the three steps in order.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: owner upgrades and/or saves the URL file; then the dump and restore drill.
- 🧠 Reflection: "is the database backed up" has to be answered by looking at the provider, not assumed from the move to a managed host.
