"""Generate and evaluate story-only mystery slots without publishing the full pipeline.

This script intentionally stops before embedding, asset generation, DB writes, and
frontend hydration. It is meant for quick creative QA of the story generator.
"""

from __future__ import annotations

import argparse
import json
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from agents.architect import _build_case_recipe, _grounded_fallback_slot, generate_slot_world
from agents.consistency import check_consistency
from agents.keyword_extractor import extract_daily_keywords
from models.world import WorldState
from utils.config import DAILY_SLOT_COUNT
from utils.novelty_guard import detect_duplicate
from utils.source_material import build_generation_context


@dataclass(frozen=True)
class StoryEvaluation:
    """One generated story plus deterministic QA signals."""

    world: WorldState
    score: int
    issues: list[str]
    duplicate_distance: float | None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate generated story quality without running the full daily pipeline."
    )
    parser.add_argument(
        "--case-date",
        default=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        help="First UTC case date to generate, YYYY-MM-DD.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=1,
        help="Number of consecutive case dates to sample.",
    )
    parser.add_argument(
        "--slots",
        type=int,
        default=DAILY_SLOT_COUNT,
        help="Slots per sampled day.",
    )
    parser.add_argument(
        "--variant-seed",
        type=int,
        default=0,
        help="Base variant seed for repeatable alternative samples.",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=None,
        help="Optional path to write full generated worlds and evaluations as JSON.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Optional directory to write one complete Markdown and JSON case file per story.",
    )
    parser.add_argument(
        "--fallback-only",
        action="store_true",
        help="Skip LLM calls and evaluate the deterministic local fallback generator.",
    )
    args = parser.parse_args()

    worlds = _generate_worlds(
        case_date=args.case_date,
        days=args.days,
        slots=args.slots,
        variant_seed=args.variant_seed,
        fallback_only=args.fallback_only,
    )
    evaluations = _evaluate_worlds(worlds)
    keywords = extract_daily_keywords(worlds, case_date=args.case_date)
    _print_report(evaluations)
    _print_keywords(keywords)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(
            json.dumps(
                [
                    {
                        "score": evaluation.score,
                        "issues": evaluation.issues,
                        "duplicate_distance": evaluation.duplicate_distance,
                        "world": evaluation.world.model_dump(),
                    }
                    for evaluation in evaluations
                ],
                indent=2,
                default=str,
            ),
            encoding="utf-8",
        )
        print(f"\nWrote JSON report: {args.json_out}")

    if args.out_dir:
        _write_story_files(evaluations, args.out_dir, keywords)


def _generate_worlds(
    *,
    case_date: str,
    days: int,
    slots: int,
    variant_seed: int,
    fallback_only: bool,
) -> list[WorldState]:
    start = datetime.strptime(case_date, "%Y-%m-%d").date()
    worlds: list[WorldState] = []
    total = days * slots
    generated = 0
    for day_offset in range(days):
        current_date = (start + timedelta(days=day_offset)).isoformat()
        for slot_index in range(1, slots + 1):
            generated += 1
            print(
                f"Generating story {generated}/{total}: {current_date} slot {slot_index}...",
                flush=True,
            )
            if fallback_only:
                world = _generate_fallback_world(
                    current_date,
                    slot_index,
                    variant_seed=variant_seed + day_offset,
                )
            else:
                world = generate_slot_world(
                    current_date,
                    slot_index,
                    variant_seed=variant_seed + day_offset,
                )
            worlds.append(world)
            print(
                f"  -> {world.title} ({world.setting}; {world.mood})",
                flush=True,
            )
    return worlds


def _generate_fallback_world(
    case_date: str,
    slot_index: int,
    variant_seed: int,
) -> WorldState:
    source_context = build_generation_context(case_date, slot_index, variant_seed)
    recipe = _build_case_recipe(case_date, slot_index, source_context, variant_seed)
    return WorldState.model_validate(
        _grounded_fallback_slot(case_date, slot_index, source_context, recipe)
    )


