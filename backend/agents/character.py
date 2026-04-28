"""Per-suspect interrogation agent using world + literary retrieval."""

from __future__ import annotations

from typing import Any

from agents.llm_provider import generate_json
from models.session import DetectiveInstinct
from models.world import Character, WorldState
from rag.literary_retriever import query_literary_passages
from rag.world_retriever import query_world_context
from utils.config import (
    INTERROGATION_MAX_TOKENS,
    LITERARY_MATCH_THRESHOLD,
    LLM_RETRY_ATTEMPTS,
)
from utils.prompts import INTERROGATION_SYSTEM_PROMPT, INTERROGATION_USER_PROMPT


def interrogate_suspect(
    world: WorldState,
    suspect: Character,
    message: str,
    history: list[dict[str, str]],
) -> dict[str, Any]:
    """Run one interrogation turn and return reply + optional detective instinct."""
    world_snippets = query_world_context(
        world.chroma_collection,
        f"{suspect.name} {message}",
        limit=4,
    )
    world_context = _format_world_context(world_snippets, suspect)

    instinct = _maybe_detective_instinct(message, suspect)

    reply_text, tone = _call_llm(
        suspect=suspect,
        world_context=world_context,
        history=history,
        message=message,
    )

    return {
        "character_id": suspect.character_id,
        "character_name": suspect.name,
        "reply": reply_text,
        "tone": tone,
        "detective_instinct": instinct.model_dump() if instinct else None,
    }


def _format_world_context(snippets: list[dict], suspect: Character) -> str:
    if not snippets:
        return "(no grounding snippets retrieved)"
    lines: list[str] = []
    for snippet in snippets:
        metadata = snippet.get("metadata") or {}
        kind = metadata.get("type", "fact")
        lines.append(f"- [{kind}] {snippet.get('document', '').strip()}")
    lines.append(
        f"- [self] You are {suspect.name}. Relationship: {suspect.relationship_to_victim}."
    )
    return "\n".join(lines)


def _maybe_detective_instinct(message: str, suspect: Character) -> DetectiveInstinct | None:
    try:
        passages = query_literary_passages(
            f"{suspect.name} {suspect.personality} {message}",
            limit=1,
        )
    except Exception:
        return None
    if not passages:
        return None

    passage = passages[0]
    distance = passage.get("distance")
    similarity = 1.0 - float(distance) if isinstance(distance, (int, float)) else 0.0
    if similarity < LITERARY_MATCH_THRESHOLD:
        return None

    metadata = passage.get("metadata") or {}
    return DetectiveInstinct(
        quote=(passage.get("document") or "").strip()[:280],
        source_title=str(metadata.get("title", "Unknown")),
        source_author=str(metadata.get("author", "Unknown")),
        trigger=message[:160],
    )


def _call_llm(
    suspect: Character,
    world_context: str,
    history: list[dict[str, str]],
    message: str,
) -> tuple[str, str]:
    system_prompt = INTERROGATION_SYSTEM_PROMPT.format(
        name=suspect.name,
        age=suspect.age,
        occupation=suspect.occupation,
        relationship=suspect.relationship_to_victim,
        personality=suspect.personality,
        speech_style=suspect.speech_style or "natural, guarded speech",
        emotional_tell=suspect.emotional_tell or "subtle hesitation under pressure",
        lie_strategy=suspect.lie_strategy or "answer narrowly and avoid volunteering dangerous details",
        private_wound=suspect.private_wound or "a private vulnerability they dislike discussing",
        pressure_response=suspect.pressure_response or "becomes more defensive when pressed",
        relationship_to_other_suspects=(
            suspect.relationship_to_other_suspects
            or "knows the other suspects through the events around the victim"
        ),
        alibi=suspect.alibi,
        alibi_true=str(bool(suspect.alibi_true)).lower(),
        secret=suspect.secret,
        knowledge="; ".join(suspect.knowledge) if suspect.knowledge else "nothing notable",
        is_killer=str(bool(suspect.is_killer)).lower(),
        world_context=world_context,
    )
    user_prompt = INTERROGATION_USER_PROMPT.format(
        history=_format_history(history),
        message=message,
        name=suspect.name,
    )

    for _attempt in range(LLM_RETRY_ATTEMPTS):
        payload = generate_json(
            system=system_prompt,
            user=user_prompt,
            max_tokens=INTERROGATION_MAX_TOKENS,
            temperature=0.7,
        )
        if payload is None:
            continue
        reply = str(payload.get("reply") or "").strip()
        tone = str(payload.get("tone") or "guarded").strip() or "guarded"
        if not reply:
            reply = _offline_reply(suspect, message)
        return reply, tone

    return _offline_reply(suspect, message), "guarded"


def _format_history(history: list[dict[str, str]]) -> str:
    if not history:
        return "(no prior exchanges)"
    lines: list[str] = []
    for turn in history[-6:]:
        speaker = turn.get("speaker") or "detective"
        text = (turn.get("text") or "").strip()
        if text:
            lines.append(f"{speaker}: {text}")
    return "\n".join(lines) if lines else "(no prior exchanges)"


def _offline_reply(suspect: Character, message: str) -> str:
    if suspect.is_killer:
        return (
            f"I already told you where I was. I don't see what {message!r} "
            "has to do with me."
        )
    return (
        f"I want this resolved as much as you do. Ask plainly what you need, "
        f"and I'll tell you what {suspect.name.split()[0]} actually saw."
    )
