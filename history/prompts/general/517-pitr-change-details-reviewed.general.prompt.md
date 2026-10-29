---
id: 517
title: PITR change details reviewed before deploy
stage: general
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: none
branch: retail-plan
user: Aheadtech360Development
command: Screenshot of Railway's "9 changes to apply" details (Postgres: Cluster Role root, WAL_ARCHIVE_* variables from Postgres-PITR) with "?????"
labels: ["backups", "railway", "ops", "pitr"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/517-pitr-change-details-reviewed.general.prompt.md
tests:
 - none
---

## Prompt

?????

(screenshot: "9 changes to apply"; "Postgres will be updated: 6 Variables, 1 Setting": Cluster Role -> root; WAL_ARCHIVE_BUCKET, _ENDPOINT, _KEY, _REGION, _SECRET... -> ${{Postgres-PITR.*}} references; WAL_ARCHIVE_PATH -> /pgbackrest; "Postgres will redeploy"; Deploy Changes)

## Response snapshot

- These are PITR's settings and nothing else: the archive's bucket, address, region and keys, all taken by reference from the new Postgres-PITR bucket (no key typed anywhere), the archive path for pgBackRest, and Postgres's cluster role. Only Postgres redeploys. Scroll the list once: the last two lines should be the Postgres-PITR bucket; if no other service appears, Deploy Changes. Then tell me for the outside health check.

## Outcome

- ✅ Impact: the owner deploys PITR having seen exactly what changes.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: deploy, health check.
- 🧠 Reflection: the keys are references to the bucket's own variables, so nothing secret passes through anyone's hands.