def _evaluate_worlds(worlds: list[WorldState]) -> list[StoryEvaluation]:
    prior_fingerprints: list[dict] = []
    evaluations: list[StoryEvaluation] = []

    for world in worlds:
        issues: list[str] = []
        valid, consistency_issues = check_consistency(world)
        if not valid:
            issues.extend(f"consistency:{issue}" for issue in consistency_issues)

        novelty = detect_duplicate(world, prior_fingerprints)
        if novelty.is_duplicate:
            issues.append("novelty:too_similar_to_prior_sample")

        issues.extend(_source_grounding_issues(world))
        issues.extend(_character_voice_issues(world))
        issues.extend(_story_shape_issues(world))

        score = max(0, 100 - _issue_penalty(issues))
        evaluations.append(
            StoryEvaluation(
                world=world,
                score=score,
                issues=issues,
                duplicate_distance=novelty.closest_distance,
            )
        )
        prior_fingerprints.append(novelty.fingerprint)

    return evaluations


def _source_grounding_issues(world: WorldState) -> list[str]:
    issues: list[str] = []
    recipe = world.case_recipe
    sources = world.generation_sources

    if recipe is None:
        return ["source:no_case_recipe"]
    if sources is None:
        issues.append("source:no_generation_sources")
    if recipe.setting and world.setting != recipe.setting:
        issues.append("source:setting_drifted_from_recipe")
    if recipe.mood and world.mood != recipe.mood:
        issues.append("source:mood_drifted_from_recipe")
    if recipe.victim_role:
        victim_occupation = (
            world.victim.get("occupation", "")
            if isinstance(world.victim, dict)
            else world.victim.occupation
        )
        if recipe.victim_role.lower() not in victim_occupation.lower():
            issues.append("source:victim_role_not_visible")
    clue_hits = 0
    evidence_text = " ".join(
        f"{item.name} {item.description}" for item in world.evidence
    ).lower()
    for clue_style in recipe.clue_styles:
        if clue_style.lower() in evidence_text:
            clue_hits += 1
    if len(recipe.clue_styles) >= 3 and clue_hits < 2:
        issues.append("source:clue_styles_not_visible")
    return issues


def _character_voice_issues(world: WorldState) -> list[str]:
    issues: list[str] = []
    required_fields = [
        "speech_style",
        "emotional_tell",
        "lie_strategy",
        "private_wound",
        "pressure_response",
        "relationship_to_other_suspects",
    ]
    for character in world.characters:
        missing = [
            field
            for field in required_fields
            if not str(getattr(character, field, "")).strip()
        ]
        if missing:
            issues.append(f"voice:{character.character_id}:missing_{','.join(missing)}")

    speech_styles = {
        character.speech_style.strip().lower()
        for character in world.characters
        if character.speech_style.strip()
    }
    if len(speech_styles) < min(3, len(world.characters)):
        issues.append("voice:speech_styles_not_distinct")

    archetypes = {
        character.archetype.strip().lower()
        for character in world.characters
        if character.archetype.strip()
    }
    if len(archetypes) < min(3, len(world.characters)):
        issues.append("voice:archetypes_not_distinct")

    return issues


def _story_shape_issues(world: WorldState) -> list[str]:
    issues: list[str] = []
    title_tokens = _tokens(world.title)
    summary_tokens = _tokens(world.summary)
    if title_tokens & {"last", "ledger", "manor", "hall"} and "manor" in _tokens(world.setting):
        issues.append("shape:classic_manor_title_pattern")
    if len(summary_tokens) < 12:
        issues.append("shape:summary_too_thin")
    if len(world.red_herrings) < 2:
        issues.append("shape:not_enough_red_herrings")

    evidence_locations = {item.location.strip().lower() for item in world.evidence}
    if len(evidence_locations) < 4:
        issues.append("shape:evidence_locations_too_repetitive")

    killer = next(
        (character for character in world.characters if character.character_id == world.killer_id),
        None,
    )
    if killer and killer.character_id != "suspect_1":
        return issues
    if killer and len(world.characters) == 3:
        issues.append("shape:killer_defaults_to_suspect_1")
    return issues


def _issue_penalty(issues: Iterable[str]) -> int:
    penalty = 0
    for issue in issues:
        if issue.startswith("consistency:") or issue.startswith("novelty:"):
            penalty += 25
        elif issue.startswith("source:"):
            penalty += 10
        elif issue.startswith("voice:"):
            penalty += 8
        else:
            penalty += 5
    return penalty


