---
id: 115
title: Resend From Email Env Var
stage: general
date: 2026-04-27
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["email","config","resend","env-var"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/core/config.py
tests:
  - none
---

## Prompt

Update the email service to use the RESEND_FROM_EMAIL environment variable as the from address. Replace any hardcoded "onboarding@resend.dev" from addresses throughout the codebase with the value from os.environ.get("RESEND_FROM_EMAIL", "noreply@karauxbaia.resend.app").

## Response snapshot

- `config.py`: added `RESEND_FROM_EMAIL: str = ""` field; added `model_validator(mode="after")` `_apply_resend_from_email` that sets `EMAIL_FROM_ADDRESS = self.RESEND_FROM_EMAIL` when the env var is non-empty
- All email sending already flows through `email_service.py` `send_raw()` which reads `settings.EMAIL_FROM_ADDRESS` — no other files needed changes
- Default remains `"noreply@karauxbaia.resend.app"` when `RESEND_FROM_EMAIL` is unset
- `EMAIL_FROM_ADDRESS` env var can still be used directly; `RESEND_FROM_EMAIL` takes precedence when set

## Outcome

- ✅ Impact: Setting `RESEND_FROM_EMAIL` in the environment now controls the from address for all outgoing emails without code changes
- 🧪 Tests: None automated; verify by setting the env var and triggering a test email
- 📁 Files: 1 file modified
- 🔁 Next prompts: Add RESEND_FROM_EMAIL to .env.example; consider adding it to deployment config
- 🧠 Reflection: model_validator is the right hook — it runs after all env vars are loaded by Pydantic Settings, so RESEND_FROM_EMAIL reliably overrides the EMAIL_FROM_ADDRESS default

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results: none
- Prompt variant: null
- Next experiment: null
