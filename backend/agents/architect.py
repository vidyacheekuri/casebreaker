"""LLM-based daily slot generation with deterministic fallback."""

from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone
from typing import Any

from agents.consistency import check_consistency, repair_world_with_llm
from agents.llm_provider import generate_json
from models.world import Character, Evidence, Victim, WorldState
from utils.config import DAILY_SLOT_COUNT, MAX_GENERATION_RETRIES, STORY_GENERATION_MAX_TOKENS
from utils.prompts import ARCHITECT_SINGLE_SYSTEM_PROMPT, ARCHITECT_SINGLE_USER_PROMPT
from utils.source_material import build_generation_context


async def generate_daily_worlds(case_date: str | None = None) -> list[WorldState]:
    """Generate three daily world states concurrently."""
    if case_date is None:
        case_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    tasks = [
        asyncio.to_thread(generate_slot_world, case_date, slot_index)
        for slot_index in range(1, DAILY_SLOT_COUNT + 1)
    ]
    worlds = await asyncio.gather(*tasks)
    return list(worlds)


def generate_slot_world(
    case_date: str,
    slot_index: int,
    variant_seed: int = 0,
) -> WorldState:
    """Generate one slot world, retrying configured LLM generations before falling back."""
    for attempt in range(MAX_GENERATION_RETRIES):
        source_context = build_generation_context(case_date, slot_index, variant_seed + attempt)
        fbi_entry = source_context["raw"]["fbi"]
        setting = fbi_entry["settings"][0]
        mood = fbi_entry["emotional_tones"][0]

        raw = _generate_single_with_llm(
            case_date,
            slot_index,
            setting,
            mood,
            source_context,
        )
        if raw is None:
            continue

        raw["slot_index"] = slot_index
        raw["slot_id"] = f"{case_date}-slot-{slot_index}"
        raw["case_date"] = case_date
        raw["chroma_collection"] = f"world_{case_date.replace('-', '_')}_{slot_index}"

        try:
            world = WorldState.model_validate(raw)
        except Exception:
            continue

        valid, _failed = check_consistency(world)
        if valid:
            return world

        repaired = repair_world_with_llm(world)
        if repaired is not None:
            valid, _failed = check_consistency(repaired)
            if valid:
                return repaired

    source_context = build_generation_context(
        case_date,
        slot_index,
        variant_seed + MAX_GENERATION_RETRIES,
    )
    return WorldState.model_validate(
        _grounded_fallback_slot(case_date, slot_index, source_context)
    )


def _generate_single_with_llm(
    case_date: str,
    slot_index: int,
    setting: str,
    mood: str,
    source_context: dict[str, Any],
) -> dict[str, Any] | None:
    """Generate one mystery slot via whichever LLM provider is configured."""
    return generate_json(
        system=ARCHITECT_SINGLE_SYSTEM_PROMPT,
        user=ARCHITECT_SINGLE_USER_PROMPT.format(
            case_date=case_date,
            slot_index=slot_index,
            setting=setting,
            mood=mood,
            motive_family=source_context["motive_family"],
            fbi_context=source_context["fbi_context"],
            persona_context=source_context["persona_context"],
            literary_context=source_context["literary_context"],
        ),
        max_tokens=STORY_GENERATION_MAX_TOKENS,
        temperature=0.9,
    )


