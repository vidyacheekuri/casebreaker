"""Novelty fingerprints and duplicate detection for generated stories."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from models.world import WorldState
from utils.embeddings import cosine_similarity, embed_text


@dataclass(slots=True)
class FingerprintResult:
    """Result of novelty evaluation."""

    fingerprint: dict
    is_duplicate: bool
    closest_distance: float | None


@dataclass(slots=True)
class SameDayNoveltyResult:
    """Result of comparing one generated slot against already accepted same-day slots."""

    is_too_similar: bool
    reason: str | None = None


def build_story_fingerprint(world: WorldState) -> dict:
    """Create a compact fingerprint used to avoid near-duplicate stories."""
    killer = next(
        (character for character in world.characters if character.character_id == world.killer_id),
        None,
    )
    suspect_role_pattern = sorted(
        f"{character.archetype}:{'killer' if character.is_killer else 'suspect'}"
        for character in world.characters
    )
    clue_pattern = sorted(
        f"{evidence.location}:{'red' if evidence.is_red_herring else 'true'}"
        for evidence in world.evidence
    )
    recipe = world.case_recipe
    summary_text = " ".join(
        [
            world.title,
            world.summary,
            world.setting,
            world.motive,
            " ".join(world.red_herrings),
            recipe.red_herring_strategy if recipe else "",
            recipe.narrative_twist if recipe else "",
            " ".join(recipe.clue_styles) if recipe else "",
        ]
    )
    return {
        "setting_hash": world.setting.lower(),
        "killer_pattern": (
            f"{killer.relationship_to_victim}:{killer.occupation}" if killer else world.killer_id
        ),
        "motive_family": world.motive.split(".")[0][:120].lower(),
        "recipe_motive_family": recipe.motive_family.lower() if recipe else "",
        "victim_role": recipe.victim_role.lower() if recipe else "",
        "red_herring_strategy": recipe.red_herring_strategy.lower() if recipe else "",
        "clue_styles": sorted(style.lower() for style in recipe.clue_styles) if recipe else [],
        "suspect_role_pattern": suspect_role_pattern,
        "clue_pattern": clue_pattern,
        "summary_embedding": embed_text(summary_text),
    }


def detect_duplicate(world: WorldState, prior_fingerprints: list[dict]) -> FingerprintResult:
    """Return whether the world is too close to a previously published story."""
    fingerprint = build_story_fingerprint(world)
    closest_distance: float | None = None
    is_duplicate = False

    for previous in prior_fingerprints:
        similarity = cosine_similarity(
            fingerprint["summary_embedding"],
            previous.get("summary_embedding", []),
        )
        distance = 1.0 - similarity
        if closest_distance is None or distance < closest_distance:
            closest_distance = distance

        if (
            distance < 0.30
            or (
                previous.get("setting_hash") == fingerprint["setting_hash"]
                and previous.get("killer_pattern") == fingerprint["killer_pattern"]
                and previous.get("suspect_role_pattern") == fingerprint["suspect_role_pattern"]
            )
            or (
                previous.get("recipe_motive_family") == fingerprint["recipe_motive_family"]
                and previous.get("victim_role") == fingerprint["victim_role"]
                and previous.get("red_herring_strategy") == fingerprint["red_herring_strategy"]
                and previous.get("clue_styles") == fingerprint["clue_styles"]
            )
        ):
            is_duplicate = True

    return FingerprintResult(
        fingerprint=json.loads(json.dumps(fingerprint)),
        is_duplicate=is_duplicate,
        closest_distance=closest_distance,
    )


def detect_same_day_similarity(world: WorldState, accepted_worlds: list[WorldState]) -> SameDayNoveltyResult:
    """Reject slots that overlap too much with other slots from the same daily batch."""
    victim_name = _normalized_name(world.victim.name)
    suspect_names = {_normalized_name(character.name) for character in world.characters}
    story_text = _story_text(world)
    crime_text = _crime_text(world)
    appearance_texts = [_token_set(character.appearance) for character in world.characters]

    for previous in accepted_worlds:
        if victim_name and victim_name == _normalized_name(previous.victim.name):
            return SameDayNoveltyResult(True, "victim name repeated")

        previous_suspect_names = {_normalized_name(character.name) for character in previous.characters}
        if suspect_names & previous_suspect_names:
            return SameDayNoveltyResult(True, "suspect name repeated")

        previous_story_text = _story_text(previous)
        if _jaccard(_token_set(story_text), _token_set(previous_story_text)) >= 0.22:
            return SameDayNoveltyResult(True, "story premise too similar")

        previous_crime_text = _crime_text(previous)
        if _jaccard(_token_set(crime_text), _token_set(previous_crime_text)) >= 0.24:
            return SameDayNoveltyResult(True, "crime method or clue chain too similar")

        previous_appearance_texts = [_token_set(character.appearance) for character in previous.characters]
        for appearance_tokens in appearance_texts:
            for previous_tokens in previous_appearance_texts:
                if _jaccard(appearance_tokens, previous_tokens) >= 0.34:
                    return SameDayNoveltyResult(True, "suspect appearance too similar")

    return SameDayNoveltyResult(False)


def _story_text(world: WorldState) -> str:
    recipe = world.case_recipe
    return " ".join(
        [
            world.title,
            world.summary,
            world.setting,
            world.motive,
            recipe.subgenre if recipe else "",
            recipe.central_conflict if recipe else "",
            recipe.motive_family if recipe else "",
            recipe.red_herring_strategy if recipe else "",
            recipe.narrative_twist if recipe else "",
        ]
    )


def _crime_text(world: WorldState) -> str:
    return " ".join(
        [
            world.victim.cause_of_death,
            " ".join(str(event.get("event", "")) for event in world.timeline),
            " ".join(evidence.name for evidence in world.evidence),
            " ".join(evidence.description for evidence in world.evidence),
        ]
    )


def _normalized_name(name: str) -> str:
    return " ".join(name.lower().split())


def _token_set(text: str) -> set[str]:
    stopwords = {
        "the",
        "and",
        "with",
        "from",
        "that",
        "this",
        "into",
        "their",
        "they",
        "them",
        "was",
        "were",
        "for",
        "but",
        "not",
        "after",
        "before",
        "through",
        "about",
        "person",
        "suspect",
        "victim",
    }
    return {
        token
        for token in re.findall(r"[a-z0-9]{4,}", text.lower())
        if token not in stopwords
    }


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)
