---
id: 417
title: JavaScript box on the builder's Custom HTML block
stage: general
date: 2026-10-14
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Add JavaScript to the website builder's Custom HTML block, done properly
labels: ["website-builder", "custom-html", "javascript", "permissions", "security"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/builder/scripts.py
 - backend/app/api/v1/admin/builder.py
 - backend/app/services/builder/schema.py
 - backend/app/services/builder/resolve.py
 - backend/tests/test_builder_block_script.py
 - frontend/src/components/builder/islands/BlockScript.tsx
 - frontend/src/components/builder/render.tsx
 - frontend/src/components/builder/editor/fields.tsx
 - frontend/src/components/builder/editor/SiteEditor.tsx
 - frontend/src/lib/builder/registry.ts
 - frontend/src/__tests__/builder-block-script.test.tsx
tests:
 - backend tests/test_builder_block_script.py 10/10 (endpoint tests for save and rollback with real role rules); tests/test_builder_schema.py 79/79
 - frontend builder-block-script.test.tsx 12/12; builder tests 243/243; full suite 498 passed, and 3 files whose workers did not start under load were rerun on their own: studio-assistant and gang-sheet-studio pass; api-client.test.ts has 2 old failures (it mocks /api/v1/refresh, the client calls /api/v1/auth/refresh), the same on the branch, not touched here
 - tsc: only the two old errors in api-client.test.ts (untouched since July, local package versions); next build passes
 - local API, real roles: 17/17 (Editor refused adding, changing, and making live again a version whose script the site no longer has; may keep, copy, take out; HTML still script-free)
 - local browser: 9/9 with code written for a loading page (DOMContentLoaded, window.onload, document.write), shown twice through a shared section; screenshot checked
---

## Prompt

chalo abhi ye roko lekin ek msla ha jo mera builder hana wrebsite builder ha jo mere platform mei waha manager kehra custom html mei html aur css ka to opt ha javascript ka koi block nh ha to wo kehra ha wo bhi to add krna ha jani plz yar ye bhi dekhlo proper saiha meri jan

(then) continue plz

## Response snapshot

**What was built.** The Custom HTML block has a third box, JavaScript, beside HTML and CSS:
- It runs on the live site and in Preview, once the page has loaded, never in the editor. The editor shows a note in its place.
- `block` is the block's own element.
- Scripts typed into the HTML box are still removed. JavaScript lives only in its own box.

**Who may write it.** Only the shop's Administrator (the built-in role, not a custom one) or the platform. The server enforces this:
- On saving the draft, and on making an earlier version the published one again.
- Others may keep the Administrator's script, copy or move its block, or take it out.
- The box is read-only for them, and the editor says why a save was refused instead of retrying.

**Why in the page and not in a sealed frame.** The older custom code sections run in a sandboxed frame. This block's script needs the block's own HTML, the shop's look and the page's GTM, so it runs in the page. That is the same power the Administrator already has with the custom code in Tracking & Analytics.

**Code copied from elsewhere works.**
- A wait for DOMContentLoaded, load or window.onload is answered at once.
- document.write writes into the block instead of wiping the page.
- Everything is put back after the script runs.

**Found, not changed (reported to the owner).** Tracking & Analytics' custom head/body code is saved under the "analytics" section, so Managers, Editors and Fulfillment staff can save code that runs on every shop page. It needs the owner's yes to tighten.

## Outcome

- ✅ Impact: the manager's JavaScript box, Administrator-only, checked on the server, the editor, the storefront and in a browser.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: the owner's go to push to main; whether to tighten who can save Tracking & Analytics custom code.
- 🧠 Reflection: the existing sealed-frame custom code (CustomCodeFrame) was found late. It was weighed against the in-page design and kept as the older builders' way.

## Evaluation notes (flywheel)

- Failure modes observed: the first version left rollback unchecked and silently skipped code that waits for DOMContentLoaded. Both were found in self-review and fixed.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
