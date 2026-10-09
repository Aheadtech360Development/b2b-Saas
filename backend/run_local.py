"""The API on this machine, for local development. Never production.

    cd backend
    .venv\\Scripts\\python.exe run_local.py            serve on http://localhost:8000
    .venv\\Scripts\\python.exe run_local.py migrate    bring the local database's tables up to date
    .venv\\Scripts\\python.exe run_local.py seed       fill the local database with the demo shop
    .venv\\Scripts\\python.exe run_local.py check      say what it would connect to, and stop

What keeps production out of it:

- The database address is written here, not read from anywhere: 127.0.0.1,
  the container that docker-compose.local.yml starts. It is checked again
  after the settings are loaded, and nothing runs if it is anything else.
  backend/.env is still read for the rest, so whatever it says about a
  database is overridden, not trusted.

- Every key that reaches something outside this machine is blanked: mail,
  card payments, shipping labels, the supplier, image storage, the AI. A
  local order therefore sends no mail, charges nothing, orders no blanks and
  uploads nothing. (backend/.env's image key is the live shop's own media
  library: a local upload or delete would have landed in it.)

- The two background loops that call suppliers and Google are replaced with
  ones that do nothing.
"""
from __future__ import annotations

import asyncio
import os
import sys

DB_HOST = "127.0.0.1"
DB_PORT = 5440
DB_NAME = "printcopilot_local"
REDIS = "redis://127.0.0.1:6390"

# The platform's own sign-in on this machine. Local only: the account is made
# in the local database the first time the API starts.
PLATFORM_ADMIN_EMAIL = "platform@example.com"
PLATFORM_ADMIN_PASSWORD = "Local@12345"

LOCAL = {
    "APP_ENV": "development",
    "DEBUG": "false",
    "DATABASE_URL": f"postgresql+asyncpg://postgres:local@{DB_HOST}:{DB_PORT}/{DB_NAME}",
    "DATABASE_URL_SYNC": f"postgresql://postgres:local@{DB_HOST}:{DB_PORT}/{DB_NAME}",
    "REDIS_URL": f"{REDIS}/0",
    "CELERY_BROKER_URL": f"{REDIS}/1",
    "CELERY_RESULT_BACKEND": f"{REDIS}/2",
    "PLATFORM_DOMAIN": "localhost",
    "FRONTEND_URL": "http://localhost:3000",
    "ALLOWED_ORIGINS": "http://localhost:3000,http://127.0.0.1:3000",
    "COOKIE_SECURE": "false",
    "COOKIE_SAMESITE": "lax",
    "COOKIE_DOMAIN": "",
    "SEED_PLATFORM_ADMIN_EMAIL": PLATFORM_ADMIN_EMAIL,
    "SEED_PLATFORM_ADMIN_PASSWORD": PLATFORM_ADMIN_PASSWORD,
    "SEED_PLATFORM_ADMIN_RESET": "",
    "SEED_PLATFORM_ADMIN_RETIRE": "",
}

# Nothing leaves this machine. Each of these is a door to a real service.
BLANKED = [
    # mail
    "RESEND_API_KEY", "SENDGRID_API_KEY", "EMAIL_REDIRECT_TO",
    # card payments and their webhooks
    "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_SECRET_KEY_TEST", "STRIPE_PUBLISHABLE_KEY_TEST",
    "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET_TEST",
    "STRIPE_CONNECT_WEBHOOK_SECRET_TEST",
    # shipping labels and rates, tax lookups, address suggestions
    "SHIPPO_API_KEY", "ZIPTAX_API_KEY", "GEOAPIFY_API_KEY",
    # the supplier: catalogue syncs and orders forwarded to it
    "SS_ACCOUNT_NUMBER", "SS_API_KEY",
    # image storage and the image tools
    "IMAGEKIT_URL_ENDPOINT", "IMAGEKIT_PUBLIC_KEY", "IMAGEKIT_PRIVATE_KEY", "IMAGE_TOOLS_URL", "IMAGE_TOOLS_KEY",
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
    # the AI
    "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY",
    # other people's systems
    "QB_CLIENT_ID", "QB_CLIENT_SECRET", "QB_ACCESS_TOKEN", "QB_REFRESH_TOKEN", "QB_COMPANY_ID",
    "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "SHOPIFY_ADMIN_API_TOKEN", "SHOPIFY_STORE_DOMAIN",
    "SENTRY_DSN", "RECAPTCHA_SECRET_KEY",
]


def local_environment() -> None:
    """Point this process at the local database and nothing else. Must run
    before anything from `app` is imported: the settings are read once."""
    os.environ.update(LOCAL)
    for key in BLANKED:
        os.environ[key] = ""
    here = os.path.dirname(os.path.abspath(__file__))
    os.chdir(here)                       # backend/.env and alembic.ini are found from here
    if here not in sys.path:
        sys.path.insert(0, here)

    from app.core.config import get_settings

    s = get_settings()
    want = f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    for url in (s.DATABASE_URL, s.sync_db_url):
        if not url.endswith(want):
            raise SystemExit("refusing to start: the database is not the local one "
                             f"(expected …{want}).")
    if s.APP_ENV == "production":
        raise SystemExit("refusing to start: APP_ENV says production.")
    still_set = [k for k in BLANKED if getattr(s, k, "")]
    if still_set:
        raise SystemExit(f"refusing to start: still set after blanking: {', '.join(still_set)}")


def check() -> None:
    from app.core.config import get_settings

    s = get_settings()
    print(f"database : {s.sync_db_url.split('@', 1)[1]}  (this machine)")
    print(f"cache    : {s.REDIS_URL}")
    print(f"web      : {s.FRONTEND_URL}   brands at http://<slug>.localhost:3000")
    print(f"outside  : nothing ({len(BLANKED)} keys blanked: no mail, payments, labels, supplier, image storage, AI)")


def migrate() -> None:
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config("alembic.ini"), "head")

    # One table has a model and no migration: the live database got it by hand.
    # A database made from the migrations alone lacks it, and Settings → Taxes
    # then fails. Made here the same way, only when it is missing.
    from sqlalchemy import create_engine

    from app.api.v1.admin.taxes import TaxRate
    from app.core.config import get_settings

    engine = create_engine(get_settings().sync_db_url)
    TaxRate.__table__.create(engine, checkfirst=True)
    engine.dispose()
    print("local database is up to date.")


def serve() -> None:
    import app.services.google_reviews as reviews
    import app.services.suppliers.jobs as jobs

    async def idle() -> None:
        await asyncio.Event().wait()

    jobs.scheduler_loop = idle       # no supplier syncs, no orders sent to a supplier
    reviews.scheduler_loop = idle    # no review imports

    import uvicorn

    from app.main import app

    check()
    print("API      : http://localhost:8000   (docs at /docs)   Ctrl+C to stop\n")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


def seed() -> None:
    from scripts.local_seed import main

    asyncio.run(main())


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "serve"
    local_environment()
    actions = {"serve": serve, "migrate": migrate, "seed": seed, "check": check}
    if what not in actions:
        raise SystemExit(f"unknown: {what}. One of: {', '.join(actions)}")
    actions[what]()
