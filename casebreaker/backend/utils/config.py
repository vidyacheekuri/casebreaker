"""
Configuration and constants for CaseBreaker AI.

Environment variables, thresholds, and constants used across the system.
All .env variables loaded here — .env requires OPENAI_API_KEY only.
"""

import os
from pathlib import Path

# --- Environment ---
# Load from .env in project root (casebreaker/../.env or project root)
_env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
if _env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_path)

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

# --- LLM & Embeddings ---
LLM_MODEL: str = "gpt-4o-mini"
EMBEDDING_MODEL: str = "text-embedding-3-small"

# --- ChromaDB Collections ---
LAYER1_COLLECTION_PREFIX: str = "daily_"
LAYER1_COLLECTION_SUFFIX: str = "_world"
LAYER2_COLLECTION_NAME: str = "literary_corpus"

# --- Thresholds ---
INSTINCT_THRESHOLD: float = 0.75  # Layer 2 RAG — min similarity for Detective's Instinct
MAX_REPLAYS_PER_DAY: int = 1  # Replay limit per session token per day
MAX_CONSISTENCY_RETRIES: int = 5  # Max architect consistency iterations (prevents runaway loops)

# --- Scheduler ---
DAILY_CASE_CRON_HOUR: int = 0
DAILY_CASE_CRON_MINUTE: int = 0
DAILY_CASE_TIMEZONE: str = "UTC"
