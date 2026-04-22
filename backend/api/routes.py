"""Phase 1 backend routes."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from agents.character import interrogate_suspect
from agents.evaluator import evaluate_accusation
from db.database import (
    fetch_daily_keywords,
    fetch_session,
    fetch_today_slots,
    fetch_world_by_slot_id,
    insert_session,
    update_session,
)
from models.session import (
    AccuseRequest,
    AccuseResponse,
    AdminGenerationResponse,
    DailySlotsMatchRequest,
    DailySlotsMatchResponse,
    DailySlotsResponse,
    DetectiveInstinct,
    GenerationStatus,
    InterrogateRequest,
    InterrogateResponse,
    InterrogationTurn,
    SessionStartRequest,
    SessionStartResponse,
    SessionState,
    SessionStateResponse,
)
from scheduler.daily_job import run_generation_job
from utils.config import (
    ACCUSATION_TIMEOUT_SECONDS,
    INTERROGATION_TIMEOUT_SECONDS,
    SESSION_PLAYER_CLAIMS_MAX_ITEMS,
    SESSION_TRANSCRIPT_MAX_TURNS,
)

router = APIRouter()


@router.get("/health")
async def healthcheck() -> dict:
    """Simple backend health endpoint."""
    return {"status": "ok"}


@router.post(
    "/admin/generate-daily-slots",
    response_model=AdminGenerationResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def admin_generate_daily_slots(request: Request) -> AdminGenerationResponse:
    """Kick off daily-slot generation in the background."""
    if request.app.state.generation_lock.locked():
        return AdminGenerationResponse(
            message="Daily slot generation is already running.",
            generation=request.app.state.generation_status,
        )

    queued_status = GenerationStatus(
        status="queued",
        started_at=datetime.now(timezone.utc).isoformat(),
    )
    request.app.state.generation_status = queued_status
    task = asyncio.create_task(run_generation_job(request.app))
    request.app.state.generation_task = task
    return AdminGenerationResponse(
        message="Daily slot generation started in the background.",
        generation=queued_status,
    )


@router.get(
    "/admin/generate-daily-slots/status",
    response_model=GenerationStatus,
)
async def get_generation_status(request: Request) -> GenerationStatus:
    """Return current background generation status."""
    return request.app.state.generation_status


@router.get("/daily-slots", response_model=DailySlotsResponse)
async def get_daily_slots(request: Request) -> DailySlotsResponse:
    """Return the currently published daily slots for the UTC day."""
    case_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slots, keywords = await asyncio.gather(
        fetch_today_slots(request.app.state.db, case_date),
        fetch_daily_keywords(request.app.state.db, case_date),
    )
    if not slots:
        raise HTTPException(
            status_code=404,
            detail="No daily slots have been generated for today yet.",
        )
    return DailySlotsResponse(
        slots=slots,
        daily_keywords=keywords,
        generated_at=slots[0].generated_at,
        expires_at=slots[0].expires_at,
    )


@router.post("/daily-slots/match", response_model=DailySlotsMatchResponse)
async def match_daily_slot(
    payload: DailySlotsMatchRequest,
    request: Request,
) -> DailySlotsMatchResponse:
    """Match selected keyword chips to the best-fit published slot."""
    case_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slots, keywords = await asyncio.gather(
        fetch_today_slots(request.app.state.db, case_date),
        fetch_daily_keywords(request.app.state.db, case_date),
    )
    if not slots:
        raise HTTPException(
            status_code=404,
            detail="No daily slots have been generated for today yet.",
        )
    if not keywords:
        raise HTTPException(
            status_code=404,
            detail="No daily keywords are available for today yet.",
        )

    keyword_map = {keyword.keyword_id: keyword for keyword in keywords}
    unknown_ids = [
        keyword_id
        for keyword_id in payload.selected_keyword_ids
        if keyword_id not in keyword_map
    ]
    if unknown_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown keyword ids: {', '.join(unknown_ids)}",
        )

    slot_scores = {slot.slot_id: 0.0 for slot in slots}
    matched_labels: list[str] = []
    for keyword_id in payload.selected_keyword_ids:
        keyword = keyword_map[keyword_id]
        matched_labels.append(keyword.label)
        for slot_id, score in keyword.slot_scores.items():
            if slot_id in slot_scores:
                slot_scores[slot_id] += float(score)

    ranked_slots = sorted(
        slots,
        key=lambda slot: (-slot_scores.get(slot.slot_id, 0.0), slot.slot_index),
    )
    best_slot = ranked_slots[0]
    best_score = round(slot_scores.get(best_slot.slot_id, 0.0), 3)

    return DailySlotsMatchResponse(
        matched_slot_id=best_slot.slot_id,
        matched_slot_index=best_slot.slot_index,
        matched_title=best_slot.title,
        matched_summary=best_slot.summary,
        matched_score=best_score,
        score_breakdown={
            slot.slot_id: round(slot_scores.get(slot.slot_id, 0.0), 3)
            for slot in sorted(slots, key=lambda item: item.slot_index)
        },
        matched_keyword_labels=matched_labels,
    )


@router.post(
    "/sessions/start",
    response_model=SessionStartResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_session(
    payload: SessionStartRequest,
    request: Request,
) -> SessionStartResponse:
    """Start a new detective session for a published slot."""
    world = await fetch_world_by_slot_id(request.app.state.db, payload.slot_id)
    if world is None:
        raise HTTPException(status_code=404, detail=f"Unknown slot_id: {payload.slot_id}")

    session_id = f"sess_{uuid.uuid4().hex[:16]}"
    started_at = datetime.now(timezone.utc).isoformat()
    state = SessionState(
        session_id=session_id,
        slot_id=world.slot_id,
        case_date=world.case_date,
        session_start_time=started_at,
    )
    await insert_session(
        request.app.state.db,
        session_id=session_id,
        slot_id=world.slot_id,
        started_at=started_at,
        state=state,
    )
    return SessionStartResponse(
        session_id=session_id,
        slot_id=world.slot_id,
        case_date=world.case_date,
        started_at=started_at,
    )


@router.post(
    "/sessions/{session_id}/interrogate",
    response_model=InterrogateResponse,
)
async def interrogate_session(
    session_id: str,
    payload: InterrogateRequest,
    request: Request,
) -> InterrogateResponse:
    """Run one interrogation turn and persist transcript + state."""
    session = await fetch_session(request.app.state.db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Unknown session_id: {session_id}")

    world = await fetch_world_by_slot_id(request.app.state.db, session["slot_id"])
    if world is None:
        raise HTTPException(
            status_code=410,
            detail=f"Slot {session['slot_id']} is no longer published.",
        )

    suspect = next(
        (character for character in world.characters if character.character_id == payload.character_id),
        None,
    )
    if suspect is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown character_id: {payload.character_id}",
        )

    transcript: list[InterrogationTurn] = list(session["transcript"])
    history = [
        {
            "speaker": turn.speaker,
            "text": turn.text,
        }
        for turn in transcript
        if turn.character_id == payload.character_id
    ]

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                interrogate_suspect,
                world,
                suspect,
                payload.message,
                history,
            ),
            timeout=INTERROGATION_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Interrogation timed out. Please retry your question.",
        ) from exc

    normalized_reply = _normalize_interrogate_result(result)

    now = datetime.now(timezone.utc).isoformat()
    transcript.append(
        InterrogationTurn(
            character_id=payload.character_id,
            speaker="detective",
            text=payload.message,
            tone=None,
            timestamp=now,
        )
    )
    transcript.append(
        InterrogationTurn(
            character_id=payload.character_id,
            speaker=suspect.name,
            text=normalized_reply["reply"],
            tone=normalized_reply["tone"],
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
    )
    transcript = _trim_transcript(transcript)

    state: SessionState = session["state"]
    if payload.character_id not in state.suspects_interrogated:
        state.suspects_interrogated.append(payload.character_id)
    instinct_data = normalized_reply.get("detective_instinct")
    instinct_obj: DetectiveInstinct | None = None
    if instinct_data:
        try:
            instinct_obj = DetectiveInstinct.model_validate(instinct_data)
            instinct_key = f"{instinct_obj.source_title}:{instinct_obj.source_author}"
            if instinct_key not in state.instincts_shown:
                state.instincts_shown.append(instinct_key)
        except Exception:
            instinct_obj = None

    await update_session(
        request.app.state.db,
        session_id=session_id,
        state=state,
        transcript=transcript,
    )

    return InterrogateResponse(
        session_id=session_id,
        character_id=payload.character_id,
        character_name=suspect.name,
        reply=normalized_reply["reply"],
        tone=normalized_reply["tone"],
        detective_instinct=instinct_obj,
    )


@router.get(
    "/sessions/{session_id}/state",
    response_model=SessionStateResponse,
)
async def get_session_state(session_id: str, request: Request) -> SessionStateResponse:
    """Return current session state + transcript."""
    session = await fetch_session(request.app.state.db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Unknown session_id: {session_id}")
    return SessionStateResponse(
        session_id=session["session_id"],
        slot_id=session["slot_id"],
        started_at=session["started_at"],
        state=session["state"],
        transcript=session["transcript"],
    )


@router.post(
    "/sessions/{session_id}/accuse",
    response_model=AccuseResponse,
)
async def accuse_session(
    session_id: str,
    payload: AccuseRequest,
    request: Request,
) -> AccuseResponse:
    """Submit an accusation and finalize the verdict."""
    session = await fetch_session(request.app.state.db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Unknown session_id: {session_id}")

    state: SessionState = session["state"]
    if state.accusation_made:
        raise HTTPException(status_code=409, detail="Accusation already submitted for this session.")

    world = await fetch_world_by_slot_id(request.app.state.db, session["slot_id"])
    if world is None:
        raise HTTPException(
            status_code=410,
            detail=f"Slot {session['slot_id']} is no longer published.",
        )

    if not any(character.character_id == payload.character_id for character in world.characters):
        raise HTTPException(
            status_code=400,
            detail=f"Unknown character_id: {payload.character_id}",
        )

    try:
        verdict = await asyncio.wait_for(
            asyncio.to_thread(
                evaluate_accusation,
                world,
                payload.character_id,
                payload.reasoning,
            ),
            timeout=ACCUSATION_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Accusation evaluation timed out. Please retry.",
        ) from exc

    normalized_verdict = _normalize_verdict_result(
        verdict=verdict,
        accused_id=payload.character_id,
        accused_name=next(
            (
                character.name
                for character in world.characters
                if character.character_id == payload.character_id
            ),
            payload.character_id,
        ),
        killer_id=world.killer_id,
        killer_name=next(
            (
                character.name
                for character in world.characters
                if character.character_id == world.killer_id
            ),
            world.killer_id,
        ),
    )

    started_dt = datetime.fromisoformat(session["started_at"])
    if started_dt.tzinfo is None:
        started_dt = started_dt.replace(tzinfo=timezone.utc)
    solve_seconds = int((datetime.now(timezone.utc) - started_dt).total_seconds())

    state.accusation_made = True
    state.accusation_correct = bool(normalized_verdict["correct"])
    state.solve_time_seconds = solve_seconds
    if payload.reasoning.strip():
        state.player_claims.append(payload.reasoning.strip())
        state.player_claims = state.player_claims[-SESSION_PLAYER_CLAIMS_MAX_ITEMS:]

    await update_session(
        request.app.state.db,
        session_id=session_id,
        state=state,
        transcript=session["transcript"],
    )

    return AccuseResponse(
        session_id=session_id,
        correct=bool(normalized_verdict["correct"]),
        accused_id=normalized_verdict["accused_id"],
        accused_name=normalized_verdict["accused_name"],
        killer_id=normalized_verdict["killer_id"],
        killer_name=normalized_verdict["killer_name"],
        verdict_summary=normalized_verdict["verdict_summary"],
        missed_clues=normalized_verdict["missed_clues"],
        solve_time_seconds=solve_seconds,
    )


def _trim_transcript(
    transcript: list[InterrogationTurn],
) -> list[InterrogationTurn]:
    """Bound transcript growth so sessions stay lightweight."""
    if len(transcript) <= SESSION_TRANSCRIPT_MAX_TURNS:
        return transcript
    return transcript[-SESSION_TRANSCRIPT_MAX_TURNS:]


def _normalize_interrogate_result(raw: Any) -> dict[str, Any]:
    """Ensure interrogate agent output is safe and typed for API responses."""
    payload = raw if isinstance(raw, dict) else {}
    reply = payload.get("reply")
    tone = payload.get("tone")
    instinct = payload.get("detective_instinct")

    reply_text = str(reply).strip() if isinstance(reply, str) else ""
    if not reply_text:
        reply_text = "I need a second to think. Ask that again plainly."

    tone_text = str(tone).strip().lower() if isinstance(tone, str) else "guarded"
    if not tone_text:
        tone_text = "guarded"
    tone_text = tone_text.split()[0][:24]

    instinct_payload = instinct if isinstance(instinct, dict) else None
    return {
        "reply": reply_text[:600],
        "tone": tone_text,
        "detective_instinct": instinct_payload,
    }


def _normalize_verdict_result(
    verdict: Any,
    accused_id: str,
    accused_name: str,
    killer_id: str,
    killer_name: str,
) -> dict[str, Any]:
    """Normalize evaluator output and prevent malformed payload regressions."""
    payload = verdict if isinstance(verdict, dict) else {}
    correct = bool(accused_id == killer_id)
    summary = payload.get("verdict_summary")
    summary_text = (
        str(summary).strip()
        if isinstance(summary, str) and str(summary).strip()
        else (
            f"{accused_name} was {'the killer' if correct else 'not the killer'}. "
            f"The real killer was {killer_name}."
        )
    )
    clues_raw = payload.get("missed_clues")
    missed_clues: list[str] = []
    if isinstance(clues_raw, list):
        for clue in clues_raw:
            if isinstance(clue, str) and clue.strip():
                missed_clues.append(clue.strip()[:260])
            if len(missed_clues) >= 3:
                break

    return {
        "correct": correct,
        "accused_id": accused_id,
        "accused_name": accused_name,
        "killer_id": killer_id,
        "killer_name": killer_name,
        "verdict_summary": summary_text[:1400],
        "missed_clues": missed_clues,
    }
