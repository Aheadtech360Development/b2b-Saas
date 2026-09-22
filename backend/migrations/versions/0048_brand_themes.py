"""A brand's own website theme, and what its admin has edited in it.

The design arrives as an HTML file built for that client. It is parsed once
into a `definition`: the pages it contains, the sections of each page, and the
text, images and links inside each section that somebody may edit. The design
itself is never edited by hand afterwards — the admin edits values.

`draft` is what the customizer saves (section order, hidden sections, and the
values), `published` is what shoppers get. A brand with no published theme
keeps the storefront it has today, so importing a theme changes nothing until
somebody presses Publish.

Revision ID: 0048_brand_themes
Revises: 0047_product_templates
"""
from alembic import op

revision = "0048_brand_themes"
down_revision = "0047_product_templates"
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
        CREATE TABLE IF NOT EXISTS brand_themes (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    UUID,
            name         VARCHAR(160) NOT NULL,
            -- The parsed design: {"css": "...", "pages": {...}} — see
            -- services/theme_import.py. Replaced only by re-importing.
            definition   JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- What the customizer saved: order, hidden sections, field values.
            draft        JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- The same shape, as shoppers see it; NULL until first published.
            published    JSONB,
            published_at TIMESTAMPTZ,
            -- Only one theme runs a brand's storefront at a time.
            is_active    BOOLEAN NOT NULL DEFAULT true,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_brand_themes_tenant ON brand_themes(tenant_id)")
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_themes_active
        ON brand_themes(tenant_id) WHERE is_active
    """)

    op.execute("ALTER TABLE brand_themes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE brand_themes FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON brand_themes")
    op.execute(f"CREATE POLICY tenant_isolation ON brand_themes USING {_PRED} WITH CHECK {_PRED}")
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
            GRANT ALL PRIVILEGES ON brand_themes TO app_rls;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS brand_themes")
