"""The trial reminders as a Celery task, for a deployment that runs Celery beat.

Live runs uvicorn only, so the reminders are sent by an in-process loop
(services/trial_notices), which this calls into: one run, wherever it is
scheduled from.
"""
from __future__ import annotations

import asyncio

from app.core.celery import celery_app


@celery_app.task(name="app.tasks.trial_tasks.send_trial_notices")
def send_trial_notices() -> dict:
    """Daily: warn every brand whose trial is nearly over."""
    from app.services.trial_notices import run

    return asyncio.run(run())
