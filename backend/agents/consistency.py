"""Consistency validation and optional Claude-based repair for generated worlds."""

from __future__ import annotations

import json
from typing import Any

from anthropic import Anthropic

from models.world import WorldState
from utils.config import ANTHROPIC_API_KEY, CLAUDE_MODEL, STORY_GENERATION_MAX_TOKENS
from utils.prompts import (
    CONSISTENCY_REPAIR_SYSTEM_PROMPT,
    CONSISTENCY_REPAIR_USER_PROMPT,
)


def check_consistency(world: WorldState) -> tuple[bool, list[str]]:
    """Validate local structural consistency rules."""
    failed: list[str] = []
    character_ids = {character.character_id for character in world.characters}
    killer = next(
        (character for character in world.characters if character.character_id == world.killer_id),
        None,
    )

    if len(world.characters) != 3:
        failed.append("character_count")
    if len(world.evidence) != 5:
        failed.append("evidence_count")
    if killer is None:
        failed.append("killer_id")
    elif killer.alibi_true:
        failed.append("killer_alibi")

    for event in world.timeline:
        witnessed_by = event.get("witnessed_by", [])
        if any(witness not in character_ids for witness in witnessed_by):
            failed.append("timeline_witnesses")
            break

    innocent_ids = {
        character.character_id
        for character in world.characters
        if not character.is_killer and character.character_id != world.killer_id
    }
    supported_innocents = set()
    for event in world.timeline:
        for witness in event.get("witnessed_by", []):
            if witness in innocent_ids:
                supported_innocents.add(witness)
    if innocent_ids - supported_innocents:
        failed.append("innocent_alibis")

    timeline_text = " ".join(
        f"{event.get('time', '')} {event.get('event', '')}" for event in world.timeline
    ).lower()
    for evidence in world.evidence:
        if evidence.location.lower() not in timeline_text and evidence.implicates not in character_ids | {"none"}:
            failed.append("evidence_source")
            break

    if not world.motive.strip():
        failed.append("motive_coherence")

    return (len(failed) == 0, sorted(set(failed)))


def repair_world_with_claude(world: WorldState) -> WorldState | None:
    """Ask Claude to repair a broken world while preserving its core premise."""
    if not ANTHROPIC_API_KEY:
        return None

    try:
        client = Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=CLAUDE_MODEL,
            system=CONSISTENCY_REPAIR_SYSTEM_PROMPT,
            max_tokens=STORY_GENERATION_MAX_TOKENS,
            messages=[
                {
                    "role": "user",
                    "content": CONSISTENCY_REPAIR_USER_PROMPT.format(
                        world_json=world.model_dump_json(indent=2)
                    ),
                }
            ],
        )
        text = _strip_fences(_response_text(response))
        raw = json.loads(text)
        raw["slot_id"] = world.slot_id
        raw["slot_index"] = world.slot_index
        raw["case_date"] = world.case_date
        raw["chroma_collection"] = world.chroma_collection
        return WorldState.model_validate(raw)
    except Exception:
        return None


def _response_text(response: Any) -> str:
    """Collapse Anthropic response segments into one string."""
    parts: list[str] = []
    for block in response.content:
        text = getattr(block, "text", "")
        if text:
            parts.append(text)
    return "".join(parts).strip()


def _strip_fences(text: str) -> str:
    """Remove markdown code fences Claude sometimes adds despite instructions."""
    import re
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    return text
