# backend/app/core/config.py
"""Application configuration loaded from environment variables via Pydantic Settings."""
from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, EmailStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ───────────────────────────────────────────────────────────
    APP_ENV: Literal["development", "test", "staging", "production"] = "development"
    APP_SECRET_KEY: str = "dev-secret-key-change-in-production"
    DEBUG: bool = False
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:3001"

    # ── Multi-tenant ──────────────────────────────────────────────────────────
    # Local:      tenant.localhost  → slug = "tenant"
    # Production: tenant.yourplatform.com → slug = "tenant"
    PLATFORM_DOMAIN: str = "localhost"   # change to "yourplatform.com" in prod

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    # ── Cookie ────────────────────────────────────────────────────────────────
    COOKIE_SECURE: bool = False       # Set True in production (HTTPS required for SameSite=none)
    COOKIE_DOMAIN: str | None = None  # Leave empty/unset for Railway; omits Domain attribute
    COOKIE_SAMESITE: str = "lax"      # "none" for cross-domain (Railway backend + Vercel frontend)

    @field_validator("COOKIE_DOMAIN", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: object) -> object:
        """Coerce empty string to None so set_cookie omits the Domain attribute."""
        if v == "":
            return None
        return v

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str  # asyncpg URL
    DATABASE_URL_SYNC: str = ""  # psycopg2 URL — auto-derived from DATABASE_URL if not set
    # Connections each process may hold (pool) and open past that under a burst
    # (overflow). Sized so every process the deployment runs fits inside the
    # database's limit at once — see the calculation in core/database.py.
    DB_POOL_SIZE: int = 8
    DB_MAX_OVERFLOW: int = 4
    DB_POOL_TIMEOUT: int = 30
    # How many processes of this service share the database, for the startup
    # check (uvicorn --workers, or celery --concurrency).
    DB_PROCESSES: int = 2

    @property
    def sync_db_url(self) -> str:
        """Synchronous DB URL for Alembic — auto-derived from async URL if not set.

        Beyond swapping the driver, the query string has to be sanitised: asyncpg
        accepts options libpq/psycopg2 rejects outright (`ssl`, `*_cache_size`,
        ...), and a single unknown key makes psycopg2's `parse_dsn` raise, which
        aborts the whole migration step. `ssl=true` is translated rather than
        dropped so a TLS-only host (Neon) still gets an encrypted connection.
        """
        # NOTE: intentionally derive from DATABASE_URL and ignore a separately-set
        # DATABASE_URL_SYNC. A stale sync URL (pointing at an old/dead database)
        # makes Alembic create the schema in a *different* DB than the app reads —
        # so the app connects fine (SELECT 1) yet every table is "missing". Always
        # migrating the same DB the app talks to removes that whole failure class.
        raw = (
            self.DATABASE_URL
            .replace("postgresql+asyncpg://", "postgresql://")
            .replace("postgres+asyncpg://", "postgresql://")
            .replace("postgres://", "postgresql://")
        )

        base, sep, query = raw.partition("?")
        if not sep:
            return base

        # asyncpg-only connect args — libpq has no equivalent option name.
        async_only = {"ssl", "statement_cache_size", "prepared_statement_cache_size", "server_settings"}
        kept: list[str] = []
        for part in query.split("&"):
            if not part:
                continue
            key, _, value = part.partition("=")
            key = key.strip()
            if key not in async_only:
                kept.append(part)
                continue
            if key == "ssl" and value.lower() in {"true", "1", "require"}:
                kept.append("sslmode=require")

        # De-dupe (an explicit sslmode in the URL wins over the translated one).
        seen: set[str] = set()
        final: list[str] = []
        for part in kept:
            key = part.partition("=")[0]
            if key in seen:
                continue
            seen.add(key)
            final.append(part)

        return f"{base}?{'&'.join(final)}" if final else base

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "dev-jwt-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Stripe ────────────────────────────────────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    # The other world. Stripe keeps test and live entirely apart — a customer,
    # a Connect account or a price made in one does not exist in the other —
    # so both keys live here and the platform picks which is in use. See
    # services/stripe_mode. Secrets stay in the environment, never in a table.
    STRIPE_SECRET_KEY_TEST: str = ""
    STRIPE_PUBLISHABLE_KEY_TEST: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""          # "Your account" scope destination
    STRIPE_CONNECT_WEBHOOK_SECRET: str = ""  # "Connected accounts" scope destination
    # A test destination and a live one sign with different secrets, so both
    # sets are kept. The handler tries each rather than trusting the current
    # mode: a webhook can arrive from the world we just switched away from.
    STRIPE_WEBHOOK_SECRET_TEST: str = ""
    STRIPE_CONNECT_WEBHOOK_SECRET_TEST: str = ""
    # Which kind of connected account this platform may create: "express" or
    # "standard". Stripe provisions a platform for one of them, and refuses
    # the other with a message that names neither, so this is a setting rather
    # than something to find out by editing code. See services/connect_service.
    STRIPE_CONNECT_STYLE: str = "express"

    @field_validator(
        "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY",
        "STRIPE_SECRET_KEY_TEST", "STRIPE_PUBLISHABLE_KEY_TEST",
        "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET",
        "STRIPE_WEBHOOK_SECRET_TEST", "STRIPE_CONNECT_WEBHOOK_SECRET_TEST",
        mode="before",
    )
    @classmethod
    def strip_key(cls, v: object) -> object:
        """Trim whitespace and stray quotes off a pasted key.

        These are copied by hand into a hosting dashboard, and a trailing
        space survives the paste invisibly. It goes into the Authorization
        header as part of the key, so Stripe answers 401 and every payment
        refuses — with nothing on screen to suggest the key is anything but
        correct. Cheaper to absorb here than to debug at a checkout.
        """
        if isinstance(v, str):
            return v.strip().strip('"').strip("'").strip()
        return v

    # ── Email (Resend) ────────────────────────────────────────────────────────
    RESEND_API_KEY: str = ""
    SENDGRID_API_KEY: str = ""  # kept for backward compat, unused
    RESEND_FROM_EMAIL: str = ""
    EMAIL_FROM_ADDRESS: str = "onboarding@resend.dev"
    EMAIL_FROM_NAME: str = "Wholesale Store"
    ADMIN_NOTIFICATION_EMAIL: str = ""
    # The platform's own inbox — new shops signing up, platform-level alerts.
    # A brand's alerts never come here; those go to the brand (notify_address).
    # Falls back to ADMIN_NOTIFICATION_EMAIL when unset.
    PLATFORM_SUPPORT_EMAIL: str = ""
    # Send every outbound email here instead of to its real recipient, with the
    # intended address kept in the subject. Resend's shared onboarding@resend.dev
    # sender only delivers to the account owner, so until a domain is verified a
    # mail to a customer is refused outright. Redirecting makes that visible —
    # the message arrives and says who it was for — rather than silently lost.
    # Leave blank once a domain is verified.
    EMAIL_REDIRECT_TO: str = ""

    # ── AI Copilot (Anthropic) ────────────────────────────────────────────────
    # One platform key, like Resend: every brand's copilot runs on it, and each
    # brand is held to its own daily question limit so one cannot run the bill.
    # Without a key the briefing still works — it is computed, not generated —
    # and only the chat reports itself unavailable.
    #
    # Set any one key. COPILOT_PROVIDER (anthropic | gemini | openai) picks one
    # explicitly; blank uses the first key present, Claude first. COPILOT_MODEL
    # blank uses the provider's default (required for openai).
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    COPILOT_PROVIDER: str = ""
    COPILOT_MODEL: str = ""
    COPILOT_DAILY_LIMIT: int = 200
    # The gang sheet builder's customer assistant. Blank uses Claude Sonnet 5.5
    # when the provider is Claude — it reads the room left on a sheet at every
    # size and fills in a nested plan — and the provider's own default otherwise.
    # Limits are per day, per signed-in user and per guest address, so one
    # visitor cannot run up the bill. Which brands have it at all is the
    # platform's call, per brand: "Build with AI" in the brand's Manage screen.
    COPILOT_STUDIO_MODEL: str = ""
    # How much the model thinks (Claude models that take it): low, medium, high.
    # Low suits a chat that asks and explains; it is also the cheapest.
    COPILOT_STUDIO_EFFORT: str = "low"
    COPILOT_EFFORT: str = "low"
    COPILOT_STUDIO_USER_LIMIT: int = 60
    COPILOT_STUDIO_GUEST_LIMIT: int = 15

    # ── Address suggestions at checkout (api/v1/address.py) ──────────────────
    # Geoapify's free plan: 3,000 requests a day, no card. Blank turns the
    # suggestions off and the address is typed as before.
    GEOAPIFY_API_KEY: str = ""

    @model_validator(mode="after")
    def _apply_resend_from_email(self) -> "Settings":
        if self.RESEND_FROM_EMAIL:
            self.EMAIL_FROM_ADDRESS = self.RESEND_FROM_EMAIL
        return self
    FRONTEND_URL: str = "http://localhost:3000"

    # ── Google Business Profile (brands connect their own Google reviews) ────
    # The platform's own OAuth client. Each brand signs in with the Google
    # account that manages its Business Profile; these identify us, not them.
    # The Google Cloud project must also be approved for the Business Profile
    # APIs — until it is, Google refuses the review calls whatever is set here.
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    # Must match an authorised redirect URI on that OAuth client exactly, e.g.
    # https://api.example.com/api/v1/integrations/google-reviews/callback
    GOOGLE_OAUTH_REDIRECT_URI: str = ""

    # ── AWS S3 ────────────────────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET: str = "afapparel-media"
    AWS_S3_REGION: str = "us-east-1"
    CDN_BASE_URL: str = ""

    # ── Shopify (migration only) ──────────────────────────────────────────────
    SHOPIFY_STORE_DOMAIN: str = ""
    SHOPIFY_ADMIN_API_TOKEN: str = ""

    # ── Brand / notifications ─────────────────────────────────────────────────
    LOGO_URL: str = ""
    # What to call the platform when no brand is in context (system mail).
    PLATFORM_NAME: str = "Wholesale Platform"
    # Fallback ship-from, used only for a brand that has not set its own
    # address. Empty by default: better a clear failure than shipping from
    # some other brand's dock.
    SHIP_FROM_NAME: str = ""
    SHIP_FROM_STREET: str = ""
    SHIP_FROM_CITY: str = ""
    SHIP_FROM_STATE: str = ""
    SHIP_FROM_ZIP: str = ""
    SHIP_FROM_COUNTRY: str = "US"
    SHIP_FROM_PHONE: str = ""
    SHIP_FROM_EMAIL: str = ""
    LOW_STOCK_THRESHOLD: int = 10

    # ── reCAPTCHA ─────────────────────────────────────────────────────────────
    RECAPTCHA_SECRET_KEY: str = ""

    # ── S&S Activewear API ────────────────────────────────────────────────────
    SS_ACCOUNT_NUMBER: str = ""   # Account number from S&S portal
    SS_API_KEY: str = ""          # API key from S&S portal

    # ── ImageKit (media library / image CDN) ──────────────────────────────────
    IMAGEKIT_URL_ENDPOINT: str = ""   # e.g. https://ik.imagekit.io/xxxxxx
    IMAGEKIT_PUBLIC_KEY: str = ""     # public_...
    IMAGEKIT_PRIVATE_KEY: str = ""    # private_...  (secret — .env only)

    # Background removal for the print builders (workers/image-tools, on
    # Cloudflare). The platform pays for this, so there is one key, not one per
    # brand. Left empty, the builders remove backgrounds in the browser instead.
    IMAGE_TOOLS_URL: str = ""         # the Worker's address, no trailing slash
    IMAGE_TOOLS_KEY: str = ""         # signs tickets; the Worker holds the same  (secret — .env only)
    IMAGE_TOOLS_DAILY_CAP: int = 300  # most removals one shop may ask for in a day
    IMAGE_TOOLS_UPSCALE_DAILY_CAP: int = 30  # most AI upscales (done by ImageKit) one shop may ask for in a day

    # ── Sentry ────────────────────────────────────────────────────────────────
    SENTRY_DSN: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
