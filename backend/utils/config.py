"""Configuration and shared constants for the new CaseBreaker backend."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_ROOT.parent
GAME_ROOT = REPO_ROOT / "game"
DATA_DIR = BACKEND_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

ENV_PATH = BACKEND_ROOT / ".env"
ENV_FALLBACK_PATHS = [
    ENV_PATH,
    REPO_ROOT / ".env",
    REPO_ROOT / ".env.local",
    GAME_ROOT / ".env.local",
]
for path in ENV_FALLBACK_PATHS:
    if path.exists():
        load_dotenv(path, override=False)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
TRIPO_API_KEY = os.getenv("TRIPO_API_KEY", "")
TRIPO_MANUAL_MODE = os.getenv("TRIPO_MANUAL_MODE", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
TRIPO_REMOTE_ENABLED = os.getenv("TRIPO_REMOTE_ENABLED", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto").strip().lower()

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1-mini")
INTERROGATION_MAX_TOKENS = 160
STORY_GENERATION_MAX_TOKENS = 4000
MAX_GENERATION_RETRIES = 5
DAILY_SLOT_COUNT = 3
TARGET_EVIDENCE_COUNT = 5
LLM_RETRY_ATTEMPTS = 2

INTERROGATION_TIMEOUT_SECONDS = 25
ACCUSATION_TIMEOUT_SECONDS = 25
SESSION_TRANSCRIPT_MAX_TURNS = 120
SESSION_PLAYER_CLAIMS_MAX_ITEMS = 50

DATABASE_PATH = DATA_DIR / "casebreaker.db"
CHROMA_PATH = DATA_DIR / "chroma"
GUTENBERG_CACHE_DIR = DATA_DIR / "gutenberg"
GUTENBERG_CACHE_DIR.mkdir(parents=True, exist_ok=True)
TRIPO_PROMPT_DIR = DATA_DIR / "tripo_prompts"
TRIPO_PROMPT_DIR.mkdir(parents=True, exist_ok=True)

WORLD_COLLECTION_PREFIX = "world_"
LITERARY_COLLECTION_NAME = "literary_corpus"
NOVELTY_DIMENSIONS = 96
NOVELTY_DISTANCE_THRESHOLD = 0.30
LITERARY_MATCH_THRESHOLD = 0.75

SCHEDULER_HOUR_UTC = 0
SCHEDULER_MINUTE_UTC = 0

DEFAULT_SETTINGS = [
    "storm-lashed manor on the Devon coast",
    "1920s country house outside London",
    "small-town railway hotel during heavy rain",
    "snowbound alpine retreat with wealthy guests",
    "foggy riverside archive with a locked records room",
    "postwar boarding school preparing for inspection",
]

DEFAULT_MOODS = [
    "brooding",
    "elegant",
    "claustrophobic",
    "tense",
    "gothic",
    "melancholic",
]

DEFAULT_DIFFICULTY = "medium"
