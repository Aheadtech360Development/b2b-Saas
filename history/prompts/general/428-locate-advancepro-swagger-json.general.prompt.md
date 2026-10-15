---
id: 428
title: Locate AdvancePro swagger json
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: User opened the AdvancePro docs page and shared a screenshot asking where the json link is
labels: ["integrations", "advancepro", "swagger", "support"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/428-locate-advancepro-swagger-json.general.prompt.md
tests:
 - none
---

## Prompt

[screenshot: advanceware.net/restapibeta/documentation/ui/index.html. Swagger UI "API Documentation" with faint V2 / OAS3 badges, Servers "/restapibeta", Authorize button, tags AdminReport (GET /api/AdminReport, POST /api/AdminReport/run) and APTXDashboard] ?

## Response snapshot

The page hides the usual .json link under the title. Read from the screenshot: OpenAPI 3, document version V2, and server
/restapibeta (base URL https://advanceware.net/restapibeta, which looks shared, with the company picked by the login).
Gave two ways to get the spec. First, try https://advanceware.net/restapibeta/documentation/v2/swagger.json directly
(a guess based on the docs path and the V2 badge). Second, if that fails, press Ctrl+U on the docs page, then
Ctrl+F for "swagger.json", and open or screenshot the path it finds.

## Outcome

- ✅ Impact: Concrete steps to fetch the spec file. Base URL confirmed from the screenshot.
- 🧪 Tests: none
- 📁 Files: this PHR only
- 🔁 Next prompts: read the uploaded swagger.json and map the inventory endpoints
- 🧠 Reflection: The JSON path is inferred, not confirmed, so a page-source fallback was given

## Evaluation notes (flywheel)

- Failure modes observed: Swagger UI theme hides the spec link
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
