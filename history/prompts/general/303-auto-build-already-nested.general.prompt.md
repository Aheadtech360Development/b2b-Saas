---
id: 303
title: Auto Build already nested
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: Auto Build (standard or cutting) should come out already nested, so Auto Nest afterwards changes nothing — and the designs should arrive one by one with a transition
labels: ["gang-sheet", "auto-build", "auto-nest", "animation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/storefront/GangSheetStudio.tsx (Auto Build plans with planNest / planRows; designs arrive one by one; Auto Nest on a settled sheet says so; Auto Nest's move is staggered)
 - frontend/src/lib/sheetNesting.ts (equal designs ordered by number, so a second nest plans the same)
 - frontend/src/__tests__/sheet-nesting.test.ts
tests:
 - frontend vitest: sheet-nesting + gang-sheet-studio 42/42 (two new: the second plan equals the first, tight and rows); tsc: no new errors
---

## Prompt

With two pictures of the DTF studio: after Auto Build, thirteen T-shirt designs as a row of six and a column down the left side; after pressing Auto Nest, two neat rows of seven and six.

ek issue smjh arha ha ab mjhy zara na gang sheet builder mei mere na jo meri jan jb mei auto build mei click krta aur auto nest for standard kra to dekho ese agye aur ab mei auto nest krunga na  ab blkl perfect hain to dekho mei ye chahta hn ke auto nest for cutting aur auto nest for standard auto matically nest hi krke lagae bar bar manually hamein auto nest na krna pare auto nest us condfition mei acha ha jb bnda manually drag krke lagara ha saiha is tarah acha experice nh ha meri jan aur auto nest for standard ya auto nest for cutting mei bhi design jb add ho achi transition animation ke sath ek ek krke achy aein saiha plz ye dekho jan plz ye dekho kuke mene apne competitor ka chalaya na abhi usme na abhi proper auto nest ki zaroorat nh pari auto nest for cutting ya standard kra na already nested cheez hi ai aur mene bad mei auto nest dabaya na to kuch change nh aya mjy bhi esa chayie saiha smjh gye na jani

## Response snapshot

The cause: Auto Build had a packer of its own (`sheetPacking.packIntoSheets`), apart from the one Auto Nest uses (`sheetNesting.planNest` / `planRows`). Two packers, two shapes — so a built sheet was always rearranged by Auto Nest.

- **Auto Build now plans with Auto Nest's own rules**: "standard" is Auto Nest's tight packing, "cutting" is Auto nest for cutting's rows, with the panel's margin and edge. A built sheet is the nested sheet.
- **Auto Nest on a sheet that is already nested** moves nothing and says "Already nested — nothing needed to move." (or "Already in rows for cutting…").
- **The same answer every time**: equal-size designs were ordered by their keys as text, so placement 100 came before 99 and a second nest could swap two designs. They are ordered by number now. Tested: planning a nested sheet again gives the same spot for every design, for both arrangements.
- **One by one**: after Auto Build the designs land one after another in the order they were packed; when Auto Nest does move things, they travel to their new places one after another instead of all in one frame.

## Outcome

- ✅ Impact: Build gives the finished layout; Auto Nest is for sheets arranged by hand.
- 🧪 Tests: as listed; no browser run.
- 📁 Files: as listed. The old packer is still used for the Auto Build panel's layout type only.
- 🔁 Next prompts: try Auto Build on the live studio, standard and cutting.
- 🧠 Reflection: two features that both "arrange a sheet" must share one planner, or they will disagree.

## Evaluation notes (flywheel)

- Failure modes observed: text ordering of numeric keys made a second plan differ from the first.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a margin set in Auto Build wider than the sheet's own edge is still forgotten by a later Auto Nest.