def _print_report(evaluations: list[StoryEvaluation]) -> None:
    if not evaluations:
        print("No stories generated.")
        return

    scores = [evaluation.score for evaluation in evaluations]
    print(
        f"Story generation QA: {len(evaluations)} samples | "
        f"avg={statistics.mean(scores):.1f} min={min(scores)} max={max(scores)}"
    )
    print("=" * 88)

    for evaluation in evaluations:
        world = evaluation.world
        recipe = world.case_recipe
        duplicate = (
            "n/a"
            if evaluation.duplicate_distance is None
            else f"{evaluation.duplicate_distance:.3f}"
        )
        print(f"[{evaluation.score:03d}] {world.case_date} slot {world.slot_index}: {world.title}")
        print(f"      setting={world.setting} | mood={world.mood} | dup_distance={duplicate}")
        if recipe:
            print(
                "      recipe="
                f"{recipe.subgenre}; victim={recipe.victim_role}; "
                f"pressure={recipe.killer_pressure}; clues={', '.join(recipe.clue_styles)}"
            )
        print(
            "      suspects="
            + " | ".join(
                f"{character.name} ({character.archetype}; {character.speech_style})"
                for character in world.characters
            )
        )
        if evaluation.issues:
            print("      issues=" + ", ".join(evaluation.issues))
        else:
            print("      issues=none")
        print()


def _print_keywords(keywords) -> None:
    if not keywords:
        print("\nLanding keywords: none")
        return
    print("\nLanding keywords")
    print("=" * 88)
    for keyword in keywords:
        print(f"- {keyword.category}: {keyword.label} -> {keyword.slot_scores}")


def _write_story_files(evaluations: list[StoryEvaluation], out_dir: Path, keywords) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    index_lines = [
        "# Story Generation Evaluation",
        "",
        f"Stories: {len(evaluations)}",
        "",
        "## Landing Keywords",
        "",
    ]
    for keyword in keywords:
        index_lines.append(f"- {keyword.category}: {keyword.label} -> {keyword.slot_scores}")
    index_lines.extend(["", "## Stories", ""])

    for evaluation in evaluations:
        world = evaluation.world
        stem = _story_file_stem(world)
        markdown_path = out_dir / f"{stem}.md"
        json_path = out_dir / f"{stem}.json"
        markdown_path.write_text(_format_story_markdown(evaluation), encoding="utf-8")
        json_path.write_text(
            json.dumps(
                {
                    "score": evaluation.score,
                    "issues": evaluation.issues,
                    "duplicate_distance": evaluation.duplicate_distance,
                    "world": world.model_dump(),
                },
                indent=2,
                default=str,
            ),
            encoding="utf-8",
        )
        index_lines.append(
            f"- [{world.case_date} slot {world.slot_index}: {world.title}]({markdown_path.name}) "
            f"- score {evaluation.score}"
        )

    index_path = out_dir / "index.md"
    index_path.write_text("\n".join(index_lines) + "\n", encoding="utf-8")
    keywords_path = out_dir / "keywords.json"
    keywords_path.write_text(
        json.dumps([keyword.model_dump() for keyword in keywords], indent=2),
        encoding="utf-8",
    )
    print(f"\nWrote complete story files to: {out_dir}")
    print(f"Open the index: {index_path}")


