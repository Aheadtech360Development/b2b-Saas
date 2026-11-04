---
id: 552
title: SanMar site maintenance
stage: general
date: 2026-11-03
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's screenshot of maint.sanmar.com ("We'll Be Right Back") when opening the SanMar guide link
labels: ["suppliers", "sanmar"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/552-sanmar-site-maintenance.general.prompt.md
tests:
 - backend/.sanmar-test.env checked for values without printing them: both empty
 - DNS: ftp.sanmar.com resolves (63.251.12.151); no connection or login tried
---

## Prompt

?????  (screenshot: https://maint.sanmar.com, "www.sanmar.com is down for maintenance and will be back soon")

## Response snapshot

SanMar's whole website is down for maintenance, which is also why the script's download landed on maint.sanmar.com earlier (not a block). Public sources do not give the FTP host and port for sure; ftp.sanmar.com exists. Next: try the guide links again later; or the account holder emails sanmarintegrations@sanmar.com for the FTP guide and server details (short draft given, owner sends it); meanwhile fill backend/.sanmar-test.env (still empty) and answer whose account 189113 is and whether files may be read (no orders). With the login and the go, the FTP's own files can show names and columns even before the guide.

## Outcome

- ✅ Impact: owner knows the block is SanMar's maintenance and what to do meanwhile.
- 🧪 Tests: listed above.
- 📁 Files: this record.
- 🔁 Next prompts: the guides or SanMar's reply, the filled login file, the brand's name and the go to read files.
- 🧠 Reflection: the earlier "redirect" was maintenance; say so instead of guessing a block.
