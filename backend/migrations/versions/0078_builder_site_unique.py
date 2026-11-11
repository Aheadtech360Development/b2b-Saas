"""One website builder site per brand, kept by the database.

0056 made builder_sites with UNIQUE (tenant_id), but only when it created the
table: a database whose tables were first made from the models (create_all,
migrate_tenant.py) has no such rule, and two first openings of the builder at
the same moment could each make a site for one brand. The rule is added where
it is missing.

Nothing is deleted. Should a brand already have two sites, the rule is not
added (the brands are named in the output), and the app reads the same one
of the two everywhere (services/builder/site._the_one) until they are joined
by hand.

Revision ID: 0078_builder_site_unique
Revises: 0077_product_designer
"""
import sqlalchemy as sa
from alembic import op

revision = "0078_builder_site_unique"
down_revision = "0077_product_designer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    has_rule = conn.execute(sa.text(
        "SELECT 1 FROM pg_constraint WHERE conrelid = 'builder_sites'::regclass AND contype = 'u' "
        "AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'builder_sites'::regclass AND attname = 'tenant_id')]::smallint[]"
    )).first()
    if has_rule:
        return
    # Row security does not hide rows from this check: no brand is set on this connection.
    twice = conn.execute(sa.text(
        "SELECT CAST(tenant_id AS text) FROM builder_sites GROUP BY tenant_id HAVING count(*) > 1"
    )).fetchall()
    if twice:
        print("0078: one-site-per-brand rule NOT added; brands with two builder sites: "
              + ", ".join(r[0] for r in twice))
        return
    op.execute("ALTER TABLE builder_sites ADD CONSTRAINT uq_builder_sites_tenant UNIQUE (tenant_id)")


def downgrade() -> None:
    # Only the rule this migration may have added; 0056's own stays with 0056.
    pass
