---
id: 693
title: Railway database usage
stage: general
date: 2026-11-20
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Manager asks why the Railway Postgres costs $10-12 and uses so much; owner wants only this looked at
labels: ["railway", "database", "cost", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (look only)
tests:
 - none; no access to the live DB or Railway metrics (Railway CLI broken on this PC, local .env points at the local DB, .env.railway-backup is the old Neon DB)
---

## Prompt

abhi sirf ye batao railway database ka baki kch n chayie kuke mera manager kehra ye database itna zida volume ku khara ha to abhi ye dekhna ha mene pehle jani

(Earlier in the same turn, now set aside by the owner: loyalty / gift cards / returns end-to-end check; splitting the frontend into its own repo; "railway usage mein sirf 10 12 $ database ke hain, justified hai ya bug".)

## Response snapshot

From the code: nothing hammers the database. 2 web workers with a pool of 8 (+4) connections each, timed jobs at 2 min to 1 hour doing small queries, one row per storefront visit. A Postgres that runs all month is billed for the memory it holds most of all, then disk, backups and PITR. The one thing that can be a real fault: PITR (on since 2026-10-29) keeps WAL files on the volume until they are archived; if archiving fails they pile up and the volume keeps growing. Also the old Celery services may still be running. Gave the owner the screens to look at (Postgres → Metrics, Backups, Usage) and two read-only SQL queries (database size, WAL size, archive failures, connections, biggest tables) to paste in Postgres → Data.

## Outcome

- ✅ Impact: owner can tell normal cost from a fault with one screenshot and one query.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: the owner's Metrics screenshot and query results; then a fix if WAL is piling up.
- 🧠 Reflection: no live DB access from this PC; ask for numbers instead of guessing.
