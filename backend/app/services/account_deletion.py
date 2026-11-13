"""A buyer deleting their own account, from the phone app or the website.

App Store Review Guideline 5.1.1(v): an app in which people can make an account
must let them delete it from inside the app. The app makes accounts (a
wholesale application), so this is the deletion it offers.

What goes
---------
Who they are: name, email (replaced with an address nobody can sign in with),
phone, password, two-factor setup, and every pending link or code. They can no
longer sign in, and their session is ended. Messages they sent the shop, carts
and order templates they saved, price lists they asked for: gone.

When nobody else is left on their company (a one-person retail account, or a
small trade account), the company's contact details go too: its name, email,
phone, website, address, saved addresses, cart and stored bank details.

What stays
----------
Orders, returns and invoices: they are the shop's books, which a shop must keep,
and each order keeps the address it shipped to. They now point at a "Deleted
customer". A company with other people on it is the shop's customer, not this
person, and stays as it is.

A shop's own staff are not deleted here: closing an account that runs a shop is
done with PrintCoPilot (see request_staff_deletion).
"""
from __future__ import annotations

import logging
import secrets
import uuid
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password

logger = logging.getLogger(__name__)

DELETED_NAME = "Deleted customer"


def deleted_email(user_id: uuid.UUID) -> str:
    """An address that is unique to this account and can never receive mail."""
    return f"deleted-{user_id.hex}@deleted.invalid"


async def delete_buyer(db: AsyncSession, user: Any) -> dict[str, int]:
    """Remove a buyer's personal details and close their account. Commits."""
    from app.models.communication import Message
    from app.models.company import Company, CompanyUser, UserAddress
    from app.models.order import CartItem, OrderTemplate
    from app.models.system import PriceListRequest

    uid = user.id
    # Who they are.
    user.email = deleted_email(uid)
    user.first_name = "Deleted"
    user.last_name = "customer"
    user.phone = None
    user.hashed_password = hash_password(secrets.token_urlsafe(32))
    user.is_active = False
    user.email_verified = False
    user.email_verification_token = None
    user.activation_token = None
    user.activation_token_expires = None
    user.password_reset_token = None
    user.password_reset_expires = None
    user.two_factor_enabled = False
    user.two_factor_secret = None
    user.two_factor_backup_codes = None

    # What only they made.
    removed = 0
    for model, column in (
        (Message, Message.sender_id),
        (OrderTemplate, OrderTemplate.created_by_id),
        (PriceListRequest, PriceListRequest.requested_by_id),
    ):
        removed += (await db.execute(delete(model).where(column == uid))).rowcount or 0

    # Their companies: they leave each; one left with nobody on it loses its contact details.
    memberships = (await db.execute(select(CompanyUser).where(CompanyUser.user_id == uid))).scalars().all()
    emptied = 0
    for m in memberships:
        m.is_active = False
        others = (await db.execute(
            select(func.count(CompanyUser.id)).where(
                CompanyUser.company_id == m.company_id, CompanyUser.user_id != uid, CompanyUser.is_active == True,  # noqa: E712
            )
        )).scalar() or 0
        if others:
            continue
        await db.execute(update(Company).where(Company.id == m.company_id).values(
            name=DELETED_NAME, trading_name=None, company_email=None, phone=None, fax=None, website=None,
            address_line1=None, address_line2=None, city=None, state_province=None, postal_code=None,
            ach_account=None, default_payment_method_id=None,
        ))
        await db.execute(delete(UserAddress).where(UserAddress.company_id == m.company_id))
        await db.execute(delete(CartItem).where(CartItem.company_id == m.company_id))
        emptied += 1

    await db.commit()
    return {"removed_records": removed, "companies_cleared": emptied}


async def end_sessions(user_id: Any, access_jti: str | None) -> None:
    """Sign them out everywhere they could still be signed in."""
    from app.core.redis import redis_delete, redis_set

    try:
        await redis_delete(f"refresh:{user_id}")
        if access_jti:
            await redis_set(f"blacklist:{access_jti}", "1", expire=15 * 60)
    except Exception:  # noqa: BLE001
        # The account is already closed: an inactive user cannot sign in or
        # refresh. Redis being away must not undo that.
        logger.warning("could not end the sessions of deleted account %s", user_id)
