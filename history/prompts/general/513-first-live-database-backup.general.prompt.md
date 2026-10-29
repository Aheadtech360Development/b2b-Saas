---
id: 513
title: First backup of the live database made
stage: general
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: none
branch: retail-plan
user: Aheadtech360Development
command: Screenshot of the Backups tab with the first volume backup (2026-10-29 17:05, 386 MB) and "?????"
labels: ["backups", "railway", "ops"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/513-first-live-database-backup.general.prompt.md
tests:
 - none
---

## Prompt

?????

(screenshot: Postgres -> Backups: volume backup "2026-10-29 17:05", 386 MB, with Restore; still "No backup schedule"; PITR off)

## Response snapshot

- The live database's first backup exists (386 MB, 17:05). Never press Restore unless the database must be put back: it replaces the live database with that copy and removes newer backups. Next: Edit schedule (Daily, Weekly, Monthly, save), then Enable PITR (one restart of about a minute), then tell me so I check the live server's health from outside.

## Outcome

- ✅ Impact: the live database has a backup for the first time.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: schedule saved and PITR on; health check.
- 🧠 Reflection: the Restore button sits beside the new backup; naming what it does keeps it from being pressed to "check" the backup.
