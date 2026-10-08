---
id: 372
title: Build with AI per-brand switch
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: Build with AI on/off from each brand's Manage screen
labels: ["gang-sheet", "copilot", "entitlements", "platform-console"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/core/features.py
 - backend/app/api/v1/copilot.py
 - backend/app/api/v1/gang_sheets.py
 - backend/app/core/config.py
 - backend/.env.example
 - backend/tests/test_studio_assistant.py
 - backend/tests/test_build_with_ai_switch.py
 - frontend/src/app/(customer)/gang-sheets/page.tsx
 - frontend/src/services/gangSheets.service.ts
 - frontend/src/__tests__/build-with-ai-switch.test.tsx
tests:
 - backend/tests/test_build_with_ai_switch.py (16 passed)
 - backend/tests/test_studio_assistant.py (52 passed)
 - backend/tests/test_upload_own_sheet.py (5 passed)
 - frontend build-with-ai-switch, studio-assistant, gang-sheet-studio (57 passed)
 - tsc: no new errors (2 existing in api-client.test.ts)
---

## Prompt

acha ab bs last cheez jo remaining ha wo ye ha ke bhai jo gang sheet builder mei build with ai ka opt hANA ABHI MENE WO BND KIA HUA HA LEKIN WO MJHY SUPER ADMIN MEI HAR BRAND MEI JO MANAGE KA BUTTON HANA WAHA OPTION DENA HA KE BHAI WAHA SE ENALBLE DISABLE HO WO SAIHA TO WAHA SE KRDO SETUP KUKE IS TARAH CODE SE ENABLE DISABLE MSHKIL HORHA BAR BAR SAIHA JANI YE KRDO JISPE ENALBLE HO TO BUILD WITH AI BUTTON NAZAR AE SAIHA WARNA NA AE DEKHLO PROPER

## Response snapshot

"Build with AI" is now a feature in the catalogue, "Build with AI in the builder" under Gang Sheet Builder, and is in no plan, so the brand's Manage screen shows it with On / Off / Plan and every brand starts off. The two code switches (COPILOT_STUDIO_ENABLED on the server, BUILD_WITH_AI in the builder page) are gone. The builder page asks GET /api/v1/gang-sheets/assistant and shows the button and panel only on a yes; a no, a refusal or a failure hides them and the builder still opens. The assistant's route checks the same switch itself, and the builder too: the middleware maps /api/v1/copilot/studio to gang_sheet_ai (ahead of the admin agent's ai_agent), and studio_switched_on refuses with 503 unless the brand has both gang_sheet_ai and gang_sheet. A change takes effect within about 15 seconds.

## Outcome

- ✅ Impact: Super Admin turns Build with AI on or off per brand, with no deploy.
- 🧪 Tests: 16-check DB test for On, Off, Plan, the builder removed and another brand; unit test of the route's own check; page test for shown, hidden, and hidden on failure.
- 📁 Files: catalogue, copilot route, new availability route, builder page, service, config and env example, tests.
- 🔁 Next prompts: go-ahead to push to main; switch it On for the brands that should have it.
- 🧠 Reflection: the feature-flag system already did per-brand switching; the AI had been left outside it.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): PASS (all above).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
