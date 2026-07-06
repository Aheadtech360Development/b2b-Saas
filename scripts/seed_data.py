"""Seed script: admin user, default tiers, email templates, system settings.

Usage:
    python scripts/seed_data.py             # seed all
    python scripts/seed_data.py --skip-existing  # idempotent
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password

# Import all models to ensure SQLAlchemy relationships are fully resolved
import app.models.user  # noqa: F401
import app.models.company  # noqa: F401
import app.models.product  # noqa: F401
import app.models.inventory  # noqa: F401
import app.models.pricing  # noqa: F401
import app.models.shipping  # noqa: F401
import app.models.order  # noqa: F401
import app.models.rma  # noqa: F401
import app.models.wholesale  # noqa: F401
import app.models.communication  # noqa: F401
import app.models.system  # noqa: F401

from app.models.communication import EmailTemplate
from app.models.inventory import Warehouse
from app.models.pricing import PricingTier
from app.models.shipping import ShippingBracket, ShippingTier
from app.models.system import Settings
from app.models.user import User


PRICING_TIERS = [
    {"name": "Standard", "description": "Standard wholesale pricing (no discount)", "discount_percent": 0},
    {"name": "Silver", "description": "Silver tier — 10% off retail", "discount_percent": 10},
    {"name": "Gold", "description": "Gold tier — 20% off retail", "discount_percent": 20},
    {"name": "Platinum", "description": "Platinum tier — 30% off retail", "discount_percent": 30},
]

SHIPPING_TIERS = [
    {
        "name": "Standard Shipping",
        "description": "Standard bracketed rates",
        "brackets": [
            {"min_units": 1, "max_units": 99, "cost": 25.00},
            {"min_units": 100, "max_units": 499, "cost": 50.00},
            {"min_units": 500, "max_units": None, "cost": 0.00},
        ],
    },
    {
        "name": "Express Shipping",
        "description": "Faster shipping at higher cost",
        "brackets": [
            {"min_units": 1, "max_units": 99, "cost": 45.00},
            {"min_units": 100, "max_units": 499, "cost": 75.00},
            {"min_units": 500, "max_units": None, "cost": 25.00},
        ],
    },
    {
        "name": "Free Shipping",
        "description": "All orders ship free",
        "brackets": [
            {"min_units": 1, "max_units": None, "cost": 0.00},
        ],
    },
]

SYSTEM_SETTINGS = [
    {"key": "mov_amount", "value": "500.00", "description": "Minimum order value in USD"},
    {"key": "tax_rate", "value": "0.00", "description": "Flat tax rate percentage"},
    {"key": "guest_pricing_mode", "value": "hidden", "description": "Options: show_retail | hidden | login_prompt"},
    {"key": "low_stock_threshold", "value": "10", "description": "Default low stock alert threshold"},
    {"key": "notification_email", "value": "orders@afapparels.com", "description": "Admin notification email"},
    {"key": "po_number_required", "value": "false", "description": "Whether PO number is required at checkout"},
]

EMAIL_TEMPLATES = [
    {
        "trigger_event": "order_confirmation",
        "name": "Order Confirmation",
        "subject": "Order Confirmation — {{ order_number }}",
        "body_html": """<h1>Thank you for your order!</h1>
<p>Hi {{ first_name }},</p>
<p>Your order <strong>{{ order_number }}</strong> has been confirmed.</p>
{% if po_number %}<p>PO Number: {{ po_number }}</p>{% endif %}
<p>Total: {{ total }}</p>""",
        "available_variables": json.dumps(["first_name", "order_number", "po_number", "total", "items"]),
    },
    {
        "trigger_event": "order_shipped",
        "name": "Order Shipped",
        "subject": "Your Order Has Shipped — {{ order_number }}",
        "body_html": """<h1>Your order is on its way!</h1>
<p>Hi {{ first_name }},</p>
<p>Order <strong>{{ order_number }}</strong> has been shipped.</p>
{% if tracking_number %}<p>Tracking: {{ tracking_number }}</p>{% endif %}""",
        "available_variables": json.dumps(["first_name", "order_number", "tracking_number", "carrier"]),
    },
    {
        "trigger_event": "wholesale_approved",
        "name": "Wholesale Application Approved",
        "subject": "Your Wholesale Application Has Been Approved",
        "body_html": """<h1>Welcome to AF Apparels Wholesale!</h1>
<p>Hi {{ first_name }},</p>
<p>Your wholesale application for <strong>{{ company_name }}</strong> has been approved.</p>
<p>Your pricing tier: <strong>{{ pricing_tier }}</strong></p>
<p><a href="{{ login_url }}">Log in to your account</a></p>""",
        "available_variables": json.dumps(["first_name", "company_name", "pricing_tier", "login_url"]),
    },
    {
        "trigger_event": "wholesale_rejected",
        "name": "Wholesale Application Rejected",
        "subject": "Update on Your Wholesale Application",
        "body_html": """<h1>Application Update</h1>
<p>Hi {{ first_name }},</p>
<p>Unfortunately, we are unable to approve your wholesale application at this time.</p>
{% if rejection_reason %}<p>Reason: {{ rejection_reason }}</p>{% endif %}""",
        "available_variables": json.dumps(["first_name", "rejection_reason"]),
    },
    {
        "trigger_event": "password_reset",
        "name": "Password Reset",
        "subject": "Reset Your Password",
        "body_html": """<h1>Reset Your Password</h1>
