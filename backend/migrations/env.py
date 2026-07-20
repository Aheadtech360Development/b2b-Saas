# backend/migration/env.py

"""Alembic migration environment — synchronous."""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.models.base import Base

# Import ALL models so Base.metadata is complete for autogenerate.
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
import app.models.discount  # noqa: F401
import app.models.discount_group  # noqa: F401
import app.models.purchase_order  # noqa: F401
import app.models.statement  # noqa: F401
import app.models.supplier  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.sync_db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Tables managed outside the ORM (raw SQL in the baseline / startup). Autogenerate
# must NOT try to create or drop these — they have no SQLAlchemy models.
_IGNORE_TABLES = {
    "alembic_version",
    "tenants", "tenant_branding", "tenant_feature_flags",
    "tenant_subscriptions", "tenant_staff_roles", "tenant_api_keys", "audit_logs",
    "style_sheets", "product_specs", "page_seo", "blog_posts", "app_settings",
    "tenant_pages", "contact_submissions", "tenant_menus",
    # S&S supplier catalog — schema managed by the sync, not app migrations.
    "ss_categories", "ss_products", "ss_variants", "ss_markup_rules", "ss_sync_logs",
}


def _include_object(obj, name, type_, reflected, compare_to):
    """Filter what autogenerate compares (both model + reflected sides)."""
    # Exclude platform / externally-managed tables entirely (and their children).
    if type_ == "table" and name in _IGNORE_TABLES:
        return False
    table_name = getattr(getattr(obj, "table", None), "name", None)
    if type_ in ("column", "index", "unique_constraint", "foreign_key_constraint") and table_name in _IGNORE_TABLES:
        return False
    # tenant_id FK constraints live in the baseline (tenants has no ORM model);
    # the raw-SQL users table also has a differently-named tenant FK.
    if type_ == "foreign_key_constraint" and name and (
        (name.startswith("fk_") and name.endswith("_tenant")) or "tenant_id_fkey" in name
    ):
        return False
    # Legacy raw-SQL `users` table: index/unique-constraint naming differs from
    # SQLAlchemy conventions (cosmetic only; fresh DBs built from the model are
    # clean). Columns are still tracked.
    if table_name == "users" and type_ in ("index", "unique_constraint"):
        return False
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
                include_object=_include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()