def _format_story_markdown(evaluation: StoryEvaluation) -> str:
    world = evaluation.world
    recipe = world.case_recipe
    sources = world.generation_sources
    victim_data = world.victim if isinstance(world.victim, dict) else world.victim.model_dump()
    killer = next(
        (character for character in world.characters if character.character_id == world.killer_id),
        None,
    )
    duplicate = (
        "n/a"
        if evaluation.duplicate_distance is None
        else f"{evaluation.duplicate_distance:.3f}"
    )

    lines = [
        f"# {world.title}",
        "",
        "## QA",
        "",
        f"- Score: {evaluation.score}",
        f"- Duplicate distance: {duplicate}",
        f"- Issues: {', '.join(evaluation.issues) if evaluation.issues else 'none'}",
        "",
        "## Case",
        "",
        f"- Slot ID: {world.slot_id}",
        f"- Case date: {world.case_date}",
        f"- Slot index: {world.slot_index}",
        f"- Setting: {world.setting}",
        f"- Mood: {world.mood}",
        f"- Summary: {world.summary}",
        f"- Killer: {killer.name if killer else world.killer_id} ({world.killer_id})",
        f"- Motive: {world.motive}",
        "",
        "## Recipe",
        "",
    ]

    if recipe:
        lines.extend(
            [
                f"- Subgenre: {recipe.subgenre}",
                f"- Victim role: {recipe.victim_role}",
                f"- Central conflict: {recipe.central_conflict}",
                f"- Killer pressure: {recipe.killer_pressure}",
                f"- Clue styles: {', '.join(recipe.clue_styles)}",
                f"- Red herring strategy: {recipe.red_herring_strategy}",
                f"- Narrative twist: {recipe.narrative_twist}",
                f"- Forbidden repeats: {', '.join(recipe.forbidden_repeats)}",
            ]
        )
    else:
        lines.append("- No recipe stored.")

    lines.extend(["", "## Sources", ""])
    if sources:
        lines.extend(
            [
                f"- FBI motive id: {sources.fbi_id}",
                f"- Persona ids: {', '.join(sources.persona_ids)}",
                f"- Literary ids: {', '.join(sources.literary_ids)}",
            ]
        )
    else:
        lines.append("- No source ids stored.")

    lines.extend(
        [
            "",
            "## Victim",
            "",
            f"- Name: {victim_data.get('name', '')}",
            f"- Age: {victim_data.get('age', '')}",
            f"- Occupation: {victim_data.get('occupation', '')}",
            f"- Cause of death: {victim_data.get('cause_of_death', '')}",
            "",
            "## Suspects",
            "",
        ]
    )
    for character in world.characters:
        lines.extend(
            [
                f"### {character.name} ({character.character_id})",
                "",
                f"- Killer: {character.is_killer}",
                f"- Age: {character.age}",
                f"- Occupation: {character.occupation}",
                f"- Relationship to victim: {character.relationship_to_victim}",
                f"- Archetype: {character.archetype}",
                f"- Personality: {character.personality}",
                f"- Speech style: {character.speech_style}",
                f"- Emotional tell: {character.emotional_tell}",
                f"- Lie strategy: {character.lie_strategy}",
                f"- Private wound: {character.private_wound}",
                f"- Pressure response: {character.pressure_response}",
                f"- Relationship to other suspects: {character.relationship_to_other_suspects}",
                f"- Alibi: {character.alibi}",
                f"- Alibi true: {character.alibi_true}",
                f"- Secret: {character.secret}",
                f"- Knowledge: {'; '.join(character.knowledge)}",
                f"- Appearance: {character.appearance}",
                "",
            ]
        )

    lines.extend(["## Timeline", ""])
    for event in world.timeline:
        witnesses = ", ".join(event.get("witnessed_by", []))
        lines.append(f"- {event.get('time', 'Unknown time')}: {event.get('event', '')} Witnesses: {witnesses}")

    lines.extend(["", "## Evidence", ""])
    for evidence in world.evidence:
        lines.extend(
            [
                f"### {evidence.name} ({evidence.evidence_id})",
                "",
                f"- Location: {evidence.location}",
                f"- Description: {evidence.description}",
                f"- Implicates: {evidence.implicates}",
                f"- Red herring: {evidence.is_red_herring}",
                f"- Image prompt: {evidence.image_prompt or ''}",
                "",
            ]
        )

    lines.extend(["## Red Herrings", ""])
    for red_herring in world.red_herrings:
        lines.append(f"- {red_herring}")

    return "\n".join(lines).rstrip() + "\n"


def _story_file_stem(world: WorldState) -> str:
    title_slug = "-".join(
        token
        for token in (
            "".join(char.lower() if char.isalnum() else " " for char in world.title)
        ).split()
    )
    return f"{world.case_date}-slot-{world.slot_index}-{title_slug[:48]}"


def _tokens(value: str) -> set[str]:
    return {
        token.strip(".,:;!?-'\"").lower()
        for token in value.split()
        if token.strip(".,:;!?-'\"")
    }


if __name__ == "__main__":
    main()
