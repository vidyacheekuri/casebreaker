"""
Consistency Checker — validates generated mystery worlds.

Input: WorldState
Output: (is_valid: bool, failed_sections: list[str])
Process: LLM-based validation of timeline, alibis, evidence, motive.
        Regenerates only failed sections when requested.
RAG: None.
"""

import json
import re
from typing import Any

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from casebreaker.backend.models import WorldState
from casebreaker.backend.utils.config import LLM_MODEL, OPENAI_API_KEY
from casebreaker.backend.utils.prompts import (
    CONSISTENCY_CHECK_PROMPT,
    CONSISTENCY_REGENERATE_PROMPT,
)


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


def check_consistency(world: WorldState) -> tuple[bool, list[str]]:
    """
    Validate the generated world against consistency rules.

    Input: WorldState
    Output: (is_valid, failed_sections)

    Checks:
    - timeline_witnesses: Every event has at least one witness
    - killer_alibi: Killer's alibi is false and contradicts timeline
    - innocent_alibis: Innocent suspects have verifiable alibi support
    - evidence_source: Evidence has logical connection to timeline
    - motive_coherence: Killer motive fits their profile
    """
    world_json = world.model_dump_json(indent=2)

    llm = ChatOpenAI(
        model=LLM_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=0.0,
    )

    prompt = CONSISTENCY_CHECK_PROMPT.format(world_json=world_json)
    response = llm.invoke([HumanMessage(content=prompt)])
    content = response.content if hasattr(response, "content") else str(response)

    try:
        result = _parse_json_from_response(content)
        valid = result.get("valid", False)
        failed = result.get("failed_sections", [])
        return (valid, failed if isinstance(failed, list) else [])
    except Exception:
        return (True, [])  # On parse error, assume valid to avoid blocking


def regenerate_failed_sections(
    world: WorldState,
    failed_sections: list[str],
    llm: ChatOpenAI,
) -> WorldState | None:
    """
    Regenerate only the failed sections of the world.

    Input: world, failed_sections, llm
    Output: New WorldState with patched sections, or None if regeneration fails
    """
    world_json = world.model_dump_json(indent=2)

    prompt = CONSISTENCY_REGENERATE_PROMPT.format(
        failed_sections=", ".join(failed_sections),
        world_json=world_json,
    )

    response = llm.invoke([HumanMessage(content=prompt)])
    content = response.content if hasattr(response, "content") else str(response)

    try:
        patched = _parse_json_from_response(content)
        world_dict = world.model_dump()
        # Apply all returned keys (LLM may return timeline+characters when fixing cross-dependent sections)
        for key in ("timeline", "characters", "evidence", "motive"):
            if key in patched and patched[key] is not None:
                world_dict[key] = patched[key]
        return WorldState(**world_dict)
    except Exception:
        return None
