"""Celery configuration for AF Apparels platform."""
import os

# ── Broker / Backend ──────────────────────────────────────────────────────────
broker_url = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
result_backend = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

# ── Serialization ─────────────────────────────────────────────────────────────
task_serializer = "json"
result_serializer = "json"
accept_content = ["json"]
result_expires = 3600  # 1 hour

# ── Timezone ──────────────────────────────────────────────────────────────────
timezone = "UTC"
enable_utc = True

# ── Task routing ──────────────────────────────────────────────────────────────
task_routes = {
    "app.tasks.email_tasks.*": {"queue": "email"},
    "app.tasks.quickbooks_tasks.*": {"queue": "quickbooks"},
    "app.tasks.pricelist_tasks.*": {"queue": "pricelist"},
    "app.tasks.inventory_tasks.*": {"queue": "inventory"},
    "app.tasks.cart_tasks.*": {"queue": "default"},
    "app.tasks.supplier_sync_tasks.*": {"queue": "supplier"},
}

# ── Worker settings ───────────────────────────────────────────────────────────
worker_prefetch_multiplier = 1
task_acks_late = True
worker_max_tasks_per_child = 500

# ── Retry defaults ────────────────────────────────────────────────────────────
task_default_retry_delay = 60  # seconds
task_max_retries = 5

# ── Beat schedule (periodic tasks) ───────────────────────────────────────────
from celery.schedules import crontab  # noqa: E402

beat_schedule = {
    "detect-abandoned-carts": {
        "task": "app.tasks.cart_tasks.detect_abandoned_carts",
        "schedule": crontab(hour="*/1"),  # every hour
    },
    "check-low-stock": {
        "task": "app.tasks.inventory_tasks.check_low_stock_levels",
        "schedule": crontab(hour="6", minute="0"),  # daily at 6am UTC
    },
    # ── S&S Activewear sync ───────────────────────────────────────────────────
    "ss-sync-inventory": {
        "task": "app.tasks.supplier_sync_tasks.sync_ss_inventory",
        "schedule": crontab(minute="*/15"),  # every 15 min — inventory only
    },
    "ss-sync-products": {
        "task": "app.tasks.supplier_sync_tasks.sync_ss_products",
        "schedule": crontab(hour="*/6", minute="0"),  # every 6 h — product batch
    },
    "ss-sync-categories": {
        "task": "app.tasks.supplier_sync_tasks.sync_ss_categories",
        "schedule": crontab(hour="2", minute="0"),  # daily at 02:00 UTC
    },
}
