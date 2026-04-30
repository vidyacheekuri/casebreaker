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
        world=world,
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
    world: WorldState,
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
        reply = _sanitize_culprit_reveal(reply, world, suspect)
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


def _sanitize_culprit_reveal(reply: str, world: WorldState, suspect: Character) -> str:
    """Block interrogation replies that directly reveal the culprit.

    The verdict endpoint is the only place where the true killer should be
    confirmed. Interrogation can provide pressure, contradictions, and clues,
    but never a direct confession or solved-case statement.
    """
    normalized = " ".join(reply.lower().split())
    killer = next(
        (character for character in world.characters if character.character_id == world.killer_id),
        None,
    )

    confession_patterns = [
        "i killed",
        "i murdered",
        "i did it",
        "i'm the killer",
        "i am the killer",
        "i'm the murderer",
        "i am the murderer",
        "i'm guilty",
        "i am guilty",
        "it was me",
        "my crime",
    ]
    if suspect.is_killer and any(pattern in normalized for pattern in confession_patterns):
        return _culprit_guardrail_reply(suspect)

    culprit_terms = ("killer", "murderer", "criminal", "culprit", "guilty")
    action_terms = ("did it", "killed", "murdered", "committed")
    if killer:
        killer_name = killer.name.lower()
        killer_first_name = killer.name.split()[0].lower()
        mentions_killer = killer_name in normalized or killer_first_name in normalized
        assigns_guilt = any(term in normalized for term in culprit_terms + action_terms)
        if mentions_killer and assigns_guilt:
            return _culprit_guardrail_reply(suspect)

    for character in world.characters:
        character_name = character.name.lower()
        first_name = character.name.split()[0].lower()
        mentions_character = character_name in normalized or first_name in normalized
        assigns_guilt = any(
            phrase in normalized
            for phrase in (
                f"{character_name} is the killer",
                f"{character_name} is the murderer",
                f"{character_name} did it",
                f"{character_name} killed",
                f"{character_name} murdered",
                f"{first_name} is the killer",
                f"{first_name} is the murderer",
                f"{first_name} did it",
                f"{first_name} killed",
                f"{first_name} murdered",
            )
        )
        if mentions_character and assigns_guilt:
            return _culprit_guardrail_reply(suspect)

    return reply


def _culprit_guardrail_reply(suspect: Character) -> str:
    if suspect.is_killer:
        return "You are trying to force a confession out of me, and I will not hand you one. Ask me about what I saw, not what you want to hear."
    return "I will not name someone as guilty without proof. I can tell you what I saw, but I will not solve your case for you."
