---
id: 582
title: Brand own domain through Vercel API
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks to make a brand's own domain automatic too, then push
labels: ["domains", "vercel", "api", "deploy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/vercel_domains.py
 - backend/app/services/brand_domain.py
 - backend/app/api/v1/platform/tenants.py
 - backend/app/core/config.py
 - backend/run_local.py
 - backend/tests/test_vercel_domains.py
 - frontend/src/components/platform/console/brand/DomainTab.tsx
tests:
 - backend tests/test_vercel_domains.py 12 (Vercel's API played by httpx MockTransport); with test_platform_console_fixes and test_retail_plan: 57 passed
 - tsc: no errors in src
 - endpoints checked in Vercel's docs 2026-11-05: POST /v10/projects/{p}/domains, GET and DELETE /v9/projects/{p}/domains/{d}, POST /v9/projects/{p}/domains/{d}/verify, teamId or slug
---

## Prompt

hn koi agar apna brandlae to wo bhi automatickro na meri jan aur ye hojae to krdo bs push isey krdena push saiha bhai mere

## Response snapshot

A brand's own domain now goes on the Vercel project through Vercel's API the moment it is saved (shop Settings → Domain, or the platform console), a bare domain with its www redirecting to it (308); the old one comes off when changed or removed; "Check" reads Vercel and asks it to verify, and a TXT challenge shows as a row of the shop's DNS table; Vercel errors never break the save and go to the platform inbox. Needs VERCEL_TOKEN (secret, set in Railway by the owner), VERCEL_PROJECT=b2b-saas, VERCEL_TEAM=aheadtech360developments-projects; without them nothing is sent (as before). Pushed with 73813c0 on the owner's yes.

## Outcome

- ✅ Impact: no hand-adding in Vercel for platform subdomains (wildcard) or brands' own domains (API) once the token is set.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: the owner adds the three Railway variables; a live check with a real domain.
- 🧠 Reflection: a feature that needs a secret should do nothing until it has one, and say so in one log line.
