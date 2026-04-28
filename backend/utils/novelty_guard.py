"""Novelty fingerprints and duplicate detection for generated stories."""

from __future__ import annotations

import json
from dataclasses import dataclass

from models.world import WorldState
from utils.embeddings import cosine_similarity, embed_text


@dataclass(slots=True)
class FingerprintResult:
    """Result of novelty evaluation."""

    fingerprint: dict
    is_duplicate: bool
    closest_distance: float | None


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
