"""
FastAPI application entry point for CaseBreaker AI.

Starts scheduler on startup. No GPU, no database — in-memory state only.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from casebreaker.backend.api.routes import router
from casebreaker.backend.scheduler.daily_job import generate_daily_case
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from casebreaker.backend.utils.config import (
    DAILY_CASE_CRON_HOUR,
    DAILY_CASE_CRON_MINUTE,
    DAILY_CASE_TIMEZONE,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start scheduler and optionally trigger initial case generation."""
    scheduler.add_job(
        generate_daily_case,
        "cron",
        hour=DAILY_CASE_CRON_HOUR,
        minute=DAILY_CASE_CRON_MINUTE,
        timezone=DAILY_CASE_TIMEZONE,
    )
    scheduler.start()
    logger.info("Scheduler started — daily case at midnight UTC")

    # Generate initial case if none exists (for first run / dev)
    from casebreaker.backend.api.state_store import daily_world_cache

    if daily_world_cache is None:
        logger.info("No cached world — generating initial case...")
        await generate_daily_case()

    yield
    scheduler.shutdown()


app = FastAPI(
    title="CaseBreaker AI",
    description="Agentic Narrative Intelligence for Interactive Mystery Solving",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
