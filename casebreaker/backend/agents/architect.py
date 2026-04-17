"""
Mystery Architect Agent — generates complete daily mystery worlds.

Input: setting (str), difficulty (easy|medium|hard), case_date (str)
Output: WorldState (validated Pydantic object)
Process: Single LLM call with structured output, then consistency check.
        Regenerates failed sections only until valid (max MAX_CONSISTENCY_RETRIES).
RAG: None — world generation is pure LLM, output feeds Layer 1 embedder.
"""

import json
import logging
import re

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from casebreaker.backend.models import WorldState, Character, Evidence, Victim
from casebreaker.backend.utils.config import (
    LLM_MODEL,
    OPENAI_API_KEY,
    MAX_CONSISTENCY_RETRIES,
)
from casebreaker.backend.utils.prompts import (
    ARCHITECT_SYSTEM_PROMPT,
    ARCHITECT_USER_PROMPT,
)
from casebreaker.backend.agents.consistency import (
    check_consistency,
    regenerate_failed_sections,
)


def _parse_json_from_response(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code fences."""
    text = text.strip()
    # Remove markdown code blocks if present
    if "```json" in text:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if match:
            text = match.group(1).strip()
    elif "```" in text:
        match = re.search(r"```\s*([\s\S]*?)\s*```", text)
        if match:
            text = match.group(1).strip()
    return json.loads(text)


def _build_world_state(raw: dict, case_date: str) -> WorldState:
    """Convert parsed dict to WorldState, adding chroma_collection."""
    raw = raw.copy()
    collection_name = f"daily_{case_date.replace('-', '_')}_world"
    raw["chroma_collection"] = collection_name

    # Ensure victim is dict for flexibility
    if isinstance(raw.get("victim"), dict):
        pass  # OK
    else:
        raw["victim"] = dict(raw["victim"]) if raw.get("victim") else {}

    return WorldState(**raw)


def _repair_trivial_issues(world: WorldState) -> WorldState:
    """Fix obvious structural issues before consistency check (avoids extra LLM calls)."""
    char_ids = [c.character_id for c in world.characters]
    if not char_ids:
        return world
    fixed = False
    for evt in world.timeline:
        wb = evt.get("witnessed_by") or []
        if not isinstance(wb, list):
            evt["witnessed_by"] = [char_ids[0]]
            fixed = True
        elif not wb:
            evt["witnessed_by"] = [char_ids[0]]
            fixed = True
        else:
            valid = [w for w in wb if w in char_ids]
            if not valid:
                evt["witnessed_by"] = [char_ids[0]]
                fixed = True
            elif valid != wb:
                evt["witnessed_by"] = valid
                fixed = True
    if fixed:
        return WorldState(**world.model_dump())
    return world


def generate_world(
    setting: str = "Victorian manor",
    difficulty: str = "medium",
    case_date: str | None = None,
) -> WorldState:
    """
    Generate a complete, validated mystery world.

    Input:
        setting: e.g. 'Victorian manor'
        difficulty: 'easy' | 'medium' | 'hard'
        case_date: YYYY-MM-DD (default: today UTC)

    Output:
        WorldState — validated, ready for Layer 1 embedding

    Side effects: None. Caller is responsible for embedding and caching.
    """
    from datetime import datetime, timezone

    if case_date is None:
        case_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    llm = ChatOpenAI(
        model=LLM_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=0.8,
    )

    user_prompt = ARCHITECT_USER_PROMPT.format(
        setting=setting,
        difficulty=difficulty,
        case_date=case_date,
    )

    messages = [
        SystemMessage(content=ARCHITECT_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ]

    response = llm.invoke(messages)
    content = response.content if hasattr(response, "content") else str(response)
    raw = _parse_json_from_response(content)
    world = _build_world_state(raw, case_date)
    world = _repair_trivial_issues(world)

    # Consistency check — regenerate failed sections until valid (cap retries)
    is_valid, failed_sections = check_consistency(world)
    attempts = 0
    while not is_valid and failed_sections and attempts < MAX_CONSISTENCY_RETRIES:
        attempts += 1
        patched = regenerate_failed_sections(world, failed_sections, llm)
        if patched:
            world = patched
        is_valid, failed_sections = check_consistency(world)
        if not patched:
            break  # Regeneration failed, proceed with current world

    if not is_valid and failed_sections:
        logging.getLogger(__name__).warning(
            f"Consistency check: reached max retries ({MAX_CONSISTENCY_RETRIES}), using world as-is. "
            f"Remaining issues: {failed_sections}"
        )

    return world
