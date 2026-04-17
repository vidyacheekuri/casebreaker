"""
In-memory state store for CaseBreaker AI V1.

Three dicts + daily_world_cache — no database needed for V1.
Reset behavior: sessions/replay_limits/leaderboard reset at midnight when new case drops.
"""

from typing import Any

from casebreaker.backend.models import SessionState, WorldState

# --- Session state (per player) ---
# key: session_token (UUID), value: SessionState
sessions: dict[str, SessionState] = {}

# --- Replay limits ---
# key: session_token, value: number of replays used today
# Resets naturally at midnight (or on server restart when daily job runs)
replay_limits: dict[str, int] = {}

# --- Daily leaderboard ---
# key: session_token, value: {solve_time_seconds, accusation_count, correct, solved_at}
# Reset when new daily case drops
leaderboard: dict[str, dict[str, Any]] = {}

# --- Today's generated world ---
# Set by APScheduler job at midnight, read by all routes
# Holds complete WorldState for fast access (evaluator, /daily/case)
daily_world_cache: WorldState | None = None
