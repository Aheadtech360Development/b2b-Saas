"""Collections: a named group of products, chosen by hand or by rule.

The admin already had a "Collections" screen, but it edited categories — one
flat list a product is filed under. A collection is a different thing: a
product belongs to many, and an automatic one is a *question* ("everything
tagged summer under $30") rather than a list somebody maintains.

Membership of an automatic collection is never stored. The rules are turned
into a query when the collection is read, so editing a product's price or tags
changes what it belongs to immediately — no sync job, nothing to fall behind,
and no table that can disagree with the products it describes.

`collection_products` holds only what a person picked by hand, which is the one
part that genuinely is a list.

Revision ID: 0044_collections
Revises: 0043_audit_hardening
"""
from alembic import op

revision = "0044_collections"
down_revision = "0043_audit_hardening"
branch_labels = None
depends_on = None

_PRED = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS collections (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    UUID,
            name         VARCHAR(200) NOT NULL,
            slug         VARCHAR(200) NOT NULL,
            description  TEXT,
            image_url    VARCHAR(1000),
            -- 'manual'    → exactly the products somebody picked
            -- 'automatic' → whatever currently answers the rules
            match_type   VARCHAR(12) NOT NULL DEFAULT 'manual',
            -- 'all' (every rule must hold) or 'any' (one is enough)
            rules_match  VARCHAR(4) NOT NULL DEFAULT 'all',
            rules        JSONB NOT NULL DEFAULT '[]'::jsonb,
            -- How the products read on the storefront.
            sort_by      VARCHAR(30) NOT NULL DEFAULT 'manual',
            is_active    BOOLEAN NOT NULL DEFAULT true,
            published_at TIMESTAMPTZ,
            position     INTEGER NOT NULL DEFAULT 0,
            seo_title       VARCHAR(255),
            seo_description VARCHAR(500),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    # A slug is a URL, and a brand's URLs are its own — two brands may both
    # have /collections/summer. Unique per brand, never across the platform;
    # see 0027/0028/0042 for the same mistake made three times before.
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_collections_tenant_slug
        ON collections(tenant_id, slug)
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_collections_tenant ON collections(tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_collections_active ON collections(is_active)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS collection_products (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id     UUID,
            collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
            product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            position      INTEGER NOT NULL DEFAULT 0,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_collection_products_pair
        ON collection_products(collection_id, product_id)
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_collection_products_product ON collection_products(product_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_collection_products_tenant ON collection_products(tenant_id)")

    for table in ("collections", "collection_products"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING {_PRED} WITH CHECK {_PRED}")
        op.execute(f"""
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
                GRANT ALL PRIVILEGES ON {table} TO app_rls;
              END IF;
            END $$;
        """)

    # Rules commonly ask about tags and price; these make that cheap.
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_tags ON products USING GIN (tags)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_type_vendor ON products(product_type, vendor)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS collection_products")
    op.execute("DROP TABLE IF EXISTS collections")
    op.execute("DROP INDEX IF EXISTS ix_products_type_vendor")
    op.execute("DROP INDEX IF EXISTS ix_products_tags")
