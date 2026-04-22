"""Accusation verdict agent."""

from __future__ import annotations

from typing import Any

from agents.llm_provider import generate_json
from models.world import WorldState
from utils.config import LLM_RETRY_ATTEMPTS
from utils.prompts import EVALUATOR_SYSTEM_PROMPT, EVALUATOR_USER_PROMPT


def evaluate_accusation(
    world: WorldState,
    accused_id: str,
    reasoning: str,
) -> dict[str, Any]:
    """Judge a player accusation against the true world state."""
    accused = next(
        (character for character in world.characters if character.character_id == accused_id),
        None,
    )
    killer = next(
        (character for character in world.characters if character.character_id == world.killer_id),
        None,
    )
    if accused is None or killer is None:
        raise ValueError("Unknown accused or killer for this slot.")

    correct = accused.character_id == world.killer_id

    llm_result = _call_llm(world, accused_id, accused.name, killer.name, reasoning)
    if llm_result is None:
        return {
            "correct": correct,
            "verdict_summary": _offline_summary(correct, accused.name, killer.name, world.motive),
            "missed_clues": _offline_missed_clues(world),
            "accused_id": accused.character_id,
            "accused_name": accused.name,
            "killer_id": killer.character_id,
            "killer_name": killer.name,
        }

    return {
        "correct": correct,
        "verdict_summary": llm_result.get("verdict_summary", ""),
        "missed_clues": list(llm_result.get("missed_clues", []))[:3],
        "accused_id": accused.character_id,
        "accused_name": accused.name,
        "killer_id": killer.character_id,
        "killer_name": killer.name,
    }


def _call_llm(
    world: WorldState,
    accused_id: str,
    accused_name: str,
    killer_name: str,
    reasoning: str,
) -> dict[str, Any] | None:
    suspect_names = {
        character.character_id: character.name
        for character in world.characters
    }

    def linked_suspect_label(character_id: str) -> str:
        normalized = character_id.strip().lower()
        if normalized == "none":
            return "no direct suspect"
        return suspect_names.get(normalized, "unknown suspect")

    evidence_block = "\n".join(
        f"- {evidence.name} ({evidence.location}) links to {linked_suspect_label(evidence.implicates)}. {evidence.description}"
        for evidence in world.evidence
    )
    timeline_block = "\n".join(
        f"- {event.get('time', '')}: {event.get('event', '')}"
        for event in world.timeline
    )

    user_prompt = EVALUATOR_USER_PROMPT.format(
        accused_id=accused_id,
        accused_name=accused_name,
        killer_id=world.killer_id,
        killer_name=killer_name,
        motive=world.motive,
        reasoning=reasoning.strip() or "(no reasoning provided)",
        evidence_block=evidence_block,
        timeline_block=timeline_block,
    )

    for _attempt in range(LLM_RETRY_ATTEMPTS):
        payload = generate_json(
            system=EVALUATOR_SYSTEM_PROMPT,
            user=user_prompt,
            max_tokens=600,
            temperature=0.4,
        )
        if payload is not None:
            return payload

    return None


def _offline_summary(correct: bool, accused_name: str, killer_name: str, motive: str) -> str:
    if correct:
        return (
            f"{accused_name} was the killer. {motive.strip() or 'The motive lines up with the evidence.'} "
            "The accusation holds."
        )
    return (
        f"{accused_name} was not the killer. The real killer was {killer_name}. "
        f"{motive.strip() or 'The real motive connects to evidence the player did not press on.'}"
    )


def _offline_missed_clues(world: WorldState) -> list[str]:
    clues: list[str] = []
    for evidence in world.evidence:
        if evidence.implicates == world.killer_id and not evidence.is_red_herring:
            clues.append(f"{evidence.name} in the {evidence.location}: {evidence.description}")
        if len(clues) >= 3:
            break
    return clues
