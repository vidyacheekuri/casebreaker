"""LLM-based daily slot generation with deterministic fallback."""

from __future__ import annotations

import asyncio
import json
import random
from datetime import datetime, timezone
from typing import Any

from agents.consistency import check_consistency, repair_world_with_llm
from agents.llm_provider import generate_json
from models.world import CaseRecipe, Character, Evidence, GenerationSources, Victim, WorldState
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
        recipe = _build_case_recipe(case_date, slot_index, source_context, variant_seed + attempt)

        raw = _generate_single_with_llm(
            case_date,
            slot_index,
            recipe,
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

        _apply_generation_metadata(world, recipe, source_context)
        _sync_killer_flags(world)
        _normalize_evidence_implications(world)
        _backfill_character_voice_fields(world, source_context)
        valid, _failed = check_consistency(world)
        if valid:
            return world

        repaired = repair_world_with_llm(world)
        if repaired is not None:
            _apply_generation_metadata(repaired, recipe, source_context)
            _sync_killer_flags(repaired)
            _normalize_evidence_implications(repaired)
            _backfill_character_voice_fields(repaired, source_context)
            valid, _failed = check_consistency(repaired)
            if valid:
                return repaired

    source_context = build_generation_context(
        case_date,
        slot_index,
        variant_seed + MAX_GENERATION_RETRIES,
    )
    recipe = _build_case_recipe(
        case_date,
        slot_index,
        source_context,
        variant_seed + MAX_GENERATION_RETRIES,
    )
    return WorldState.model_validate(
        _grounded_fallback_slot(case_date, slot_index, source_context, recipe)
    )


def _normalize_evidence_implications(world: WorldState) -> None:
    """Keep clue links useful instead of letting every clue implicate one suspect."""
    character_ids = [character.character_id for character in world.characters]
    valid_ids = set(character_ids)
    innocent_ids = [character_id for character_id in character_ids if character_id != world.killer_id]

    if not character_ids:
        return

    for evidence in world.evidence:
        normalized = evidence.implicates.strip().lower()
        if normalized not in valid_ids and normalized != "none":
            evidence.implicates = "none"
        else:
            evidence.implicates = normalized

    culprit_clues = [
        evidence
        for evidence in world.evidence
        if not evidence.is_red_herring and evidence.implicates == world.killer_id
    ]
    if not culprit_clues:
        candidate = next((evidence for evidence in world.evidence if not evidence.is_red_herring), None)
        if candidate is not None:
            candidate.implicates = world.killer_id
            culprit_clues.append(candidate)

    red_herring = next((evidence for evidence in world.evidence if evidence.is_red_herring), None)
    if red_herring is not None and innocent_ids:
        red_herring.implicates = innocent_ids[0]

    neutral_candidate = next(
        (
            evidence
            for evidence in reversed(world.evidence)
            if evidence.implicates == world.killer_id and evidence not in culprit_clues[:1]
        ),
        None,
    )
    if neutral_candidate is not None:
        neutral_candidate.implicates = "none"

    counts: dict[str, int] = {}
    for evidence in world.evidence:
        counts[evidence.implicates] = counts.get(evidence.implicates, 0) + 1

    if len(world.evidence) >= 3 and max(counts.values(), default=0) == len(world.evidence):
        world.evidence[0].implicates = world.killer_id
        if innocent_ids:
            world.evidence[1].implicates = innocent_ids[0]
            world.evidence[1].is_red_herring = True
            world.evidence[-1].implicates = "none"


def _sync_killer_flags(world: WorldState) -> None:
    """Keep the denormalized character killer flags aligned with world.killer_id."""
    for character in world.characters:
        character.is_killer = character.character_id == world.killer_id
        if character.is_killer:
            character.alibi_true = False


def _generate_single_with_llm(
    case_date: str,
    slot_index: int,
    recipe: CaseRecipe,
    source_context: dict[str, Any],
) -> dict[str, Any] | None:
    """Generate one mystery slot via whichever LLM provider is configured."""
    return generate_json(
        system=ARCHITECT_SINGLE_SYSTEM_PROMPT,
        user=ARCHITECT_SINGLE_USER_PROMPT.format(
            case_date=case_date,
            slot_index=slot_index,
            setting=recipe.setting,
            mood=recipe.mood,
            motive_family=source_context["motive_family"],
            selected_context=source_context["selected_context"],
            case_recipe=recipe.model_dump_json(indent=2),
            generation_sources=json.dumps(source_context["generation_sources"], indent=2),
            fbi_context=source_context["fbi_context"],
            persona_context=source_context["persona_context"],
            literary_context=source_context["literary_context"],
        ),
        max_tokens=STORY_GENERATION_MAX_TOKENS,
        temperature=0.9,
    )


def _build_case_recipe(
    case_date: str,
    slot_index: int,
    source_context: dict[str, Any],
    variant_seed: int,
) -> CaseRecipe:
    """Build a compact deterministic creative brief from the selected source data."""
    rng = random.Random(f"{case_date}:recipe:{slot_index}:{variant_seed}")
    selected = source_context["selected"]
    fbi_entry = source_context["raw"]["fbi"]
    personas = source_context["raw"]["personas"]
    literary_refs = source_context["raw"]["literary_refs"]
    lead_motif = _first_motif(literary_refs)
    persona_names = [persona["archetype"] for persona in personas]

    subgenres = [
        "closed-circle social scandal",
        "character-driven clue puzzle",
        "intimate household betrayal",
        "public reputation mystery",
        "pressure-cooker alibi mystery",
    ]
    red_herring_styles = [
        f"a visible conflict around {selected['relationship_pattern']} hides a quieter clue",
        f"a suspect's {lead_motif} behavior looks damning but points to a different secret",
        f"one {selected['clue_styles'][0]} clue tempts the detective toward the wrong person",
        "a truthful emotional outburst distracts from a false practical detail",
    ]
    twists = [
        "the decisive clue is about timing, not temperament",
        "the calmest suspect is guarding a practical lie, not grief",
        "the loudest secret is real but not murderous",
        "a familiar routine matters because one person changed it slightly",
    ]

    return CaseRecipe(
        subgenre=rng.choice(subgenres),
        setting=selected["setting"],
        mood=selected["mood"],
        motive_family=source_context["motive_family"],
        victim_role=selected["victim_role"],
        central_conflict=(
            f"{selected['relationship_pattern']} under {source_context['motive_family']} "
            f"pressure, shaped by {', '.join(persona_names)}"
        ),
        killer_pressure=selected["killer_pressure"],
        clue_styles=selected["clue_styles"],
        red_herring_strategy=rng.choice(red_herring_styles),
        narrative_twist=rng.choice(twists),
        forbidden_repeats=[
            "generic manor inheritance unless the selected setting demands it",
            "three suspects with the same emotional register",
            "every clue pointing at one suspect",
            "a victim who is only a plot device",
        ],
    )


def _first_motif(literary_refs: list[dict]) -> str:
    for ref in literary_refs:
        motifs = ref.get("motifs")
        if isinstance(motifs, list) and motifs:
            return str(motifs[0])
    return "misdirection"


def _apply_generation_metadata(
    world: WorldState,
    recipe: CaseRecipe,
    source_context: dict[str, Any],
) -> None:
    world.case_recipe = recipe
    world.generation_sources = GenerationSources.model_validate(source_context["generation_sources"])
    world.setting = recipe.setting
    world.mood = recipe.mood


def _backfill_character_voice_fields(
    world: WorldState,
    source_context: dict[str, Any],
) -> None:
    """Preserve persona source traits even if the LLM omits a new optional field."""
    personas = source_context["raw"]["personas"]
    if not personas:
        return

    for index, character in enumerate(world.characters):
        persona = personas[index % len(personas)]
        if not character.archetype:
            character.archetype = persona.get("archetype", "")
        if not character.speech_style:
            character.speech_style = persona.get("speech_style", "")
        if not character.emotional_tell:
            character.emotional_tell = _emotional_tell_for(persona, index)
        if not character.lie_strategy:
            character.lie_strategy = _lie_strategy_for(character, persona)
        if not character.private_wound:
            tendency = _choice_from(persona.get("secret_tendencies"), index)
            character.private_wound = f"Sensitive about {tendency}."
        if not character.pressure_response:
            character.pressure_response = _pressure_response_for(persona, index)
        if not character.relationship_to_other_suspects:
            others = [other.name for other in world.characters if other.character_id != character.character_id]
            character.relationship_to_other_suspects = (
                f"Knows {', '.join(others)} socially, but distrusts what they noticed that night."
            )


def _choice_from(values: object, index: int) -> str:
    if isinstance(values, list) and values:
        return str(values[index % len(values)])
    return "a private embarrassment"


def _emotional_tell_for(persona: dict, index: int) -> str:
    defaults = [
        "answers become overly precise when frightened",
        "hands move before their voice admits emotion",
        "turns defensive whenever loyalty is questioned",
    ]
    style = persona.get("speech_style", "")
    return f"{defaults[index % len(defaults)]}; speech tends toward {style}"


def _lie_strategy_for(character: Character, persona: dict) -> str:
    if character.is_killer:
        return "protect the false alibi by conceding harmless truths and disputing timing"
    if "red herring" in character.archetype.lower():
        return "over-explain the wrong secret while avoiding the useful detail"
    if "outsider" in character.archetype.lower():
        return "withhold names to protect someone else"
    return f"lean on {persona.get('speech_style', 'careful phrasing')} when cornered"


def _pressure_response_for(persona: dict, index: int) -> str:
    responses = [
        "becomes controlled and clipped",
        "rushes into apologetic detail",
        "pushes back with wounded pride",
    ]
    return responses[index % len(responses)]


def _grounded_fallback_slot(
    case_date: str,
    slot_index: int,
    source_context: dict[str, Any],
    recipe: CaseRecipe,
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
    setting = recipe.setting
    mood = recipe.mood

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
        chosen_name = rng.choice(names[index])
        characters.append(
            Character(
                character_id=character_id,
                name=chosen_name,
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
                speech_style=persona.get("speech_style", ""),
                emotional_tell=_emotional_tell_for(persona, index),
                lie_strategy=(
                    "protect the false alibi by conceding harmless truths and disputing timing"
                    if is_killer
                    else "withhold the embarrassing secret until the detective names it"
                ),
                private_wound=f"Sensitive about {secret_tendency}.",
                pressure_response=_pressure_response_for(persona, index),
                relationship_to_other_suspects="Shares partial history with the other suspects, but trusts neither account fully.",
                gender_presentation=_infer_gender_from_name(chosen_name),
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
            f"The killer acted out of {recipe.motive_family} after fearing "
            f"{recipe.killer_pressure}. "
            f"The story should feel like {lead_literary.lower()}"
        ),
        "timeline": [
            {
                "time": "8:10 PM",
                "event": (
                    f"The household gathers while {victim_name} hints that a decision tied to "
                    f"{recipe.motive_family} will be made before morning."
                ),
                "witnessed_by": ["suspect_1", "suspect_2", "suspect_3"],
            },
            {
                "time": "8:40 PM",
                "event": (
                    f"An unsigned letter connected to {rng.choice(recipe.clue_styles)} "
                    "unsettles the victim in full view of suspect_2."
                ),
                "witnessed_by": ["suspect_2"],
            },
            {
                "time": "9:05 PM",
                "event": (
                    f"suspect_3 quarrels with the victim over {source_context['selected']['relationship_pattern']} "
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
                    f"A routine courtesy tied to {recipe.narrative_twist.lower()} places a fresh drink near the victim."
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
                    f"A document linked to {recipe.motive_family} suggests someone altered the victim's plans on the night of the murder."
                ),
                implicates="suspect_1",
                is_red_herring=False,
            ).model_dump(),
            Evidence(
                evidence_id="evidence_2",
                name=rng.choice(["Water-stained telegram", "Unsigned warning note", "Damaged calling card"]),
                location="terrace",
                description=(
                    f"This clue points toward {recipe.killer_pressure} and makes one innocent suspect look dangerously plausible."
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
            recipe.red_herring_strategy,
        ],
        "case_recipe": recipe.model_dump(),
        "generation_sources": source_context["generation_sources"],
        "chroma_collection": f"world_{case_date.replace('-', '_')}_{slot_index}",
    }


def _infer_gender_from_name(name: str) -> str:
    first = name.strip().split(" ", 1)[0].lower()
    female = {"clara", "beatrice", "nina", "mabel", "rosalind", "edith", "marian", "eleanor"}
    male = {"elias", "owen", "lucian", "arthur", "miles", "victor", "jonas", "julian", "thomas"}
    if first in female:
        return "female"
    if first in male:
        return "male"
    return "neutral"
