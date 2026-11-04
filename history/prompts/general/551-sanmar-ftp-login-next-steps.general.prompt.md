---
id: 551
title: SanMar FTP login next steps
stage: general
date: 2026-11-03
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's screenshot of a brand's SanMar connection in the Shopify app Supply Master (FTP username, password, country)
labels: ["suppliers", "sanmar", "credentials", "security"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - .gitignore
 - backend/.sanmar-test.env (git-ignored, placeholders only)
 - history/prompts/general/551-sanmar-ftp-login-next-steps.general.prompt.md
tests:
 - git check-ignore: backend/.sanmar-test.env is ignored
---

## Prompt

ye rhy sanmar ke credentials bhai ab batao kia krun jani  (screenshot of Supply Master > Edit Supplier > SanMar Connection Credentials; the password was readable in the image and is not copied anywhere)

## Response snapshot

The screenshot is a SanMar FTP login (username = the SanMar customer number), the file route: SanMar's product file and stock files, enough for catalogue import and stock sync; orders may need the FTP order route or web services, to confirm in SanMar's FTP guide. The password showed in the screenshot: not written to any file, commit, memory or record; advised not to share it further and to have SanMar change it after the build (then update it in Supply Master too). Made `backend/.sanmar-test.env` (git-ignored, added to .gitignore beside the Stripe test file) with empty SANMAR_FTP_USERNAME / SANMAR_FTP_PASSWORD for the owner to fill in the editor. Asked for: the two SanMar guides downloaded in a browser into the project, whose account it is, and the go to read files only (no orders) while building.

## Outcome

- ✅ Impact: a safe place for the login; the build can start once filled.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner fills the file, adds the guides, names the brand; then the SanMar connection (FTP) for import and stock.
- 🧠 Reflection: a login shown in a screenshot is treated like one pasted in chat: never copied, rotation suggested.
