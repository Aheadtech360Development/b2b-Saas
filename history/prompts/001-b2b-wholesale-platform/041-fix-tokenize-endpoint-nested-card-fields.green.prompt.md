---
id: "041"
title: Fix Tokenize Endpoint Nested Card Fields
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Fix card field name mismatch in QB Payments tokenize endpoint so card.number is passed correctly
labels: ["checkout","qb-payments","bug-fix","tokenize"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/checkout.py
tests:
  - backend/tests/ (existing suite)
---

## Prompt

Also in backend/app/api/v1/checkout.py tokenize endpoint, make sure the card data is passed through correctly without renaming fields.

## Response snapshot

**Bug:** `POST /checkout/tokenize` endpoint read flat keys (`payload["card_number"]`, `payload["exp_month"]`, etc.) but frontend sends a nested `card` object (`payload["card"]["number"]`, `payload["card"]["expMonth"]`, etc.).

**Fix (`checkout.py` lines 74–81):**

```python
card = payload["card"]
token = qb_pay.create_token(
    card_number=card["number"],
    exp_month=card["expMonth"],
    exp_year=card["expYear"],
    cvc=card["cvc"],
    name=card.get("name"),
    postal_code=card.get("address", {}).get("postalCode"),
)
```

**Frontend sends:**
```json
{
  "card": {
    "number": "4111111111111111",
    "expMonth": "12",
    "expYear": "2027",
    "cvc": "123",
    "name": "John Doe",
    "address": { "postalCode": "90210" }
  }
}
```

**Also updated docstring** to document the correct nested payload shape.

## Outcome

- ✅ Tokenize endpoint now unpacks nested `card` object matching frontend payload
- ✅ `postalCode` extracted via `card.get("address", {}).get("postalCode")` (safe if address omitted)
- ✅ No other files changed — minimal fix
- 📁 Files: checkout.py
