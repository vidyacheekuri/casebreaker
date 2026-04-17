"""
REST API routes for CaseBreaker AI.

Endpoints per spec:
- GET /daily/case
- POST /session/start
- POST /session/{token}/interrogate
- POST /session/{token}/examine
- POST /session/{token}/accuse
- GET /session/{token}/replay
- POST /session/{token}/replay
- GET /leaderboard/today
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from casebreaker.backend.api import state_store
from casebreaker.backend.models import SessionState, DetectiveInstinct
from casebreaker.backend.agents.character import interrogate
from casebreaker.backend.agents.evaluator import evaluate_accusation
from casebreaker.backend.utils.config import MAX_REPLAYS_PER_DAY

router = APIRouter()


# --- Request/Response models ---
class SessionStartResponse(BaseModel):
    session_token: str


class InterrogateRequest(BaseModel):
    character_id: str
    message: str


class InterrogateResponse(BaseModel):
    response: str
    character_name: str
    detective_instinct: DetectiveInstinct | None = None
    session_state_summary: dict


class ExamineRequest(BaseModel):
    evidence_id: str


class ExamineResponse(BaseModel):
    description: str
    observations: str
    detective_instinct: DetectiveInstinct | None = None


class AccuseRequest(BaseModel):
    character_id: str
    reasoning: str


class AccuseResponse(BaseModel):
    correct: bool
    explanation: str
    missed_clues: list[str]
    true_sequence: str
    solve_time_seconds: int


class ReplayCheckResponse(BaseModel):
    can_replay: bool
    replays_used: int


class LeaderboardEntry(BaseModel):
    session_token: str
    solve_time_seconds: int
    accusation_count: int
    correct: bool


# --- Helpers ---
def _get_session(token: str) -> SessionState:
    if token not in state_store.sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return state_store.sessions[token]


def _session_summary(session: SessionState) -> dict:
    return {
        "suspects_interrogated": session.suspects_interrogated,
        "evidence_examined": session.evidence_examined,
        "accusation_made": session.accusation_made,
    }


# --- Routes ---
@router.get("/daily/case")
def get_daily_case():
    """Returns today's case summary — first call frontend makes on load."""
    world = state_store.daily_world_cache
    if not world:
        raise HTTPException(status_code=503, detail="No active case. Try again shortly.")
    victim = world.victim
    if isinstance(victim, dict):
        victim_name = victim.get("name", "")
        cause = victim.get("cause_of_death", "")
    else:
        victim_name = victim.name
        cause = victim.cause_of_death
    return {
        "case_date": world.case_date,
        "world_summary": f"{world.setting} — {victim_name} — {cause}",
        "suspects": [{"character_id": c.character_id, "name": c.name} for c in world.characters],
        "evidence": [{"evidence_id": e.evidence_id, "name": e.name} for e in world.evidence],
    }


@router.post("/session/start", response_model=SessionStartResponse)
def session_start():
    """Create new session, return UUID token."""
    world = state_store.daily_world_cache
    if not world:
        raise HTTPException(status_code=503, detail="No active case.")
    token = str(uuid.uuid4())
    state_store.sessions[token] = SessionState(
        session_token=token,
        case_date=world.case_date,
        session_start_time=datetime.now(timezone.utc).isoformat(),
    )
    return SessionStartResponse(session_token=token)


@router.post("/session/{token}/interrogate", response_model=InterrogateResponse)
def session_interrogate(token: str, body: InterrogateRequest):
    """Interrogate a suspect."""
    session = _get_session(token)
    world = state_store.daily_world_cache
    if not world:
        raise HTTPException(status_code=503, detail="No active case.")
    response, char_name, instinct = interrogate(body.character_id, body.message, session)
    if body.character_id not in session.suspects_interrogated:
        session.suspects_interrogated.append(body.character_id)
    return InterrogateResponse(
        response=response,
        character_name=char_name,
        detective_instinct=instinct,
        session_state_summary=_session_summary(session),
    )


@router.post("/session/{token}/examine", response_model=ExamineResponse)
def session_examine(token: str, body: ExamineRequest):
    """Examine a piece of evidence."""
    session = _get_session(token)
    world = state_store.daily_world_cache
    if not world:
        raise HTTPException(status_code=503, detail="No active case.")
    ev = next((e for e in world.evidence if e.evidence_id == body.evidence_id), None)
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found.")
    if body.evidence_id not in session.evidence_examined:
        session.evidence_examined.append(body.evidence_id)
    from casebreaker.backend.rag.literary_retriever import retrieve_detective_instinct

    instinct = retrieve_detective_instinct(f"Examining evidence: {ev.name}. {ev.description}")
    return ExamineResponse(
        description=ev.description,
        observations=ev.location,
        detective_instinct=instinct,
    )


@router.post("/session/{token}/accuse", response_model=AccuseResponse)
def session_accuse(token: str, body: AccuseRequest):
    """Make final accusation."""
    session = _get_session(token)
    session.accusation_made = True
    result = evaluate_accusation(body.character_id, body.reasoning, session)
    session.accusation_correct = result["correct"]
    session.solve_time_seconds = result["solve_time_seconds"]

    acc_count = state_store.leaderboard.get(token, {}).get("accusation_count", 0) + 1
    state_store.leaderboard[token] = {
        "solve_time_seconds": result["solve_time_seconds"],
        "accusation_count": acc_count,
        "correct": result["correct"],
        "solved_at": datetime.now(timezone.utc).isoformat(),
    }
    return AccuseResponse(
        correct=result["correct"],
        explanation=result["explanation"],
        missed_clues=result["missed_clues"],
        true_sequence=result["true_sequence"],
        solve_time_seconds=result["solve_time_seconds"],
    )


@router.get("/session/{token}/replay", response_model=ReplayCheckResponse)
def session_replay_check(token: str):
    """Check if token can replay."""
    used = state_store.replay_limits.get(token, 0)
    return ReplayCheckResponse(
        can_replay=used < MAX_REPLAYS_PER_DAY,
        replays_used=used,
    )


@router.post("/session/{token}/replay")
def session_replay(token: str):
    """Reset session for same case, fresh investigation."""
    used = state_store.replay_limits.get(token, 0)
    if used >= MAX_REPLAYS_PER_DAY:
        raise HTTPException(status_code=403, detail="Replay limit reached.")
    world = state_store.daily_world_cache
    if not world:
        raise HTTPException(status_code=503, detail="No active case.")
    state_store.replay_limits[token] = used + 1
    victim = world.victim
    v_name = victim.get("name", "") if isinstance(victim, dict) else victim.name
    v_cod = victim.get("cause_of_death", "") if isinstance(victim, dict) else victim.cause_of_death
    state_store.sessions[token] = SessionState(
        session_token=token,
        case_date=world.case_date,
        session_start_time=datetime.now(timezone.utc).isoformat(),
    )
    return {
        "session_token": token,
        "world_summary": f"{world.setting} — {v_name} — {v_cod}",
    }


@router.get("/leaderboard/today")
def leaderboard_today():
    """Top 10 solvers for today's case."""
    entries = [
        {
            "session_token": k,
            "solve_time_seconds": v.get("solve_time_seconds", 0),
            "accusation_count": v.get("accusation_count", 0),
            "correct": v.get("correct", False),
        }
        for k, v in state_store.leaderboard.items()
        if v.get("correct")
    ]
    entries.sort(key=lambda x: (x["solve_time_seconds"], x["accusation_count"]))
    return {"leaderboard": entries[:10]}
