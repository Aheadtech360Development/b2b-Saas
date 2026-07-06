---
id: 260
title: Find Or Create Vendor Duplicate Name Fix
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: production.aheadtech360@gmail.com
command: fix find_or_create_vendor — QB error 6240 Duplicate Name Exists when manufacturer matches a Customer name
labels: ["quickbooks","vendor","duplicate-name","error-6240","find-or-create"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/quickbooks_service.py
tests:
  - python ast.parse (PASS)
---

## Prompt

Fix find_or_create_vendor: QB returns "Duplicate Name Exists Id=6" when trying to
create vendor "Umer Adnan" because the same name exists as a Customer in QB.
QB does not allow same DisplayName for both Customer and Vendor.

## Response snapshot

**Before:** `find_or_create_vendor` searched for vendor by DisplayName. If not found,
called POST /vendor. No error handling — a 400 from QB propagated as an unhandled
`httpx.HTTPStatusError` and crashed the entire PO/bill sync.

**After:** Three-tier fallback chain added:

```python
except httpx.HTTPStatusError as exc:
    body = exc.response.text if exc.response is not None else ""
    is_duplicate = (status == 400) and ("6240" in body or "Duplicate Name" in body)
    if not is_duplicate:
        raise  # re-raise non-duplicate errors

    # Tier 1: extract "Id=NUMBER" from the error detail and return it
    match = re.search(r'\bId=(\d+)', body)
    if match:
        return match.group(1)  # reuse the conflicting entity's Id

    # Tier 2: retry vendor search (race condition guard)
    retry_vendors = ...
    if retry_vendors:
        return str(retry_vendors[0]["Id"])

    # Tier 3: create with "(Vendor)" suffix to avoid collision
    vendor_data["DisplayName"] = f"{vendor_name} (Vendor)"
    return str(suffix_result["Vendor"]["Id"])
```

Also added optional `email: str = ""` parameter for future use (matches QB vendor create payload).

**Key implementation detail:** `_request` calls `resp.raise_for_status()`, which raises
`httpx.HTTPStatusError`. The QB error JSON (including the `"code": "6240"` and
`"Detail": "...Id=6"`) is in `exc.response.text`, NOT in `str(exc)`. That's why
`str(e)` checks in the user's pseudocode would miss the detail — must check
`exc.response.text` directly.

## Outcome

- ✅ Impact: PO and vendor bill QB syncs no longer crash when manufacturer name matches an existing QB Customer; the existing Customer's Id is reused as the vendor reference
- 🧪 Tests: Python ast.parse PASS
- 📁 Files: 1 file changed (78 insertions / 11 deletions)
- 🔁 Next prompts: Restart Railway Celery worker and trigger a test receive with "Umer Adnan" PO — should see "find_or_create_vendor: 'Umer Adnan' exists as Customer/other entity in QB; reusing Id=6" in worker logs
- 🧠 Reflection: QB error detail is in `exc.response.text`, not in `str(exc)`. Always access the response body directly when parsing QB error codes. The 6240 duplicate name error is common when the same entity (person/company) is both a Customer and a Vendor in QB.

## Evaluation notes (flywheel)

- Failure modes observed: httpx.HTTPStatusError.response.text contains the QB JSON; str(exc) does not — must access response object directly to parse error codes
- Graders run and results (PASS/FAIL): Python ast.parse PASS
- Prompt variant (if applicable): none
- Next experiment: add unit test that mocks a 400 response with 6240 body and asserts the extracted Id is returned
