---
id: 494
title: Retail plan review and database safety check
stage: general
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Review "Dev Plan Retail.pdf" for a separate build; check database backups and security now that two brands are live
labels: ["retail-plan", "backups", "security", "railway", "postgres", "planning"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/494-retail-plan-review-and-db-safety.general.prompt.md
tests:
 - none (read-only review)
---

## Prompt

ye dekho retail plan lagaya ha mene isko prp[er delho zara kuke ab alag se implement krna ha mjhy meri jan aur dusra abhi ki sbse most impoertant thing bhae jo ham db use krrhy sb backup wagera hana secutiry wagera har cheez kuke ye ab 2 brands live hain ispe ye ab mvp nh rha real world working prodcut ha bhai

(screenshot: "Dev Plan Retail.pdf" at the repo root, 10/28/2026 7:20 PM)

## Response snapshot

- Database: nothing in the repo backs the database up (no job, no pg_dump); everything rests on Railway, whose Backups tab only the owner can see. Railway offers volume backups (daily kept 6 days, weekly 1 month, monthly 3 months), PITR (about 4 weeks, from the day it is enabled) and leaves logical dumps to us; only a dump off Railway survives deleting the volume or project. Proposed: owner turns on all three schedules and PITR today; nightly dump to Cloudflare R2 through Railway's own "Postgres S3 backups" template; one restore drill on the local database.
- Security: GitHub repo still public (checked by API) while config.py carries default JWT_SECRET_KEY / APP_SECRET_KEY with no production guard: if Railway lacks either, anyone could sign tokens. Owner to confirm both names exist in Railway (never the values), make the repo private, and say which keys were rotated after the 2026-10-21 Railway incident. Good already: ORM tenant scoping + Postgres RLS under the app_rls role, login rate limits (10 per 15 min per email, 30 per IP), append-only audit log, 2FA, no keys in tracked files (pattern scan today; history searched 2026-10-22).
- Retail plan (Ikrash Maniya, 2026-10-25, 13 pages): $79 plan + order tracking, gift cards, returns/exchanges, loyalty/referrals, website changes, affiliate updates, in that order. Exists: plans in code (billing_plans.py / features.py, starter/wholesale/scale), basic returns (RMA on orders, portal request), tracking number/link + Shippo track_package, discount usage limits (total and per customer), buyer accounts (retail + trade) and guest checkout, Stripe Connect direct charges, live partner program. Missing: gift cards, loyalty, public tracking timeline with guest lookup and delivered status, full returns portal, any abandoned-cart email sender. Decisions for the manager: what counts toward 200 orders, mobile app in Retail or add-on, supplier catalogs on Retail, gift card + loyalty stacking, "global" copy vs US/Canada USD only.
- Suggested: security first, then Retail on its own branch, one package at a time.

## Outcome

- ✅ Impact: the owner has the dashboard steps for backups and keys today and a map of what the Retail plan reuses and what is new.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: owner confirms the two secret names, rotated keys, Backups/PITR on, R2 bucket; then the production secret guard, uptime alerts, off-site backup and restore drill; then Retail package 1.
- 🧠 Reflection: a live payments platform with a public repo needs the code's default secrets to be unusable in production, not just unset by habit.
