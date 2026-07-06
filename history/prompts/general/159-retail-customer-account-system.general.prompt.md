---
id: 159
title: Retail Customer Account System Implementation
stage: general
date: 2026-05-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Implement Retail Customer Account System for AF Apparels
labels: ["retail", "auth", "accounts", "guest-checkout", "email", "migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/migrations/versions/b1c2d3e5f6a7_retail_customer_accounts.py
  - backend/app/models/user.py
  - backend/app/core/exceptions.py
  - backend/app/schemas/auth.py
  - backend/app/services/auth_service.py
  - backend/app/services/email_service.py
  - backend/app/api/v1/auth.py
  - backend/app/api/v1/guest.py
  - backend/app/api/v1/orders.py
  - backend/app/services/order_service.py
  - backend/app/middleware/auth_middleware.py
  - frontend/src/app/(auth)/activate-account/page.tsx
  - frontend/src/app/(auth)/login/page.tsx
  - frontend/src/app/(customer)/account/orders/page.tsx
tests:
  - none
---

## Prompt

Implement Retail Customer Account System for AF Apparels. Full spec covering:
- DB migration: add account_type, activation_token, activation_token_expires to users; make hashed_password nullable
- User model update
- Auto-create retail account on guest checkout (guest.py)
- New auth endpoints: POST /activate-account, POST /resend-activation
- Login: raise ACCOUNT_NOT_ACTIVATED for retail users who haven't activated
- Email: send_retail_account_activation method
- Frontend: /activate-account page, login error handling, orders welcome banner
- Retail orders: list/get by placed_by_id when no company_id

## Response snapshot

### Backend

1. **Migration** `b1c2d3e5f6a7_retail_customer_accounts.py`
   - Adds `account_type` VARCHAR(20) NOT NULL DEFAULT 'wholesale'
   - Adds `activation_token` VARCHAR(255) nullable
   - Adds `activation_token_expires` TIMESTAMPTZ nullable
   - Alters `hashed_password` to nullable

2. **User model** — `hashed_password` → nullable; added `account_type`, `activation_token`, `activation_token_expires`

3. **Exceptions** — added `AccountNotActivatedError` (HTTP 403, code `ACCOUNT_NOT_ACTIVATED`)

4. **Auth schemas** — added `ActivateAccountSchema` and `ResendActivationSchema`

5. **AuthService login**:
   - Checks retail + inactive BEFORE password verify → raises `AccountNotActivatedError`
   - Retail users skip the wholesale company-membership check entirely
   - `_build_access_token_claims` now includes `account_type` in JWT

6. **EmailService** — added `send_retail_account_activation(customer_email, first_name, activation_url, order_number)`

7. **Auth API** — added `POST /activate-account` (validates token, sets password, returns JWT) and `POST /resend-activation`

8. **Guest checkout** (`guest.py`) — after order flush:
   - Calls `_create_or_get_retail_user()` helper
   - Sets `order.placed_by_id = user.id`
   - Sends activation email if this is a newly created account

9. **OrderService** — added `list_orders_for_retail_user()` and `get_order_for_retail_user()` (query by `placed_by_id`)

10. **Orders API** — `list_orders` and `get_order` now check `account_type == 'retail'` as fallback when no `company_id`

11. **Auth middleware** — added `/api/v1/activate-account` and `/api/v1/resend-activation` to PUBLIC_PATHS; injects `account_type` into `request.state`

### Frontend

12. **`/activate-account` page** — reads `?token=` URL param; shows password + confirm form; on success saves JWT and redirects to `/account/orders?activated=true`; on expired token shows ResendForm component

13. **Login page** — handles `ACCOUNT_NOT_ACTIVATED` error code: shows error + "Resend Activation Email" button that calls `POST /resend-activation`

14. **Account orders page** — shows welcome banner for 6s when `?activated=true` query param is present

## Outcome

- ✅ Impact: Full retail account lifecycle implemented — auto-created on guest checkout, activated via email link, logs in with JWT, views orders linked by placed_by_id
- 🧪 Tests: none run — Docker not available; run `alembic upgrade head` manually
- 📁 Files: 14 files created/modified
- 🔁 Next prompts: run migration; test full activation flow end-to-end
- 🧠 Reflection: hashed_password nullable change required careful handling in verify_password call (use `user.hashed_password or ""`); retail users bypass wholesale company-membership check entirely

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): test activation email delivery in staging
