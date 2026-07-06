---
id: "038"
title: Manage Users Page Full Build
stage: green
date: 2026-03-25
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Build complete Manage Users page for AF Apparels customer dashboard
labels: ["users","frontend","migration","account","auth"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/company.py
  - backend/app/schemas/account.py
  - backend/app/api/v1/account.py
  - backend/migrations/versions/25606bb8e81c_add_company_user_group.py
  - frontend/src/app/(customer)/account/users/page.tsx
  - frontend/src/app/(customer)/account/layout.tsx
tests:
  - backend/tests/ (33 passing, no regressions)
---

## Prompt

Build complete Manage Users page for AF Apparels customer dashboard.

## Response snapshot

**Model:** Added `user_group: Mapped[str] = mapped_column(String(50), default="Users", nullable=False)` to `CompanyUser`.

**Migration:** `25606bb8e81c_add_company_user_group` — autogenerate produced `nullable=False` which fails on existing rows. Fixed by: add column as `nullable=True`, backfill `UPDATE company_users SET user_group = 'Users' WHERE user_group IS NULL`, then `alter_column(..., nullable=False)`.

**Schemas:**
- `CompanyUserOut`: added `user_group: str`
- `UserInvite`: replaced `email: EmailStr` + basic fields with `first_name`, `last_name`, `email`, `role`, `user_group`, `password`, `password_hint`
- `UserUpdate` (new): all optional — `first_name`, `last_name`, `role`, `user_group`, `is_active`
- Added `ConflictError` to imports in `account.py`
- Added `UserUpdate` to schema imports

**Endpoints (account.py) — users section rewritten:**
- `GET /users`: now includes `user_group` in `CompanyUserOut` construction
- `POST /users/invite`: validates password (8–20 chars, must start with letter), checks duplicate company membership (raises `ConflictError`), creates User with provided password (not random), adds `CompanyUser` with `user_group`, sends welcome email via `email_svc.send_raw()`
- `PATCH /users/{user_id}`: now accepts `UserUpdate` (vs old `RoleUpdate`), updates `role`/`user_group` on `CompanyUser` and `first_name`/`last_name`/`is_active` on `User`
- `POST /users/{user_id}/reset-password` (new): owner-only, verifies membership, calls `AuthService.send_password_reset(email)`
- `DELETE /users/{user_id}`: added self-removal guard (`ValidationError("Cannot remove yourself")`)

**Frontend (`users/page.tsx` — full rewrite):**
- Users shown in table: Name + role (sub-text), Email, Group (color-coded badge), Status (Active/Inactive badge), Actions
- Add form: First/Last name, Email (read-only when editing), User Group pill buttons (Admin/Accounting/Purchasing/Promo Standards/Users), Role dropdown, Password + Confirm + Hint (new user only), show/hide toggles, client-side validation
- Password validation: 8–20 chars, starts with letter, no 3 consecutive chars from email username
- Actions per row: Edit, Deactivate/Activate toggle, Reset PW, Remove
- Sidebar label: "Users" → "Manage Users"

## Outcome

- ✅ Impact: Full user CRUD with group management, password creation, status toggle, reset PW at /account/users
- 🧪 Tests: 33/33 backend tests passing
- 📁 Files: company.py, account.py schemas+routes, migration 25606bb8e81c, users/page.tsx, layout.tsx
