---
id: 352
title: User delete refused by the activity log
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: deleting a user now shows "Something went wrong on our side" — find out why and fix it
labels: ["users", "audit-log", "migration", "database-trigger", "debugging"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0059_audit_user_unlink.py (new — the activity log's trigger lets the link to a deleted account empty, and nothing else)
 - backend/app/api/v1/admin/users.py (a refusal by the database of any other kind is said and logged, not a bare 500)
 - backend/tests/test_user_delete.py (new, 14 checks against a real database)
tests:
 - local test database only — reproduced first at 0058 through the real app — a buyer who signed up the way a shop's customer does could not be deleted; the database's own message was "audit_log is append-only"
 - then with 0059 applied locally — tests/test_user_delete.py 14 passed; the migration taken back and put on again
 - NOT done — nothing was deleted on the live shop by me
---

## Prompt

With a picture of the Users page's "Delete User" box on cj bravo, now showing a red line: "Something went wrong on our side."

user delete krne pr ye arha ha bhai mere

## Response snapshot

**Why.** The line in red is the server's catch-all for an error nobody handled, so the reason was not one of the ones written for yesterday. Reproduced on the local database through the real app: a buyer signs up, the admin deletes them, the database refuses with "audit_log is append-only".

The activity log is append-only by a database rule (migration 0043): every change to an entry is refused. But each entry points at the account that acted, and deleting an account is meant to empty that link while the entry keeps the person's name. Emptying the link is a change to the entry, so the rule refused it, and the delete went with it. A sign-in is written to the log, so since 0043 nobody who had ever signed in could be deleted — every user on the page.

**Fix.** A migration (0059) teaches the rule the one change it should always have let through: the link to a deleted account going empty, with every other column of the entry untouched. Everything else is still refused — rewriting an entry, deleting one, emptying the link while changing anything, pointing an entry at somebody else. No entry is lost or altered: what was done, when, from where and by whom (by name) stays.

And if the database ever refuses a delete for a reason of its own again, the box now says so and the server logs it in full.

## Outcome

- ✅ Impact: a shop's admin can delete a person; the activity log stays evidence.
- 🧪 Tests: as listed.
- 📁 Files: as listed. One migration, a function replaced; no data changed; reversible.
- 🔁 Next prompts: delete the test users once the deploy shows schema 0059.
- 🧠 Reflection: yesterday's fix handled every reason I could read in the models, and the real one was not in the models at all — it was a trigger in a migration. One run against a real database found it in a minute; reading had not, and could not. A delete has to be tried, not reasoned about.

## Evaluation notes (flywheel)

- Failure modes observed: shipped a fix for a refusal without ever seeing the refusal; the first local run was skipped to save time and cost a round with the owner.
- Graders run and results (PASS/FAIL): PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): have /health or the console show which migration the server is on next to the build, so "is the fix live" has one answer.
