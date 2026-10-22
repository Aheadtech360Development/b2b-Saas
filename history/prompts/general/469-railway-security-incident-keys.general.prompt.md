---
id: 469
title: Railway security incident, which keys to rotate
stage: general
date: 2026-10-22
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Owner's Railway screenshot after 7 hours ("Railway Platform Outage", deploys still paused)
labels: ["deploy", "railway", "security", "secrets"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none in the repo (memory: railway-security-incident.md, MEMORY.md)
tests:
 - status.railway.com: Major Outage, a security incident; 22:10 UTC "strongly recommend that you revoke all environment variables stored in Railway, including API keys"; builds back Enterprise, Pro, Hobby, Free; none back by 22:45 UTC
 - backend/app/core/config.py: the env names the server reads (names only)
 - GitHub API: repo visibility public; history has no .env and no Stripe live or webhook key
---

## Prompt

(screenshot: Railway, "Railway Platform Outage. We've found the cause and are working on a fix.", the service still "Limited Access, deploys have been paused temporarily", 4:07 AM) bhai ye kia bakchodi ha yar mere bhai ab to 7 ghnty hogye bhai

## Response snapshot

- Railway's outage is a security incident at Railway, for every customer; builds come back by plan (Enterprise first), no time given. Our server keeps running and the stores work; the console waits for a deploy.
- Railway advises revoking every key stored with them. Ours include the live Stripe key, the token secrets, email, AI, Google, ImageKit, S&S and more. A new key needs a deploy to reach the server, so: roll the Stripe key now with the old one kept working, swap the values in Railway, expire the old ones after the deploy. Watch Stripe's logs and the Railway email meanwhile.
- The GitHub repo is public; no keys were ever committed; make it private later after checking Vercel.

## Outcome

- ✅ Impact: the owner knows the wait is Railway's and that the keys need rotating, in a safe order.
- 🔁 Next prompts: Railway builds back, deploy, rotation, console and Innterflow checked.
- 🧠 Reflection: a host's outage can be a security incident; read the whole status page, not just the title.
