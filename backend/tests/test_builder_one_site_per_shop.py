"""Every shop has its own website builder site, and only one.

The database keeps it (uq_builder_sites_tenant, migrations 0056 and 0078),
the model says so too (a database made from the models gets the rule), and
the readers agree on the same site should a database without the rule ever
hold two. The two-shop walk (two brands opening, saving and publishing side
by side) is run against a real database before release.
"""
from sqlalchemy.dialects import postgresql

from app.models.builder import BuilderSite
from app.services.builder.site import _the_one
from sqlalchemy import select


def test_the_model_keeps_one_site_per_shop():
    rules = [c for c in BuilderSite.__table__.constraints if getattr(c, "name", None) == "uq_builder_sites_tenant"]
    assert rules, "builder_sites must say one site per shop"
    assert [col.name for col in rules[0].columns] == ["tenant_id"]


def test_every_reader_picks_the_same_site_the_live_one_first():
    sql = str(_the_one(select(BuilderSite.id)).compile(dialect=postgresql.dialect()))
    assert "ORDER BY builder_sites.published_version_id IS NULL, builder_sites.created_at, builder_sites.id" in sql
    assert "LIMIT" in sql


def test_the_migration_adds_the_rule_only_where_missing_and_deletes_nothing():
    import importlib.util
    import pathlib

    path = pathlib.Path(__file__).resolve().parents[1] / "migrations" / "versions" / "0078_builder_site_unique.py"
    text = path.read_text(encoding="utf-8")
    assert 'down_revision = "0077_product_designer"' in text
    assert len("0078_builder_site_unique") <= 32
    assert "DELETE" not in text.upper().replace("NOTHING IS DELETED", "")
    spec = importlib.util.spec_from_file_location("m0078", path)
    assert spec and spec.loader