<p>Hi {{ first_name }},</p>
<p>Click the link below to reset your password (expires in 1 hour):</p>
<p><a href="{{ reset_url }}">Reset Password</a></p>""",
        "available_variables": json.dumps(["first_name", "reset_url"]),
    },
    {
        "trigger_event": "email_verification",
        "name": "Email Verification",
        "subject": "Verify Your Email Address",
        "body_html": """<h1>Verify Your Email</h1>
<p>Hi {{ first_name }},</p>
<p><a href="{{ verification_url }}">Verify your email address</a></p>""",
        "available_variables": json.dumps(["first_name", "verification_url"]),
    },
    {
        "trigger_event": "welcome",
        "name": "Welcome Email",
        "subject": "Welcome to AF Apparels Wholesale",
        "body_html": """<h1>Welcome!</h1>
<p>Hi {{ first_name }}, your account is ready. <a href="{{ login_url }}">Log in now</a>.</p>""",
        "available_variables": json.dumps(["first_name", "login_url"]),
    },
    {
        "trigger_event": "user_invitation",
        "name": "User Invitation",
        "subject": "You've Been Invited to AF Apparels Wholesale",
        "body_html": """<h1>You've been invited!</h1>
<p>{{ invited_by }} has invited you to join <strong>{{ company_name }}</strong>.</p>
<p><a href="{{ invitation_url }}">Accept Invitation</a></p>""",
        "available_variables": json.dumps(["invited_by", "company_name", "invitation_url"]),
    },
    {
        "trigger_event": "rma_approved",
        "name": "RMA Approved",
        "subject": "Your Return Request Has Been Approved — {{ rma_number }}",
        "body_html": """<h1>Return Request Approved</h1>
<p>Hi {{ first_name }}, your RMA <strong>{{ rma_number }}</strong> has been approved.</p>""",
        "available_variables": json.dumps(["first_name", "rma_number"]),
    },
    {
        "trigger_event": "rma_rejected",
        "name": "RMA Rejected",
        "subject": "Update on Your Return Request — {{ rma_number }}",
        "body_html": """<h1>Return Request Update</h1>
<p>Hi {{ first_name }}, your RMA <strong>{{ rma_number }}</strong> could not be approved.</p>""",
        "available_variables": json.dumps(["first_name", "rma_number", "rejection_reason"]),
    },
    {
        "trigger_event": "payment_failed",
        "name": "Payment Failed",
        "subject": "Payment Failed for Order {{ order_number }}",
        "body_html": """<h1>Payment Issue</h1>
<p>Hi {{ first_name }}, payment for order <strong>{{ order_number }}</strong> failed. Please update your payment method.</p>""",
        "available_variables": json.dumps(["first_name", "order_number", "payment_url"]),
    },
]


async def seed(session: AsyncSession, skip_existing: bool = False) -> None:
    print("Seeding pricing tiers...")
    for tier_data in PRICING_TIERS:
        if skip_existing:
            result = await session.execute(select(PricingTier).where(PricingTier.name == tier_data["name"]))
            if result.scalar_one_or_none():
                continue
        tier = PricingTier(**tier_data)
        session.add(tier)

    print("Seeding shipping tiers...")
    for tier_data in SHIPPING_TIERS:
        if skip_existing:
            result = await session.execute(select(ShippingTier).where(ShippingTier.name == tier_data["name"]))
            if result.scalar_one_or_none():
                continue
        tier = ShippingTier(name=tier_data["name"], description=tier_data["description"])
        session.add(tier)
        await session.flush()
        for bracket_data in tier_data["brackets"]:
            bracket = ShippingBracket(tier_id=tier.id, **bracket_data)
            session.add(bracket)

    print("Seeding system settings...")
    for setting_data in SYSTEM_SETTINGS:
        if skip_existing:
            result = await session.execute(select(Settings).where(Settings.key == setting_data["key"]))
            if result.scalar_one_or_none():
                continue
        session.add(Settings(**setting_data))

    print("Seeding email templates...")
    for template_data in EMAIL_TEMPLATES:
        if skip_existing:
            result = await session.execute(
                select(EmailTemplate).where(EmailTemplate.trigger_event == template_data["trigger_event"])
            )
            if result.scalar_one_or_none():
                continue
        session.add(EmailTemplate(**template_data))

    print("Seeding admin user...")
    admin_email = "admin@afapparels.com"
    if not skip_existing:
        admin = User(
            email=admin_email,
            hashed_password=hash_password("ChangeMe123!"),
            first_name="AF",
            last_name="Admin",
            is_admin=True,
            email_verified=True,
            is_active=True,
        )
        session.add(admin)
    else:
        result = await session.execute(select(User).where(User.email == admin_email))
        if not result.scalar_one_or_none():
            admin = User(
                email=admin_email,
                hashed_password=hash_password("ChangeMe123!"),
                first_name="AF",
                last_name="Admin",
                is_admin=True,
                email_verified=True,
                is_active=True,
            )
            session.add(admin)

    await session.commit()
    print("✅ Seed complete.")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()

    async with AsyncSessionLocal() as session:
        await seed(session, skip_existing=args.skip_existing)


if __name__ == "__main__":
    asyncio.run(main())
