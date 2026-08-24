"""Create/refresh the platform billing tiers in Stripe (System A).

Idempotent. For each plan in app.core.billing_plans it finds-or-creates a Stripe
Product + a recurring monthly Price (keyed by lookup_key), then records the price
id in app_settings under `stripe_price_<key>`. Stripe Prices are immutable, so if
you change an amount the script creates a new Price and moves the lookup_key onto
it (transfer_lookup_key) — existing subscriptions keep their old price until
migrated, new checkouts use the new one.

Usage (from backend/, with .env loaded so STRIPE_SECRET_KEY + DATABASE_URL exist):
    python -m scripts.setup_stripe_billing
"""
import sys

import stripe
from sqlalchemy import create_engine, text

from app.core.config import get_settings
from app.core.billing_plans import BILLING_PLANS, PLAN_ORDER


def _upsert_setting(engine, key: str, value: str) -> None:
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO app_settings (key, value, updated_at)
            VALUES (:k, :v, now())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        """), {"k": key, "v": value})


def _find_price(lookup_key: str):
    res = stripe.Price.list(lookup_keys=[lookup_key], limit=1, expand=["data.product"])
    return res.data[0] if res.data else None


def main() -> int:
    settings = get_settings()
    if not settings.STRIPE_SECRET_KEY:
        print("ERROR: STRIPE_SECRET_KEY not set. Load .env first (set -a; source .env; set +a).")
        return 1
    stripe.api_key = settings.STRIPE_SECRET_KEY
    engine = create_engine(settings.sync_db_url, future=True)

    print(f"Setting up {len(PLAN_ORDER)} billing tiers in Stripe ({'LIVE' if settings.STRIPE_SECRET_KEY.startswith('sk_live') else 'TEST'} mode)...")
    for key in PLAN_ORDER:
        plan = BILLING_PLANS[key]
        lk = plan["lookup_key"]
        amount = plan["amount_cents"]
        interval = plan["interval"]

        existing = _find_price(lk)
        unchanged = (
            existing is not None
            and existing.unit_amount == amount
            and existing.recurring is not None
            and existing.recurring.interval == interval
        )

        if unchanged:
            price = existing
            prod_id = price.product if isinstance(price.product, str) else price.product.id
            stripe.Product.modify(prod_id, name=plan["name"], description=plan["description"])
            print(f"  [=] {key:8s} reuse  {price.id}  (${amount // 100}/{interval})")
        else:
            if existing is not None:
                # Reprice: keep the same product, create a new price, move the key.
                product_id = existing.product if isinstance(existing.product, str) else existing.product.id
                stripe.Product.modify(product_id, name=plan["name"], description=plan["description"])
                transfer = True
            else:
                product = stripe.Product.create(
                    name=plan["name"],
                    description=plan["description"],
                    metadata={"plan_key": key, "app": "at360"},
                )
                product_id = product.id
                transfer = False

            price = stripe.Price.create(
                product=product_id,
                unit_amount=amount,
                currency="usd",
                recurring={"interval": interval},
                lookup_key=lk,
                transfer_lookup_key=transfer,
                metadata={"plan_key": key},
            )
            verb = "reprice" if transfer else "create"
            print(f"  [+] {key:8s} {verb} {price.id}  (${amount // 100}/{interval})")

        _upsert_setting(engine, f"stripe_price_{key}", price.id)

    print("Done. Price ids stored in app_settings (key = stripe_price_<plan>).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
