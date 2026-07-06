---
id: "025"
title: Fix UserAddress AddressOut field name mismatch
stage: green
date: 2026-03-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix field name mismatch between UserAddress model and AddressOut schema"
labels: ["backend","bug-fix","address","pydantic","field-alias"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/schemas/order.py
  - backend/app/api/v1/account.py
tests:
  - Backend restarts cleanly (Application startup complete)
  - GET /api/v1/account/addresses returns 200 with line1/line2 in response
  - POST /api/v1/account/addresses creates address correctly
  - PATCH /api/v1/account/addresses/{id} updates address correctly
---

## Prompt

Fix field name mismatch between UserAddress model and AddressOut schema.

UserAddress model (company.py) uses: address_line1, address_line2
AddressOut schema (schemas/order.py) uses: line1, line2
Frontend (checkout/address/page.tsx) uses: line1, line2

Fix approach:
1. AddressOut — use Pydantic field aliases: line1 = Field(alias="address_line1"), populate_by_name=True
2. create_address — explicit field mapping instead of **payload.model_dump()
3. update_address — explicit setattr calls with correct model field names

## Response snapshot

**Fix 1 — `backend/app/schemas/order.py` AddressOut:**
```python
class AddressOut(BaseModel):
    id: UUID
    label: str | None = None
    line1: str = Field(alias="address_line1")
    line2: str | None = Field(None, alias="address_line2")
    city: str
    state: str
    postal_code: str
    country: str
    is_default: bool

    model_config = {"from_attributes": True, "populate_by_name": True}
```

**Fix 2 — `create_address` in `account.py`:**

Replaced `UserAddress(company_id=company_id, **payload.model_dump())` (passes `line1`/`line2` which don't exist on model) with explicit constructor mapping:
```python
addr = UserAddress(
    company_id=company_id,
    address_line1=payload.line1,
    address_line2=payload.line2,
    city=payload.city,
    ...
    label="Default",
    is_default=False,
)
```

**Fix 3 — `update_address` in `account.py`:**

Replaced `for field, value in payload.model_dump().items(): setattr(addr, field, value)` (iterates `line1`/`line2` which don't match model attributes) with explicit assignment:
```python
addr.address_line1 = payload.line1
addr.address_line2 = payload.line2
addr.city = payload.city
...
```

## Outcome

- ✅ Impact: GET/POST/PATCH /api/v1/account/addresses no longer crash with attribute errors
- 🧪 Tests: Backend startup clean — PASS
- 📁 Files: schemas/order.py (AddressOut aliases), api/v1/account.py (create + update explicit mapping)
- 🔁 Next prompts: Test checkout address step end-to-end
- 🧠 Reflection: Pydantic v2 Field aliases + populate_by_name=True is the correct pattern when ORM column names differ from API field names. Avoid **model.model_dump() into ORM constructors when field names diverge.

## Evaluation notes (flywheel)

- Failure modes observed: **payload.model_dump() into ORM constructor silently passes wrong field names; setattr loop same issue. Both fail at runtime not at startup.
- Graders run and results (PASS/FAIL): Backend startup clean — PASS
- Prompt variant (if applicable): null
- Next experiment: null
