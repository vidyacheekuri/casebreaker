"""
Daily Job — APScheduler midnight trigger for world generation.

Runs once per day at midnight UTC:
1. Generate new WorldState via Architect
2. Delete previous day's ChromaDB collection
3. Embed world into Layer 1
4. Update daily_world_cache
5. Reset leaderboard and replay_limits
"""

import logging
from datetime import datetime, timezone, timedelta

from casebreaker.backend.agents.architect import generate_world
from casebreaker.backend.rag.chroma_client import get_chroma_client
from casebreaker.backend.rag.world_embedder import embed_world
from casebreaker.backend.api import state_store

logger = logging.getLogger(__name__)


def _collection_name_for_date(date_str: str) -> str:
    """Convert YYYY-MM-DD to daily_YYYY_MM_DD_world."""
    return f"daily_{date_str.replace('-', '_')}_world"


async def generate_daily_case() -> None:
    """
    Generate the daily mystery case. Called by APScheduler at midnight UTC.

    Steps:
    1. Run Mystery Architect agent
    2. Delete previous day's ChromaDB collection
    3. Embed world into Layer 1
    4. Update state_store.daily_world_cache
    5. Reset state_store.leaderboard and replay_limits
    """
    now = datetime.now(timezone.utc)
    case_date = now.strftime("%Y-%m-%d")
    prev_dt = now - timedelta(days=1)
    prev_date = prev_dt.strftime("%Y-%m-%d")

    logger.info(f"Generating daily case for {case_date}...")

    # 1. Generate world (Architect + consistency check)
    world = generate_world(
        setting="Victorian manor",
        difficulty="medium",
        case_date=case_date,
    )

    # 2. Delete previous day's collection
    try:
        client = get_chroma_client()
        prev_collection = _collection_name_for_date(prev_date)
        client.delete_collection(name=prev_collection)
        logger.info(f"Deleted previous collection: {prev_collection}")
    except Exception as e:
        logger.warning(f"Could not delete previous collection: {e}")

    # 3. Embed world into Layer 1
    embed_world(world)

    # 4. Update cache
    state_store.daily_world_cache = world

    # 5. Reset leaderboard and replay limits
    state_store.leaderboard = {}
    state_store.replay_limits = {}

    logger.info(f"Daily case generated for {case_date}")
