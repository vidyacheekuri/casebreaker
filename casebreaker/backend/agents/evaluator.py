"""
Evaluator Agent — verdict on player's final accusation.

Input: accused_character_id, player_reasoning, session_state
Output: {correct, explanation, missed_clues, true_sequence, solve_time_seconds}
Process: Compare accusation against daily_world_cache.killer_id and motive.

RAG: None — uses cached WorldState
"""

import json
import re
from datetime import datetime, timezone

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

from casebreaker.backend.api.state_store import daily_world_cache
from casebreaker.backend.models import SessionState
from casebreaker.backend.utils.config import LLM_MODEL, OPENAI_API_KEY
from casebreaker.backend.utils.prompts import EVALUATOR_SYSTEM_PROMPT, EVALUATOR_USER_PROMPT


def _parse_json_from_response(text: str) -> dict:
    """Extract JSON from LLM response."""
    text = text.strip()
    if "```json" in text:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if match:
            text = match.group(1).strip()
    elif "```" in text:
        match = re.search(r"```\s*([\s\S]*?)\s*```", text)
        if match:
            text = match.group(1).strip()
    return json.loads(text)


def evaluate_accusation(
    accused_character_id: str,
    player_reasoning: str,
    session: SessionState,
) -> dict:
    """
    Evaluate player's accusation against the hidden truth.

    Input:
        accused_character_id: Who the player accused
        player_reasoning: Player's explanation
        session: SessionState (for session_start_time)

    Output:
        {
            "correct": bool,
            "explanation": str,
            "missed_clues": list[str],
            "true_sequence": str,
            "solve_time_seconds": int
        }
    """
    world = daily_world_cache
    if not world:
        return {
            "correct": False,
            "explanation": "No active case.",
            "missed_clues": [],
            "true_sequence": "",
            "solve_time_seconds": 0,
        }

    try:
        start = datetime.fromisoformat(session.session_start_time)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
    except Exception:
        start = datetime.now(timezone.utc)
    solve_time_seconds = int((datetime.now(timezone.utc) - start).total_seconds())

    world_summary = _build_world_summary(world)
    user_prompt = EVALUATOR_USER_PROMPT.format(
        accused_character_id=accused_character_id,
        player_reasoning=player_reasoning,
        killer_id=world.killer_id,
        motive=world.motive,
        world_summary=world_summary,
    )

    llm = ChatOpenAI(
        model=LLM_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=0.0,
    )
    response = llm.invoke([
        HumanMessage(content=EVALUATOR_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ])
    content = response.content if hasattr(response, "content") else str(response)

    try:
        result = _parse_json_from_response(content)
    except Exception:
        result = {
            "correct": accused_character_id == world.killer_id,
            "explanation": "Unable to parse evaluation.",
            "missed_clues": [],
            "true_sequence": "",
        }

    # Override correct with ground truth if LLM errs
    result["correct"] = accused_character_id == world.killer_id
    result["solve_time_seconds"] = solve_time_seconds
    return result


def _build_world_summary(world) -> str:
    """Build a summary of the world for the evaluator."""
    victim = world.victim
    if isinstance(victim, dict):
        v_str = f"{victim.get('name', '')}, {victim.get('age', '')}, {victim.get('occupation', '')} — {victim.get('cause_of_death', '')}"
    else:
        v_str = f"{victim.name}, {victim.age}, {victim.occupation} — {victim.cause_of_death}"

    return (
        f"Setting: {world.setting}\n"
        f"Victim: {v_str}\n"
        f"Killer: {world.killer_id}\n"
        f"Motive: {world.motive}\n"
        f"Characters: {[(c.character_id, c.name, c.alibi) for c in world.characters]}\n"
        f"Timeline: {world.timeline[:5]}..."
    )
