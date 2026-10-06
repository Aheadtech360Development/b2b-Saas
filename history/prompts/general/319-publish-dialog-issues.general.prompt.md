---
id: 319
title: Publish dialog issues explained and eased
stage: green
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: why does Publish show these issues — look into it
labels: ["visual-builder", "publish", "custom-html", "css-sanitizer", "links"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/builder/sanitize.py (more CSS properties allowed; @supports and @container kept, scoped like @media)
 - frontend/src/lib/builder/sanitize.ts (the same list and at-rules, so the editor shows what goes live)
 - backend/app/services/builder/schema.py (the link refusal names the address and how to write it)
 - backend/tests/test_builder_schema.py, frontend/src/__tests__/builder-site.test.tsx
tests:
 - backend builder schema 79/79 (15 new), builder security 35/35, builder integration 158/159 (the 1 failure is the same one as before these changes)
 - frontend builder tests 215/215; tsc: no new errors
---

## Prompt

With a screenshot of the builder's Publish dialog on innterflow.printcopilot.co: "Must fix (1)" — Links and images must be a web address or a path on this shop — and "Worth a look (60)", every one "Some of this CSS is not allowed and will be left out:" followed by lists such as -webkit-font-smoothing, align-content, box-sizing, clip-path, container-type, cursor, outline, outline-offset, @supports (font-size: 1cqw), fill, stroke, -webkit-tap-highlight-color, content, border-collapse, border-spacing, clip, clamp(124px, 35.3cqw, 200px).

ye mene jese hi publish kia na ye ku issues arhy hain zara dekho yar [the dialog's full list of issues]

## Response snapshot

The one blocking issue: a link or picture somewhere in the draft (a button, link, image, logo, banner or announcement) has an address that is neither https://…, http://…, /a-path, #anchor, mailto: nor tel: — typically "www.…" or a path without its leading "/". "Show me" selects it; the message now quotes the address and says how to write it.

The 60 warnings are not blocking: they are the Custom HTML blocks' CSS, run through an allowlist of properties that was too narrow for designs pasted from elsewhere. Widened (box-sizing, cursor, outline*, font smoothing, align-content and the other grid/flex alignment properties, clip-path, clip, container*, table borders, content and counters, SVG fill/stroke, text-overflow and friends, background-clip for gradient text, backdrop-filter, transitions' longhands, and so on), with the old rules unchanged: url() only https, never position fixed or sticky, any script drops the stylesheet. @supports and @container are now kept and scoped like @media. Front and back lists are identical.

Publishing now is safe: CSS is cleaned when each page is served, so a site published before this deploys gets the wider list as soon as it does.

## Outcome

- ✅ Impact: the warnings go away for what a design is made of; the blocking link says which address it is.
- 🧪 Tests: see above.
- 📁 Files: see above.
- 🔁 Next prompts: fix the one link via Show me, publish; go-ahead to push to main.
- 🧠 Reflection: one item, "clamp(124px, 35.3cqw, 200px)", is a declaration the cleaner could not read as property: value; not reproduced without the block's CSS.

## Evaluation notes (flywheel)

- Failure modes observed: an allowlist sized for hand-made blocks, not for pasted designs.
- Graders run and results (PASS/FAIL): PASS.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
