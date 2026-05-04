"""LLM-based daily slot generation with deterministic fallback."""

from __future__ import annotations

import asyncio
import copy
import json
import math
import random
import uuid
from datetime import datetime, timezone
from typing import Any

from agents.consistency import check_consistency, repair_world_with_llm
from agents.llm_provider import generate_json
from db.database import get_db
from models.world import CaseRecipe, Character, Evidence, GenerationSources, InvestigationRoom, Victim, WorldState
from utils.config import DAILY_SLOT_COUNT, MAX_GENERATION_RETRIES, STORY_GENERATION_MAX_TOKENS
from utils.prompts import ARCHITECT_SINGLE_SYSTEM_PROMPT, ARCHITECT_SINGLE_USER_PROMPT
from utils.source_material import build_generation_context


DAILY_CREATIVE_LANES = [
    {
        "label": "public reputation scandal",
        "subgenre": "public reputation mystery",
        "motive_family": "reputation ruin",
        "settings": ["boarding school", "lecture hall", "hotel drawing room", "town hall residence"],
        "moods": ["social dread", "icy composure", "suppressed shame"],
        "victim_roles": ["headmistress", "newspaper proprietor", "magistrate", "philanthropist"],
        "relationship_patterns": ["headmistress and trustee", "journalist and benefactor", "doctor and patron"],
        "killer_pressures": ["fear of scandal", "career collapse", "exposure of a private affair"],
        "clue_styles": ["unsigned warning note", "burned correspondence", "hidden photograph", "altered guest register"],
        "titles": ["The Register of Lies", "Death Before Assembly", "The Benefactor's Last Notice"],
        "causes": ["fatal fall during a staged late meeting", "sudden collapse after a private confrontation", "fatal head injury near the service stairs"],
        "locations": ["Assembly Hall", "Records Office", "Back Stair", "Head's Study", "Archive Room"],
        "victim_names": ["Helena Cross", "Martin Vale", "Ada Whitlock", "Simon Harrow"],
    },
    {
        "label": "professional money pressure",
        "subgenre": "professional money-pressure mystery",
        "motive_family": "business betrayal",
        "settings": ["railway hotel", "city club", "private office", "dockside boardroom"],
        "moods": ["controlled urgency", "desperation", "professional jealousy"],
        "victim_roles": ["railway investor", "hotel owner", "broker", "shipping director"],
        "relationship_patterns": ["partner and investor", "manager and owner", "solicitor and client"],
        "killer_pressures": ["embezzlement about to be exposed", "failed speculation", "forged signature risk"],
        "clue_styles": ["missing ledger page", "telegram receipt", "falsified contract", "locked dispatch case"],
        "titles": ["The Midnight Ledger", "Platform Five Alibi", "The Locked Dispatch"],
        "causes": ["fatal injury in a locked office dispute", "collapse after a tampered evening drink", "fatal blow beside the accounts safe"],
        "locations": ["Private Office", "Hotel Bar", "Telegraph Desk", "Safe Room", "Platform Hall"],
        "victim_names": ["Graham Pike", "Celia North", "Victor Bell", "Marian Locke"],
    },
    {
        "label": "private household secret",
        "subgenre": "intimate private-secret mystery",
        "motive_family": "inheritance pressure",
        "settings": ["private library", "winter retreat", "music room", "seaside villa", "walled garden", "conservatory"],
        "moods": ["family bitterness", "masked panic", "elegant bitterness"],
        "victim_roles": ["publisher", "collector", "composer", "estate owner"],
        "relationship_patterns": ["estranged sibling", "spouse versus heir", "former fiance and new partner"],
        "killer_pressures": ["resentment over a revised will", "fear of abandonment", "quiet panic over public disgrace"],
        "clue_styles": ["amended will", "misdirected letter", "monogrammed glove", "torn photograph", "pressed flower"],
        "titles": ["The Last Page of Harrow House", "The Composer's Closed Door", "A Will in Winter"],
        "causes": ["collapse after a private confrontation", "fatal head injury beside the writing desk", "sudden death after a family quarrel"],
        "locations": ["Private Library", "Music Room", "Guest Corridor", "Writing Desk", "Blue Parlor"],
        "victim_names": ["Eleanor Birch", "Julian Merrow", "Claudia Voss", "Thomas Bell"],
    },
]


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
        source_context = _apply_creative_lane(source_context, case_date, slot_index, variant_seed + attempt)
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
        _distribute_evidence_to_rooms(world, source_context, variant_seed + attempt)
        valid, _failed = check_consistency(world)
        if valid:
            _synthesize_story_fields(world)
            # Record this generation for cross-day diversity avoidance
            gen_sources = source_context.get("generation_sources", {})
            _save_generation_history(
                case_date,
                slot_index,
                gen_sources.get("fbi_id", ""),
                gen_sources.get("persona_ids", []),
                gen_sources.get("literary_ids", []),
            )
            return world

        repaired = repair_world_with_llm(world)
        if repaired is not None:
            _apply_generation_metadata(repaired, recipe, source_context)
            _sync_killer_flags(repaired)
            _normalize_evidence_implications(repaired)
            _backfill_character_voice_fields(repaired, source_context)
            _distribute_evidence_to_rooms(repaired, source_context, variant_seed + attempt)
            valid, _failed = check_consistency(repaired)
            if valid:
                _synthesize_story_fields(repaired)
                # Record this generation for cross-day diversity avoidance
                gen_sources = source_context.get("generation_sources", {})
                _save_generation_history(
                    case_date,
                    slot_index,
                    gen_sources.get("fbi_id", ""),
                    gen_sources.get("persona_ids", []),
                    gen_sources.get("literary_ids", []),
                )
                return repaired

    source_context = build_generation_context(
        case_date,
        slot_index,
        variant_seed + MAX_GENERATION_RETRIES,
    )
    source_context = _apply_creative_lane(
        source_context,
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
    world = WorldState.model_validate(
        _grounded_fallback_slot(case_date, slot_index, source_context, recipe)
    )
    _distribute_evidence_to_rooms(world, source_context, variant_seed + MAX_GENERATION_RETRIES)
    _synthesize_story_fields(world)
    # Record this generation for cross-day diversity avoidance
    gen_sources = source_context.get("generation_sources", {})
    _save_generation_history(
        case_date,
        slot_index,
        gen_sources.get("fbi_id", ""),
        gen_sources.get("persona_ids", []),
        gen_sources.get("literary_ids", []),
    )
    return world


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


def _distribute_evidence_to_rooms(
    world: WorldState,
    source_context: dict[str, Any],
    variant_seed: int,
) -> None:
    """Create variable clue density: empty rooms, single-clue rooms, and dense rooms."""
    evidence = list(world.evidence)
    if not evidence:
        world.rooms = []
        return

    rng = random.Random(f"{world.case_date}:rooms:{world.slot_index}:{variant_seed}")
    evidence_pool = evidence[:]
    rng.shuffle(evidence_pool)

    dense_count = max(1, len(evidence_pool) // 4)
    dense_capacity = min(len(evidence_pool), dense_count * 2)
    single_count = max(1, len(evidence_pool) - dense_capacity)
    empty_count = max(1, math.ceil((dense_count + single_count) * 0.3))
    total_rooms = empty_count + single_count + dense_count

    room_names = _candidate_room_names(world, source_context, total_rooms)
    rng.shuffle(room_names)
    room_names = room_names[:total_rooms]

    dense_rooms = room_names[:dense_count]
    empty_rooms = room_names[dense_count : dense_count + empty_count]
    single_rooms = room_names[dense_count + empty_count :]

    assignments: dict[str, list[Evidence]] = {room: [] for room in room_names}

    evidence_index = 0
    for room in dense_rooms:
        for _ in range(2):
            if evidence_index >= len(evidence_pool):
                break
            assignments[room].append(evidence_pool[evidence_index])
            evidence_index += 1

    for room in single_rooms:
        if evidence_index >= len(evidence_pool):
            break
        assignments[room].append(evidence_pool[evidence_index])
        evidence_index += 1

    dense_cursor = 0
    while evidence_index < len(evidence_pool) and dense_rooms:
        room = dense_rooms[dense_cursor % len(dense_rooms)]
        if len(assignments[room]) < 3:
            assignments[room].append(evidence_pool[evidence_index])
            evidence_index += 1
        dense_cursor += 1
        if dense_cursor > len(dense_rooms) * 3:
            break

    if evidence_index < len(evidence_pool):
        for room in single_rooms + dense_rooms:
            if evidence_index >= len(evidence_pool):
                break
            assignments[room].append(evidence_pool[evidence_index])
            evidence_index += 1

    by_id = {item.evidence_id: item for item in world.evidence}
    rooms: list[InvestigationRoom] = []
    for room_name in room_names:
        assigned = assignments[room_name]
        for item in assigned:
            if item.evidence_id in by_id:
                by_id[item.evidence_id].location = room_name
        evidence_ids = [item.evidence_id for item in assigned]
        rooms.append(
            InvestigationRoom(
                room_id=_room_id(room_name),
                name=_title_room(room_name),
                description=_room_description(room_name, len(evidence_ids)),
                evidence_ids=evidence_ids,
                clue_count=len(evidence_ids),
            )
        )

    # Keep empty rooms visible, but put clue-bearing rooms first in a stable order.
    world.rooms = sorted(rooms, key=lambda room: (room.clue_count == 0, room.name))


def _candidate_room_names(
    world: WorldState,
    source_context: dict[str, Any],
    total_rooms: int,
) -> list[str]:
    lane = _creative_lane(world.slot_index)
    names: list[str] = []
    names.extend(evidence.location for evidence in world.evidence if evidence.location.strip())
    names.extend(lane.get("locations", []))
    names.extend(source_context.get("selected", {}).get("setting", "").split(","))
    names.extend(
        [
            "Drawing Room",
            "Private Study",
            "Servants' Hall",
            "Guest Corridor",
            "Kitchen",
            "Library Alcove",
            "Back Stair",
            "Dining Room",
            "Coat Room",
            "Side Parlor",
        ]
    )

    unique: list[str] = []
    seen: set[str] = set()
    for name in names:
        title = _title_room(str(name))
        key = _room_id(title)
        if title and key not in seen:
            unique.append(title)
            seen.add(key)

    while len(unique) < total_rooms:
        fallback = f"Unused Room {len(unique) + 1}"
        unique.append(fallback)

    return unique


def _room_id(name: str) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "_" for char in name.strip())
    return "_".join(part for part in normalized.split("_") if part) or "unknown_room"


def _title_room(name: str) -> str:
    return " ".join(part.capitalize() for part in name.replace("_", " ").split())


def _room_description(name: str, clue_count: int) -> str:
    title = _title_room(name)
    if clue_count == 0:
        return f"Search the {title}; it may be a dead end."
    if clue_count == 1:
        return f"Search the {title}; one clue may be hidden here."
    return f"Search the {title}; several details may matter here."


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
            avoided_motives_text=source_context.get("avoided_motives_text", "No recent motive restrictions."),
            diverse_context=source_context.get("diverse_context", ""),
            case_recipe=recipe.model_dump_json(indent=2),
            generation_sources=json.dumps(source_context["generation_sources"], indent=2),
            creative_lane=json.dumps(source_context.get("creative_lane", {}), indent=2),
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
    lane = _creative_lane(slot_index)
    lead_motif = _first_motif(literary_refs)
    persona_names = [persona["archetype"] for persona in personas]

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
        subgenre=lane["subgenre"],
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


def _apply_creative_lane(
    source_context: dict[str, Any],
    case_date: str,
    slot_index: int,
    variant_seed: int,
) -> dict[str, Any]:
    """Force each daily slot into a separate creative lane before prompting."""
    patched = copy.deepcopy(source_context)
    lane = _creative_lane(slot_index)
    rng = random.Random(f"{case_date}:lane:{slot_index}:{variant_seed}")

    selected = {
        "setting": rng.choice(lane["settings"]),
        "mood": rng.choice(lane["moods"]),
        "victim_role": rng.choice(lane["victim_roles"]),
        "killer_pressure": rng.choice(lane["killer_pressures"]),
        "relationship_pattern": rng.choice(lane["relationship_patterns"]),
        "clue_styles": _sample_lane_values(rng, lane["clue_styles"], 3),
    }

    fbi_entry = patched["raw"]["fbi"]
    fbi_entry["id"] = f"{fbi_entry.get('id', 'source')}_{lane['label'].replace(' ', '_')}"
    fbi_entry["motive_family"] = lane["motive_family"]
    fbi_entry["relationship_patterns"] = lane["relationship_patterns"]
    fbi_entry["suspect_pressures"] = lane["killer_pressures"]
    fbi_entry["victim_roles"] = lane["victim_roles"]
    fbi_entry["settings"] = lane["settings"]
    fbi_entry["clue_styles"] = lane["clue_styles"]
    fbi_entry["emotional_tones"] = lane["moods"]

    patched["motive_family"] = lane["motive_family"]
    patched["selected"] = selected
    patched["selected_context"] = json.dumps(selected, indent=2)
    patched["fbi_context"] = json.dumps(fbi_entry, indent=2)
    patched["persona_context"] = json.dumps(patched["raw"]["personas"], indent=2)
    patched["creative_lane"] = {
        "slot_lane": lane["label"],
        "must_use_setting_family": lane["settings"],
        "must_use_motive_family": lane["motive_family"],
        "must_use_clue_styles": lane["clue_styles"],
        "distinct_from_other_slots": "Different victim role, cast, cause, evidence chain, room pattern, and visual design. A garden-style mystery is allowed only when it fits this lane and must not be repeated across other slots.",
    }
    patched["generation_sources"]["fbi_id"] = fbi_entry.get("id", "")
    return patched


def _creative_lane(slot_index: int) -> dict[str, Any]:
    return DAILY_CREATIVE_LANES[(slot_index - 1) % len(DAILY_CREATIVE_LANES)]


def _sample_lane_values(rng: random.Random, values: list[str], count: int) -> list[str]:
    shuffled = values[:]
    rng.shuffle(shuffled)
    return shuffled[: min(count, len(shuffled))]


def _first_motif(literary_refs: list[dict]) -> str:
    for ref in literary_refs:
        motifs = ref.get("motifs")
        if isinstance(motifs, list) and motifs:
            return str(motifs[0])
    return "misdirection"


def _synthesize_story_fields(world: WorldState) -> None:
    """Fill narrative flavor fields when the LLM omitted them; Victorian-tinged prose."""
    victim = world.victim if isinstance(world.victim, Victim) else Victim.model_validate(world.victim)
    recipe = world.case_recipe
    primary_room = world.evidence[0].location if world.evidence else world.setting
    motive_family = recipe.motive_family if recipe else "the household"
    central = recipe.central_conflict if recipe else world.motive
    pressure = recipe.killer_pressure if recipe else world.motive

    if not world.backstory.strip():
        world.backstory = (
            f"{victim.name} had long been known in {world.setting} as a {victim.occupation.lower()} of rigid habits and softer creditors—"
            f"admired by some, resented by others who remembered old slights. "
            f"Whispers of {motive_family} followed them like cigar smoke; none thought the reckoning would arrive so abruptly."
        )

    if not world.crime_scene_detail.strip():
        world.crime_scene_detail = (
            f"The body was discovered in the {primary_room.lower()}, positioned near the hearth as though the deceased had sought warmth one last time; "
            f"rain on the glass and a watch still ticking mocked the hush that followed."
        )

    if not world.stakes.strip():
        world.stakes = (
            f"With {central}, whoever stands convicted may forfeit more than freedom—inheritance, patronage, and the very honour of the house tremble in the balance. "
            f"The killer moved under pressure of {pressure}; until the truth is named, every alibi is a wound in the family ledger."
        )

    if not world.timeline_context.strip():
        parts: list[str] = []
        for event in world.timeline[:8]:
            t = str(event.get("time", "")).strip()
            e = str(event.get("event", "")).strip()
            if t and e:
                parts.append(f"At {t}, {e.rstrip('.')}.")
        world.timeline_context = (
            " ".join(parts)
            if parts
            else (
                f"The evening unwound across {world.setting} in a procession of quarrels and errands—"
                f"each witness certain they alone marked the turning of the clock."
            )
        )


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
    lane = _creative_lane(slot_index)

    victim_name = rng.choice(lane["victim_names"])
    victim_age = rng.randint(47, 68)
    victim_job = rng.choice(lane["victim_roles"])
    cause = rng.choice(lane["causes"])
    title = rng.choice(lane["titles"])
    setting = recipe.setting
    mood = recipe.mood

    roles = ["suspect_1", "suspect_2", "suspect_3"]
    names_by_lane = [
        [
            ["Dr. Elias Ward", "Clara Whitmore", "Owen Hale", "Lucian Pike"],
            ["Beatrice Lyle", "Nina Crosse", "Mabel Ainsworth", "Irene Shaw"],
            ["Miles Dacre", "Rosalind Pike", "Victor Sloane", "Jonas Vale"],
        ],
        [
            ["Gideon Price", "Celia North", "Owen Keats", "Nadia Cross"],
            ["Arthur Bell", "Mara Voss", "Simon Locke", "Elise Grant"],
            ["Victor Sloane", "Ruth Calder", "Jonas Vale", "Leon Pryce"],
        ],
        [
            ["Dr. Elias Ward", "Claudia Voss", "Lucian Pike", "Mara Bell"],
            ["Beatrice Lyle", "Nina Crosse", "Thomas Grey", "Irene Shaw"],
            ["Miles Dacre", "Rosalind Pike", "Victor Sloane", "Ada North"],
        ],
    ]
    names = names_by_lane[(slot_index - 1) % len(names_by_lane)]
    fallback_locations = lane["locations"]
    characters: list[Character] = []
    for index, persona in enumerate(personas):
        character_id = roles[index]
        is_killer = index == 0
        relationship = rng.choice(persona["relationship_styles"])
        occupation = rng.choice(persona["occupations"])
        secret_tendency = rng.choice(persona["secret_tendencies"])
        knowledge = [
            f"The victim was tied to {fbi_entry['motive_family']} before the murder.",
            f"They noticed {rng.choice(lane['clue_styles'])} become important late in the evening.",
        ]
        alibi = (
            f"I stayed near the {fallback_locations[0].lower()} and never crossed the {fallback_locations[2].lower()}."
            if is_killer
            else f"I was near the {rng.choice(fallback_locations).lower()} when the alarm rose."
        )
        chosen_name = rng.choice(names[index])
        characters.append(
            Character(
                character_id=character_id,
                name=chosen_name,
                age=rng.randint(28, 58),
                occupation=occupation,
                relationship_to_victim=relationship,
                motive=f"They feared losing standing because of {fbi_entry['motive_family']}.",
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
            time_of_death="around 9:20 PM",
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
        "backstory": (
            f"{victim_name}, a {victim_job.lower()} of commanding presence, had moved through {setting} "
            f"like weather—courted, feared, and quietly blamed when fortunes turned. "
            f"Whispers of {fbi_entry['motive_family']} dogged their steps; none guessed how soon the reckoning would come."
        ),
        "crime_scene_detail": (
            f"The body was discovered in the {fallback_locations[0].lower()}, positioned near the fireplace; "
            f"guttering light and the hush of {mood.lower()} dread lent the scene the stillness of a sealed verdict."
        ),
        "stakes": (
            f"With {recipe.motive_family} thundering beneath polite conversation, inheritance and honour tremble in the balance; "
            f"should the wrong name be spoken aloud, a dynasty may founder. Each suspect guards a motive sharp enough to draw blood."
        ),
        "timeline_context": (
            "The clock betrayed them in order: assembly at eight-ten, a letter's sting at eight-forty, "
            "a quarrel at nine-five, a slipped errand at nine-twenty, and by nine-forty-five the corridor rang with alarm."
        ),
        "characters": [character.model_dump() for character in characters],
        "evidence": [
            Evidence(
                evidence_id="evidence_1",
                name=rng.choice(["Smudged ledger page", "Revised will page", "Damaged account sheet", "Altered register page"]),
                location=fallback_locations[0],
                description=(
                    f"A document linked to {recipe.motive_family} suggests someone altered the victim's plans on the night of the murder."
                ),
                implicates="suspect_1",
                is_red_herring=False,
            ).model_dump(),
            Evidence(
                evidence_id="evidence_2",
                name=rng.choice(["Water-stained telegram", "Unsigned warning note", "Damaged calling card", "Torn photograph"]),
                location=fallback_locations[1],
                description=(
                    f"This clue points toward {recipe.killer_pressure} and makes one innocent suspect look dangerously plausible."
                ),
                implicates=rng.choice(["suspect_2", "suspect_3"]),
                is_red_herring=True,
            ).model_dump(),
            Evidence(
                evidence_id="evidence_3",
                name=rng.choice(["Finger-marked cordial glass", "Disturbed nightcap tray", "Misplaced service glass", "Locked dispatch case"]),
                location=fallback_locations[2],
                description="The replacement drink or tray shows the killer tampered with a familiar household ritual.",
                implicates="suspect_1",
                is_red_herring=False,
            ).model_dump(),
            Evidence(
                evidence_id="evidence_4",
                name=rng.choice(["Unsigned warning letter", "Burned correspondence", "Locked dispatch note", "Hidden photograph"]),
                location=fallback_locations[3],
                description=(
                    f"The hidden paper implies the victim discovered {rng.choice(fbi_entry['suspect_pressures'])} but had not yet named the culprit."
                ),
                implicates="none",
                is_red_herring=False,
            ).model_dump(),
            Evidence(
                evidence_id="evidence_5",
                name=rng.choice(["Scuffed evening shoes", "Wet footprint trail", "Split cuff button", "Fresh ash smear"]),
                location=fallback_locations[4],
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


def _save_generation_history(
    case_date: str,
    slot_index: int,
    fbi_id: str,
    persona_ids: list[str],
    literary_ids: list[str],
) -> None:
    """Record this generation in the database so future slots can avoid repeating it."""
    try:
        db = get_db()
        cursor = db.cursor()
        history_id = f"{case_date}-slot-{slot_index}-{uuid.uuid4().hex[:8]}"
        generated_at = datetime.now(timezone.utc).isoformat()

        cursor.execute(
            """
            INSERT OR REPLACE INTO generation_history
            (history_id, case_date, slot_index, fbi_id, persona_ids_json, literary_ids_json, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                history_id,
                case_date,
                slot_index,
                fbi_id,
                json.dumps(persona_ids),
                json.dumps(literary_ids),
                generated_at,
            ),
        )
        db.commit()
    except Exception:
        # If database save fails, continue (non-critical)
        pass
