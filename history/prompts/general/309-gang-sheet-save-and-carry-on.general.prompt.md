---
id: 309
title: Gang sheet save and carry on
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: Save in the gang sheet builder should just save — not jump to a dashboard — and coming back should carry on from where the work was left, like the competitor
labels: ["gang-sheet", "save", "draft", "ux"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/storefront/GangSheetStudio.tsx (draft kept in the browser and carried on; Start fresh; a locked reopened job saved as a new one; Save's wording)
 - frontend/src/app/(customer)/gang-sheets/page.tsx (Save no longer leaves the builder)
 - frontend/src/__tests__/gang-sheet-studio.test.tsx (four new)
tests:
 - frontend vitest: gang-sheet-studio 22/22; tsc: no new errors
---

## Prompt

With a picture of the DTF Studio, empty — "0 images":

bhai ye jo uper sirf save ka button hana mere bhai ye ajeeb behave krrha save hone ke bad ajeeb dashboard pe leke jarha ha aur na hi save hua bhai ye to acha behaviour nh ha bhai sirf save dabaein to ye save hojae proper kuke mera jo competiror hana waha agasr kch bnake ham chorty ain na to agli bar whi se continue hota ha jani asa nh kro yar proper isko dekho yar meri jan

## Response snapshot

Two things were behind it. Save did save — each sheet as a job under My Print Jobs — and then sent the buyer to that list (`/account/gang-sheets?saved=1`), which read as being thrown out of the builder. And opening the builder again always began with an empty sheet: nothing of the last visit came back unless it was opened from My Print Jobs.

- **Save stays put.** It saves to the account and the buyer carries on in the builder; a line says it is also under My Print Jobs, ready for checkout.
- **Carry on next time.** The work in progress — every sheet, its size, quantity and length, the designs on it, the uploads, the margin — is kept in the browser half a second after each change, whether or not the buyer has an account or has pressed Save. Opening the builder for that product again opens onto it, with "Carried on from where you left off" and a **Start fresh** button (asked first; uploads stay). Kept work older than 30 days is not brought back. A sheet reopened from My Print Jobs is never covered by it.
- **Into the cart, done.** After Save & Add to Cart the kept work is cleared, so the next visit starts fresh.
- **A job that moved on.** A carried-on sheet whose job has since gone to the print team (or is gone) is saved as a new job instead of failing.

## Outcome

- ✅ Impact: nothing built is lost by closing the builder; Save no longer takes anyone anywhere.
- 🧪 Tests: as listed.
- 📁 Files: as listed. No backend change.
- 🔁 Next prompts: none.
- 🧠 Reflection: "it didn't save" was "it saved and then left" plus "it doesn't come back" — both read as lost work.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): all PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): the same carry-on for Upload by size.
