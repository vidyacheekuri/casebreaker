"""
Session state and Detective's Instinct models for CaseBreaker AI.

- SessionState: Per-player state tracked in FastAPI memory (keyed by session_token)
- DetectiveInstinct: Layer 2 RAG output — literary quote surfaced to player

Used by: Character agent (session context), Evaluator, API routes, Layer 2 RAG
"""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class DetectiveInstinct(BaseModel):
    """
    Layer 2 RAG output — retrieved literary passage shown as Detective's Instinct card.

    Created by: literary_retriever when similarity >= INSTINCT_THRESHOLD
    Displayed in: DetectiveInstinct.jsx component in ChatWindow
    """

    model_config = ConfigDict(extra="forbid")

    quote: str = Field(
        ..., description="Retrieved passage from literary corpus"
    )
    source_title: str = Field(..., description="Book title")
    source_author: str = Field(..., description="Author name")
    trigger: str = Field(
        ...,
        description="What player action triggered this retrieval",
    )


class SessionState(BaseModel):
    """
    Per-player session state stored in FastAPI memory.

    Key: session_token (UUID)
    Value: This model
    Stored in: state_store.sessions dict
    Reset: On replay (same case, fresh investigation) or at midnight (new case)
    """

    model_config = ConfigDict(extra="forbid")

    session_token: str = Field(
        ..., description="UUID — player's identity for this day"
    )
    case_date: str = Field(
        ..., description="Which day's case this session is for"
    )
    suspects_interrogated: list[str] = Field(default_factory=list)
    evidence_examined: list[str] = Field(default_factory=list)
    player_claims: list[str] = Field(default_factory=list)
    contradictions_found: list[str] = Field(default_factory=list)
    suspicion_scores: dict[str, float] = Field(default_factory=dict)
    instincts_shown: list[str] = Field(
        default_factory=list,
        description="Track which instinct quotes/IDs were surfaced",
    )
    accusation_made: bool = False
    accusation_correct: bool | None = None
    solve_time_seconds: int | None = None
    session_start_time: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat()
    )
