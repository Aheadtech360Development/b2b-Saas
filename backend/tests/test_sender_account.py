"""Whose account a brand's email leaves on.

A buyer who has never heard of the platform should not get mail from it. A
brand that brings its own Resend key and its own verified address sends on
that; without both, it still sends — on ours, under its own name, with replies
coming back to it.
"""
import os, sys
sys.path.insert(0, os.path.abspath("."))

from app.services.email_service import sender_account

ok = fail = 0
def check(name, got, want):
    global ok, fail
    if got == want: ok += 1; print(f"  PASS  {name}")
    else: fail += 1; print(f"  FAIL  {name}: got {got!r}, wanted {want!r}")

PLAT = "re_platform"

print("a brand with its own account")
check("key and sender together are used",
      sender_account({"api_key": "re_own", "from_email": "orders@brand.com"}, PLAT),
      ("re_own", "orders@brand.com", True))
check("whitespace around them is ignored",
      sender_account({"api_key": "  re_own  ", "from_email": " orders@brand.com "}, PLAT),
      ("re_own", "orders@brand.com", True))

print("\nhalf a setup is not a setup")
check("a key with no verified sender falls back",
      sender_account({"api_key": "re_own"}, PLAT), (PLAT, "", False))
check("a sender with no key falls back",
      sender_account({"from_email": "orders@brand.com"}, PLAT), (PLAT, "", False))
check("empty strings are not a setup",
      sender_account({"api_key": "", "from_email": ""}, PLAT), (PLAT, "", False))

print("\nthe ordinary case")
check("nothing configured uses the platform",
      sender_account({}, PLAT), (PLAT, "", False))
check("no config at all uses the platform",
      sender_account(None, PLAT), (PLAT, "", False))
check("other email settings do not trigger it",
      sender_account({"from_name": "Innterflow", "reply_to": "hi@brand.com"}, PLAT),
      (PLAT, "", False))

print("\nand when there is no platform key either")
check("nothing to send with is said plainly",
      sender_account({}, None), ("", "", False))

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
