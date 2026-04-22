"""FastAPI entrypoint for the new CaseBreaker backend."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from api.routes import router
from db.database import connect, init_db
from models.session import GenerationStatus
from rag.literary_embedder import ensure_default_literary_corpus
from scheduler.daily_job import run_generation_job
from utils.config import SCHEDULER_HOUR_UTC, SCHEDULER_MINUTE_UTC


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB, seed literary corpus, and start the scheduler."""
    db = await connect()
    await init_db(db)
    app.state.db = db
    app.state.generation_lock = asyncio.Lock()
    app.state.generation_task = None
    app.state.generation_status = GenerationStatus(status="idle")

    ensure_default_literary_corpus()

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        run_generation_job,
        "cron",
        hour=SCHEDULER_HOUR_UTC,
        minute=SCHEDULER_MINUTE_UTC,
        args=[app],
        id="generate-daily-slots",
        replace_existing=True,
    )
    scheduler.start()
    app.state.scheduler = scheduler

    try:
        yield
    finally:
        scheduler.shutdown(wait=False)
        await db.close()


app = FastAPI(
    title="CaseBreaker Backend",
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(router)