def _grounded_fallback_slot(
    case_date: str,
    slot_index: int,
    source_context: dict[str, Any],
) -> dict[str, Any]:
    """Deterministic local fallback grounded in the three local source datasets."""
    rng = random.Random(f"{case_date}:{slot_index}")
    fbi_entry = source_context["raw"]["fbi"]
    personas = source_context["raw"]["personas"]
    literary_refs = source_context["raw"]["literary_refs"]

    titles = [
        "The Last Ledger at Blackthorn Hall",
        "Storm at the Ashbourne Hotel",
        "The Conservatory Testament",
        "Murder Before the Morning Train",
    ]
    causes = [
        "suspected poisoning",
        "fatal head injury",
        "collapse after a tainted nightcap",
        "sudden death after a private confrontation",
    ]
    victim_name = rng.choice(["Edith Vale", "Julian Merrow", "Thomas Bell", "Marian Crowle", "Eleanor Birch"])
    victim_age = rng.randint(47, 68)
    victim_job = rng.choice(fbi_entry["victim_roles"])
    cause = causes[(slot_index - 1) % len(causes)]
    title = titles[(slot_index - 1) % len(titles)]
    setting = fbi_entry["settings"][0]
    mood = fbi_entry["emotional_tones"][0]

    roles = ["suspect_1", "suspect_2", "suspect_3"]
    names = [
        ["Dr. Elias Ward", "Clara Whitmore", "Owen Hale", "Lucian Pike"],
        ["Beatrice Lyle", "Arthur Fen", "Nina Crosse", "Mabel Ainsworth"],
        ["Miles Dacre", "Rosalind Pike", "Victor Sloane", "Jonas Vale"],
    ]
    characters: list[Character] = []
    for index, persona in enumerate(personas):
        character_id = roles[index]
        is_killer = index == 0
        relationship = rng.choice(persona["relationship_styles"])
        occupation = rng.choice(persona["occupations"])
        secret_tendency = rng.choice(persona["secret_tendencies"])
        knowledge = [
            f"The victim was tied to {fbi_entry['motive_family']} before the murder.",
            f"They noticed {rng.choice(fbi_entry['clue_styles'])} become important late in the evening.",
        ]
        alibi = (
            "I stayed in the drawing room and never crossed the east corridor."
            if is_killer
            else f"I was near the {rng.choice(['study annex', 'terrace', 'greenhouse'])} when the alarm rose."
        )
        characters.append(
            Character(
                character_id=character_id,
                name=rng.choice(names[index]),
                age=rng.randint(28, 58),
                occupation=occupation,
                relationship_to_victim=relationship,
                personality=persona["personality_core"],
                alibi=alibi,
                alibi_true=not is_killer,
                secret=f"They were hiding {secret_tendency}.",
                knowledge=knowledge,
                is_killer=is_killer,
                archetype=persona["archetype"],
                appearance=(
                    f"{persona['visual_cues']}. "
                    f"Period-appropriate styling for a {occupation} tied to a {setting} mystery."
                ),
            )
        )

    lead_literary = literary_refs[0]["text"] if literary_refs else "Use a classic country-house deduction pattern."
    secondary_literary = literary_refs[1]["text"] if len(literary_refs) > 1 else "Let a quiet contradiction matter more than the loudest accusation."
    summary = (
        f"When {victim_name}, a respected {victim_job}, is found dead in a {setting}, "
        f"three suspects shaped by {fbi_entry['motive_family']} offer alibis that feel polished but precarious."
    )
    return {
        "slot_id": f"{case_date}-slot-{slot_index}",
        "slot_index": slot_index,
        "case_date": case_date,
        "title": title,
        "summary": summary,
        "mood": mood,
        "setting": setting,
        "victim": Victim(
            name=victim_name,
            age=victim_age,
            occupation=victim_job,
            cause_of_death=cause,
        ).model_dump(),
        "killer_id": "suspect_1",
        "motive": (
            f"The killer acted out of {fbi_entry['motive_family']} after fearing "
            f"{rng.choice(fbi_entry['suspect_pressures'])}. "
            f"The story should feel like {lead_literary.lower()}"
        ),
        "timeline": [
            {
                "time": "8:10 PM",
                "event": (
                    f"The household gathers while {victim_name} hints that a decision tied to "
                    f"{fbi_entry['motive_family']} will be made before morning."
                ),
                "witnessed_by": ["suspect_1", "suspect_2", "suspect_3"],
            },
            {
                "time": "8:40 PM",
                "event": (
                    f"An unsigned letter connected to {rng.choice(fbi_entry['clue_styles'])} "
                    "unsettles the victim in full view of suspect_2."
                ),
                "witnessed_by": ["suspect_2"],
            },
            {
                "time": "9:05 PM",
                "event": (
                    f"suspect_3 quarrels with the victim over {rng.choice(fbi_entry['relationship_patterns'])} "
                    "before storming off."
                ),
                "witnessed_by": ["suspect_1", "suspect_3"],
            },
            {
                "time": "9:20 PM",
                "event": (
                    "suspect_1 slips away on a false errand while the others are distracted by the weather and the missing paperwork."
                ),
                "witnessed_by": ["suspect_2"],
            },
            {
                "time": "9:30 PM",
                "event": (
                    f"A routine courtesy tied to {secondary_literary.lower()} places a fresh drink near the victim."
                ),
                "witnessed_by": ["suspect_1"],
            },
            {
                "time": "9:45 PM",
                "event": "The victim is discovered collapsing beside the fireplace; suspect_2 raises the alarm.",
                "witnessed_by": ["suspect_2", "suspect_3"],
            },
        ],
        "characters": [character.model_dump() for character in characters],
        "evidence": [
            Evidence(
                evidence_id="evidence_1",
                name=rng.choice(["Smudged ledger page", "Revised will page", "Damaged account sheet"]),
                location="study",
                description=(
                    f"A document linked to {fbi_entry['motive_family']} suggests someone altered the victim's plans on the night of the murder."
                ),
                implicates="suspect_1",
                is_red_herring=False,
            ).model_dump(),
            Evidence(
                evidence_id="evidence_2",
                name=rng.choice(["Water-stained telegram", "Unsigned warning note", "Damaged calling card"]),
                location="terrace",
                description=(
                    f"This clue points toward {rng.choice(fbi_entry['suspect_pressures'])} and makes one innocent suspect look dangerously plausible."
                ),
                implicates=rng.choice(["suspect_2", "suspect_3"]),
                is_red_herring=True,
            ).model_dump(),
            Evidence(
                evidence_id="evidence_3",
                name=rng.choice(["Finger-marked cordial glass", "Disturbed nightcap tray", "Misplaced service glass"]),
                location="private room",
                description="The replacement drink or tray shows the killer tampered with a familiar household ritual.",
                implicates="suspect_1",
                is_red_herring=False,
            ).model_dump(),
            Evidence(
                evidence_id="evidence_4",
                name=rng.choice(["Unsigned warning letter", "Burned correspondence", "Locked dispatch note"]),
                location="study annex",
                description=(
                    f"The hidden paper implies the victim discovered {rng.choice(fbi_entry['suspect_pressures'])} but had not yet named the culprit."
                ),
                implicates="none",
                is_red_herring=False,
            ).model_dump(),
            Evidence(
                evidence_id="evidence_5",
                name=rng.choice(["Mud on evening shoes", "Garden soil on cuffs", "Wet footprint trail"]),
                location="east corridor",
                description="Fresh traces place someone in the corridor after claiming to remain elsewhere, quietly breaking the killer's alibi.",
                implicates="suspect_1",
                is_red_herring=False,
            ).model_dump(),
        ],
        "red_herrings": [
            f"{characters[2].name}'s visible quarrel",
            rng.choice(fbi_entry["clue_styles"]),
        ],
        "chroma_collection": f"world_{case_date.replace('-', '_')}_{slot_index}",
    }
