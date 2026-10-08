---
id: 359
title: Phone pinch, upload screens, moving announcement
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: on a phone — make the builder's top bars smaller, let the sheet be zoomed and moved with fingers, fix the two upload builders, and make the website's announcement bar move like a marquee by default
labels: ["gang-sheet-builder", "mobile", "touch", "upload-by-size", "image-editor", "website-builder", "announcement-bar"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/storefront/GangSheetStudio.tsx (smaller bars; pinch and slide on the sheet; a drag follows one finger; no page zoom while it is open; Fit measured against the room there is; bigger touch areas for the corner dots; banners edge to edge)
 - frontend/src/components/storefront/UploadBySizeModal.tsx, UploadOwnSheetModal.tsx, ImageEditorModal.tsx (a phone layout each, as overrides in one media query)
 - frontend/src/components/storefront/AutoBuildPanel.tsx (a card no wider than a small phone)
 - frontend/src/components/builder/render.tsx, frontend/src/lib/builder/baseCss.ts, registry.ts (the announcement bar moves on a phone; two settings in the editor)
 - frontend/src/__tests__/builder-announcement.test.tsx (new, 5), gang-sheet-studio.test.tsx (3 added)
tests:
 - vitest — builder-announcement 5, gang-sheet-studio 25 (3 new), studio-assistant 29, and the six website-builder files that read the stylesheet and the registry 117 — all pass
 - tsc — no error in anything touched; the same 2 old errors in src/__tests__/api-client.test.ts
 - a real browser engine with touch (the website alone on this machine, its API answered by the script), 390x844 — a two-finger pinch took the sheet from 100% to 400% with the point between the fingers not moving a pixel; one finger slid the view and moved no design; Fit went back to exactly the opening view; one finger on a design moved it; a second finger landing mid-drag put the design back and zoomed instead; the page itself stayed at 100% and no wider than the screen
 - the same, looked at — the builder at 390 and 360 wide and at 1366 (bars 54 and 46px there as before, 44 and 76px on a phone, were 52 and about 100); Upload by size, Upload your own sheet and the image editor at 390, 360 and 1366; the announcement bar at 390 (moving, one line, 38px where it stood 75px) and 1366 (still), and standing still for a browser set to less motion
 - NOT done — nothing was tried on a real phone; no `next build` was run locally
---

## Prompt

zabardast perfect bhut acha dikhra ha ab mobile pe jani zabardast hogya ek bs thori si changes aur krni hain jo top bar hana gang sheet ka mobile pe jaha est price add to cart button aur sheet sizes aur auto nest button wo bhut bare arhy hain unhein thorachota krke aur jo canvas hana mobile pr usko zoom in zoom out krne ki capacity fingers se aur scroll wagera krne ki capacity bhi do jani matlab poora proper ho koi shikayat na rhe users ko kuke mobile pr hi sb ake har cheez krty smjhe aur isi ke sath upload by size ka bhi ek builder ha saiha bhai aur ek aur ha upload a ready made gang sheet ye 2 buildeds aur hain ye bhi mobile pe bhut bekar arhy hain icons wagera cutt off hoty bhut hi bekar to plz inhein bhi dekho yar meri jan aur bs last ek cheez jo announcement bar hana usko by default mobile jo website ka announcemtn bar ha usko mobile pr left tpo right contant moving direction mei krwado bs marquee jese mve horha hota na contant text move horha hota jani bs ye krdo saiha proper ek hi go mei

## Response snapshot

**The builder on a phone.**

- The two bars above the sheet are smaller: 44px and 76px, where they were 52 and about 100. The price, Add to Cart, the sheet size and Auto Nest are each a size down.
- Two fingers zoom the sheet about the point between them and carry it along. One finger on the table or an empty part of the sheet slides the view. A finger on a design still moves that design.
- A second finger landing while a design is being dragged puts the design back where it was and zooms instead. Before, the drag followed every finger on the screen.
- The page itself does not zoom while the builder is open: not under a pinch on a bar, and not when a field with small type is tapped (an iPhone zooms in on those and stays there).
- Fit goes back to exactly the opening view. It was measured against the wrong margin and left the sheet a few pixels wider than the canvas.
- The corner dots and the turn handle answer to a touch around them (38px, the dot itself is 12). No scrollbars under a finger.
- "Images are overlapping" is two lines across the canvas, where it stood six lines tall over the sheet.

**Upload by size.** Side by side, the settings took the whole width and the design was left none: it could not be seen. Under 760px it is one column on the whole screen (the design, its tools, its size, its price), with the total and the button always at the bottom.

**Upload your own sheet.** The whole screen; the five tools in one row; the price and the button always at the bottom.

**The image editor** (opened from both). The tabs and the controls took 338 of a phone's 374 pixels and left the picture 36. Now: tabs in a row, the picture, the controls under it, the two buttons.

All three fill the screen rather than a share of "vh", which on a phone counts the part under the browser's own bar: that is where the buttons were cut off. Fields are 16px so an iPhone does not zoom in on them.

**The announcement bar.** On a phone it is one line and moves, left to right, without a seam. It is the default: a bar already on a site gets it with nothing to set. In the editor the bar has two new settings: Moving text (On a phone / On every screen / Off) and which way it moves. A browser set to less motion gets the message standing still, as before.

## Outcome

- ✅ Impact: the sheet can be worked on with fingers; the two upload builders and the editor can be used on a phone; a long announcement no longer takes four or five lines of a phone's screen.
- 🧪 Tests: as listed.
- 📁 Files: as listed. No migration, nothing on the server.
- 🔁 Next prompts: try all of it on a real phone, an iPhone above all; the old (non-builder) header's announcement bar is unchanged; Auto Build's own panel was only given a narrower card.
- 🧠 Reflection: the test tool lost the first tap after a fast slide, and it looked like the new touch code. A bare box with none of the builder's code lost it as often (5 of 8), so it was the tool. Worth the control before changing the code to chase it.

## Evaluation notes (flywheel)

- Failure modes observed: an existing drag followed every pointer on the screen; a filter by pointer id would have broken two tests that send events with no id at all, so an event with no id is taken as nobody else's; the test tool's own lost tap (above).
- Graders run and results (PASS/FAIL): as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): the same moving bar for the old header, if any shop still on it asks.
