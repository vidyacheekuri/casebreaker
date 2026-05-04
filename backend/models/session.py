"""Session and daily-slot response models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .world import CaseRecipe, Character, Evidence, GenerationSources, InvestigationRoom, Victim


class DetectiveInstinct(BaseModel):
    """Player-facing literary retrieval snippet."""

    model_config = ConfigDict(extra="forbid")

    quote: str
    source_title: str
    source_author: str
    trigger: str


class SessionState(BaseModel):
    """Per-player session state."""

    model_config = ConfigDict(extra="forbid")

    session_id: str
    slot_id: str
    case_date: str
    suspects_interrogated: list[str] = Field(default_factory=list)
    evidence_examined: list[str] = Field(default_factory=list)
    player_claims: list[str] = Field(default_factory=list)
    contradictions_found: list[str] = Field(default_factory=list)
    suspicion_scores: dict[str, float] = Field(default_factory=dict)
    instincts_shown: list[str] = Field(default_factory=list)
    accusation_made: bool = False
    accusation_correct: bool | None = None
    solve_time_seconds: int | None = None
    session_start_time: str = Field(
        default_factory=lambda: datetime.utcnow().isoformat()
    )


class DailySlot(BaseModel):
    """Published mystery slot returned to the frontend."""

    model_config = ConfigDict(extra="forbid")

    slot_id: str
    slot_index: int
    case_date: str
    generated_at: str
    expires_at: str
    title: str
    summary: str
    mood: str
    setting: str
    backstory: str = ""
    crime_scene_detail: str = ""
    stakes: str = ""
    timeline_context: str = ""
    victim: Victim
    suspects: list[Character]
    evidence: list[Evidence]
    rooms: list[InvestigationRoom] = Field(default_factory=list)
    timeline: list[dict] = Field(default_factory=list)
    case_recipe: CaseRecipe | None = None
    generation_sources: GenerationSources | None = None
    world_collection: str


class DailyKeyword(BaseModel):
    """One keyword chip extracted from today's published stories."""

    model_config = ConfigDict(extra="forbid")

    keyword_id: str
    label: str
    category: str
    slot_scores: dict[str, float] = Field(default_factory=dict)


class DailySlotsResponse(BaseModel):
    """Response body for GET /daily-slots."""

    model_config = ConfigDict(extra="forbid")

    slots: list[DailySlot]
    daily_keywords: list[DailyKeyword] = Field(default_factory=list)
    generated_at: str | None = None
    expires_at: str | None = None


class DailySlotsMatchRequest(BaseModel):
    """Request body for POST /daily-slots/match."""

    model_config = ConfigDict(extra="forbid")

    selected_keyword_ids: list[str] = Field(min_length=1, max_length=4)


class DailySlotsMatchResponse(BaseModel):
    """Response body for POST /daily-slots/match."""

    model_config = ConfigDict(extra="forbid")

    matched_slot_id: str
    matched_slot_index: int
    matched_title: str
    matched_summary: str
    matched_score: float
    score_breakdown: dict[str, float] = Field(default_factory=dict)
    matched_keyword_labels: list[str] = Field(default_factory=list)


class GenerationStatus(BaseModel):
    """Tracks background daily-slot generation state."""

    model_config = ConfigDict(extra="forbid")

    status: str
    started_at: str | None = None
    finished_at: str | None = None
    generated_at: str | None = None
    expires_at: str | None = None
    error: str | None = None


class AdminGenerationResponse(BaseModel):
    """Response body for async admin generation trigger."""

    model_config = ConfigDict(extra="forbid")

    message: str
    generation: GenerationStatus


class InterrogationTurn(BaseModel):
    """One persisted turn of the interrogation transcript."""

    model_config = ConfigDict(extra="forbid")

    character_id: str
    speaker: str
    text: str
    tone: str | None = None
    timestamp: str


class SessionStartRequest(BaseModel):
    """Request body for POST /sessions/start."""

    model_config = ConfigDict(extra="forbid")

    slot_id: str


class SessionStartResponse(BaseModel):
    """Response body for POST /sessions/start."""

    model_config = ConfigDict(extra="forbid")

    session_id: str
    slot_id: str
    case_date: str
    started_at: str


class InterrogateRequest(BaseModel):
    """Request body for POST /sessions/{id}/interrogate."""

    model_config = ConfigDict(extra="forbid")

    character_id: str
    message: str = Field(min_length=1, max_length=600)


class InterrogateResponse(BaseModel):
    """Response body for POST /sessions/{id}/interrogate."""

    model_config = ConfigDict(extra="forbid")

    session_id: str
    character_id: str
    character_name: str
    reply: str
    tone: str
    detective_instinct: DetectiveInstinct | None = None


class SessionStateResponse(BaseModel):
    """Response body for GET /sessions/{id}/state."""

    model_config = ConfigDict(extra="forbid")

    session_id: str
    slot_id: str
    started_at: str
    state: SessionState
    transcript: list[InterrogationTurn] = Field(default_factory=list)


class AccuseRequest(BaseModel):
    """Request body for POST /sessions/{id}/accuse."""

    model_config = ConfigDict(extra="forbid")

    character_id: str
    reasoning: str = Field(default="", max_length=1200)


class AccuseResponse(BaseModel):
    """Response body for POST /sessions/{id}/accuse."""

    model_config = ConfigDict(extra="forbid")

    session_id: str
    correct: bool
    accused_id: str
    accused_name: str
    killer_id: str
    killer_name: str
    verdict_summary: str
    missed_clues: list[str] = Field(default_factory=list)
    solve_time_seconds: int | None = None
