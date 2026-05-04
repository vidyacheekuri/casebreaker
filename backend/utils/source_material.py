"""Load and select grounded source material for story generation."""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from db.database import get_db
from rag.chroma_client import get_chroma_client
from utils.config import BACKEND_ROOT, LITERARY_COLLECTION_NAME
from utils.embeddings import embed_text

DATA_SOURCES_DIR = BACKEND_ROOT / "data_sources"


def load_fbi_patterns() -> list[dict]:
    """Return curated motive and relationship priors inspired by FBI-style crime patterns."""
    return _load_json("fbi_motives.json")


def load_persona_archetypes() -> list[dict]:
    """Return suspect archetypes used to shape the three core characters."""
    return _load_json("persona_archetypes.json")


def load_gutenberg_passages() -> list[dict]:
    """Return literary motif notes derived from public-domain detective fiction."""
    return _load_json("gutenberg_passages.json")


def load_victim_archetypes() -> list[dict]:
    """Return victim character types and social positions."""
    return _load_json("victim_archetypes.json")


def load_murder_methods() -> list[dict]:
    """Return detailed murder methods with clue opportunities."""
    return _load_json("murder_methods.json")


def load_clue_strategies() -> list[dict]:
    """Return algorithms for evidence distribution and placement."""
    return _load_json("clue_strategies.json")


def load_role_strategies() -> list[dict]:
    """Return patterns for suspect role assignment (killer vs innocent)."""
    return _load_json("role_strategies.json")


def load_time_periods() -> list[dict]:
    """Return historical periods with era-specific details."""
    return _load_json("time_periods.json")


def load_social_dynamics() -> list[dict]:
    """Return relationship dynamic types and power structures."""
    return _load_json("social_dynamics.json")


def load_locations_detailed() -> list[dict]:
    """Return detailed location/room descriptions with sensory and tactical details."""
    return _load_json("locations_detailed.json")


def load_narrative_structures() -> list[dict]:
    """Return narrative patterns and story structures."""
    return _load_json("narrative_structures.json")


def load_victim_method_matrix() -> list[dict]:
    """Return victim-method compatibility matrix with vulnerabilities and evidence patterns."""
    return _load_json("victim_method_matrix.json")


def get_recent_generation_history(case_date: str, days_back: int = 7) -> list[dict]:
    """Return recently-used FBI/persona/literary combinations to avoid repeats."""
    try:
        db = get_db()
        cursor = db.cursor()

        # Calculate date range
        target_date = datetime.fromisoformat(case_date).replace(tzinfo=timezone.utc)
        start_date = (target_date - timedelta(days=days_back)).strftime("%Y-%m-%d")

        # Query recent history
        cursor.execute(
            """
            SELECT fbi_id, persona_ids_json, literary_ids_json
            FROM generation_history
            WHERE case_date >= ? AND case_date < ?
            ORDER BY generated_at DESC
            """,
            (start_date, case_date),
        )

        rows = cursor.fetchall()
        history = []
        for fbi_id, persona_json, literary_json in rows:
            history.append({
                "fbi_id": fbi_id,
                "persona_ids": json.loads(persona_json),
                "literary_ids": json.loads(literary_json),
            })
        return history
    except Exception:
        # If database unavailable, return empty (no avoidance)
        return []


def get_recent_archetype_roles(case_date: str, days_back: int = 3) -> dict:
    """Return recent archetype role assignments to avoid repetition."""
    try:
        db = get_db()
        cursor = db.cursor()

        target_date = datetime.fromisoformat(case_date).replace(tzinfo=timezone.utc)
        start_date = (target_date - timedelta(days=days_back)).strftime("%Y-%m-%d")

        # Query recent persona usage
        cursor.execute(
            """
            SELECT persona_ids_json
            FROM generation_history
            WHERE case_date >= ? AND case_date < ?
            ORDER BY generated_at DESC
            LIMIT 5
            """,
            (start_date, case_date),
        )

        rows = cursor.fetchall()
        recent_trios = set()
        recent_any_archetype = set()

        # Load persona data to get archetypes
        personas_by_id = {p["id"]: p["archetype"] for p in load_persona_archetypes()}

        for (persona_json,) in rows:
            persona_ids = json.loads(persona_json)
            trio = tuple(sorted([personas_by_id.get(pid, "") for pid in persona_ids]))
            recent_trios.add(trio)

            # Track any archetype usage
            for pid in persona_ids:
                recent_any_archetype.add(personas_by_id.get(pid, ""))

        return {
            "recent_trios": list(recent_trios),
            "recent_archetypes": list(recent_any_archetype),
        }
    except Exception:
        return {"recent_trios": [], "recent_archetypes": []}


def select_story_grounding(case_date: str, slot_index: int, variant_seed: int = 0) -> dict:
    """Choose one grounded package for a slot from the three source layers.

    Avoids recently-used combinations from the past 7 days to ensure daily variety.
    Also avoids archetype repetition to keep suspect profiles diverse.
    """
    rng = random.Random(f"{case_date}:grounding:{slot_index}:{variant_seed}")
    fbi_patterns = load_fbi_patterns()
    personas = load_persona_archetypes()

    # Get recent history to avoid repeats
    recent_history = get_recent_generation_history(case_date, days_back=7)
    recently_used_fbi_ids = {h["fbi_id"] for h in recent_history}

    # Get recent archetype usage to avoid repetition
    role_data = get_recent_archetype_roles(case_date, days_back=3)
    recent_trios = role_data.get("recent_trios", [])

    # Choose FBI motive: prioritize unused, but allow if necessary
    available_fbi = [f for f in fbi_patterns if f["id"] not in recently_used_fbi_ids]
    if not available_fbi:
        # Fallback: use least recent
        available_fbi = fbi_patterns
    fbi_entry = rng.choice(available_fbi)

    # Choose 3 personas: avoid combinations used recently AND avoid repeating archetypes
    recently_used_persona_sets = {
        tuple(sorted(h["persona_ids"])) for h in recent_history
    }

    # Try to find unused persona combination with diverse archetypes
    best_personas = None
    for attempt in range(20):
        shuffled_personas = personas[:]
        rng.shuffle(shuffled_personas)
        selected_personas = shuffled_personas[:3]
        persona_key = tuple(sorted([p["id"] for p in selected_personas]))
        archetypes = tuple(sorted([p["archetype"] for p in selected_personas]))

        # Check if this combination is available
        if (persona_key not in recently_used_persona_sets and
            archetypes not in recent_trios):
            best_personas = selected_personas
            break
        elif best_personas is None:
            # Keep this as fallback if can't find perfect match
            best_personas = selected_personas

    selected_personas = best_personas

    selected_setting = rng.choice(fbi_entry["settings"])
    selected_mood = rng.choice(fbi_entry["emotional_tones"])
    selected_victim_role = rng.choice(fbi_entry["victim_roles"])
    selected_pressure = rng.choice(fbi_entry["suspect_pressures"])
    selected_relationship_pattern = rng.choice(fbi_entry["relationship_patterns"])
    clue_styles = fbi_entry["clue_styles"][:]
    rng.shuffle(clue_styles)
    selected_clue_styles = clue_styles[: min(3, len(clue_styles))]

    literary_refs = query_literary_references(
        [
            fbi_entry["motive_family"],
            selected_relationship_pattern,
            selected_pressure,
            *selected_clue_styles,
            *[persona["archetype"] for persona in selected_personas],
        ],
        limit=3,
    )

    return {
        "fbi": fbi_entry,
        "personas": selected_personas,
        "literary_refs": literary_refs,
        "selected": {
            "setting": selected_setting,
            "mood": selected_mood,
            "victim_role": selected_victim_role,
            "killer_pressure": selected_pressure,
            "relationship_pattern": selected_relationship_pattern,
            "clue_styles": selected_clue_styles,
        },
        "avoided": {
            "recently_used_fbi_ids": list(recently_used_fbi_ids),
            "avoided_motives": [
                fbi["motive_family"] for fbi in fbi_patterns
                if fbi["id"] in recently_used_fbi_ids
            ],
        },
    }


def select_method_for_victim(victim_id: str, case_date: str, variant_seed: int = 0) -> tuple[dict, dict]:
    """Select murder method with compatibility to victim archetype.

    Returns (murder_method, victim_method_details)
    """
    rng = random.Random(f"{case_date}:method-victim:{victim_id}:{variant_seed}")

    # Load matrix
    matrix = load_victim_method_matrix()
    all_methods = load_murder_methods()

    # Find victim in matrix
    victim_entry = next((v for v in matrix if v["victim_id"] == victim_id), None)

    if not victim_entry:
        # Fallback: random method
        return (rng.choice(all_methods), {})

    # Weight selections by compatibility
    high_compat = [m for m in victim_entry["method_compatibility"] if m["compatibility"] in ["high", "very high"]]
    medium_compat = [m for m in victim_entry["method_compatibility"] if m["compatibility"] == "medium"]
    low_compat = [m for m in victim_entry["method_compatibility"] if m["compatibility"] in ["low"]]

    # Choose weighted toward high compatibility
    weights = [3] * len(high_compat) + [2] * len(medium_compat) + [1] * len(low_compat)
    all_compat = high_compat + medium_compat + low_compat

    if not all_compat:
        return (rng.choice(all_methods), {})

    # Pick weighted selection
    victim_method_details = rng.choices(all_compat, weights=weights, k=1)[0]
    method_id = victim_method_details["method_id"]

    # Find the actual method from database
    murder_method = next((m for m in all_methods if m["id"] == method_id), rng.choice(all_methods))

    return (murder_method, victim_method_details)


def select_diverse_elements(case_date: str, slot_index: int, variant_seed: int = 0) -> dict:
    """Select diverse story elements beyond core grounding: victim, method, locations, structure."""
    rng = random.Random(f"{case_date}:diverse:{slot_index}:{variant_seed}")

    # Select victim archetype first
    victim_archetype = rng.choice(load_victim_archetypes())

    # Select method BASED ON victim compatibility
    murder_method, victim_method_details = select_method_for_victim(
        victim_archetype["id"], case_date, variant_seed
    )

    clue_strategy = rng.choice(load_clue_strategies())
    role_strategy = rng.choice(load_role_strategies())
    time_period = rng.choice(load_time_periods())
    social_dynamic = rng.choice(load_social_dynamics())
    narrative_structure = rng.choice(load_narrative_structures())

    # Select 3-4 locations for room distribution
    all_locations = load_locations_detailed()
    selected_locations = rng.sample(all_locations, k=min(5, len(all_locations)))

    return {
        "victim_archetype": victim_archetype,
        "murder_method": murder_method,
        "victim_method_details": victim_method_details,
        "clue_strategy": clue_strategy,
        "role_strategy": role_strategy,
        "time_period": time_period,
        "social_dynamic": social_dynamic,
        "narrative_structure": narrative_structure,
        "locations": selected_locations,
    }


def build_generation_context(case_date: str, slot_index: int, variant_seed: int = 0) -> dict:
    """Return prompt-ready text blocks for grounded generation."""
    grounding = select_story_grounding(case_date, slot_index, variant_seed)
    diverse = select_diverse_elements(case_date, slot_index, variant_seed)

    fbi_entry = grounding["fbi"]
    personas = grounding["personas"]
    literary_refs = grounding["literary_refs"]
    avoided = grounding.get("avoided", {})

    # Format avoided motives for the prompt
    avoided_motives_text = ""
    if avoided.get("avoided_motives"):
        avoided_motives_text = "Recently used motives to avoid:\n" + "\n".join(
            f"- {motive}" for motive in avoided["avoided_motives"]
        )

    # Format diverse elements for the prompt
    victim_method_details = diverse.get("victim_method_details", {})
    victim_method_section = ""
    if victim_method_details:
        victim_method_section = (
            f"\nVICTIM-METHOD COMPATIBILITY:\n"
            f"- Fit: {victim_method_details.get('compatibility', 'unknown')}\n"
            f"- Narrative fit: {victim_method_details.get('narrative_fit', '')}\n"
            f"- Victim vulnerability: {victim_method_details.get('vulnerability', '')}\n"
            f"- Difficulty for killer: {victim_method_details.get('difficulty_score', '?')}/10\n"
            f"- Believability: {victim_method_details.get('believability', '')}\n"
            f"- Detective insight: {victim_method_details.get('detective_insight', '')}\n"
        )

    diverse_context = (
        f"VICTIM ARCHETYPE: {diverse['victim_archetype']['archetype']}\n"
        f"- Social position: {diverse['victim_archetype']['social_position']}\n"
        f"- Secrets: {', '.join(diverse['victim_archetype']['private_secrets'][:2])}\n"
        f"- Vulnerabilities: {', '.join(diverse['victim_archetype']['vulnerabilities'][:2])}\n\n"
        f"MURDER METHOD: {diverse['murder_method']['method']}\n"
        f"- Mechanism: {diverse['murder_method']['mechanism']}\n"
        f"- Key clues: {', '.join(diverse['murder_method']['key_clues'][:3])}\n"
        f"{victim_method_section}\n"
        f"NARRATIVE STRUCTURE: {diverse['narrative_structure']['structure']}\n"
        f"- Flow: {diverse['narrative_structure']['narrative_flow']}\n\n"
        f"SUSPECT ROLES STRATEGY: {diverse['role_strategy']['strategy']}\n"
        f"- Pattern: {diverse['role_strategy']['detective_misdirection']}\n\n"
        f"TIME PERIOD: {diverse['time_period']['period']}\n"
        f"- Era flavor: {diverse['time_period']['era_flavor']}\n\n"
        f"SOCIAL DYNAMIC: {diverse['social_dynamic']['dynamic']}\n"
        f"- Power imbalance: {diverse['social_dynamic']['power_imbalance']}"
    )

    location_names = [loc["name"] for loc in diverse["locations"]]

    return {
        "motive_family": fbi_entry["motive_family"],
        "selected": grounding["selected"],
        "generation_sources": {
            "fbi_id": fbi_entry.get("id", ""),
            "persona_ids": [persona.get("id", "") for persona in personas],
            "literary_ids": [
                ref.get("id")
                or ref.get("source_title")
                or ref.get("title")
                or f"literary_ref_{index}"
                for index, ref in enumerate(literary_refs, start=1)
            ],
        },
        "fbi_context": json.dumps(fbi_entry, indent=2),
        "persona_context": json.dumps(personas, indent=2),
        "literary_context": json.dumps(literary_refs, indent=2),
        "selected_context": json.dumps(grounding["selected"], indent=2),
        "avoided_motives_text": avoided_motives_text,
        "diverse_context": diverse_context,
        "location_names": location_names,
        "raw": grounding,
        "diverse_elements": diverse,
    }


def query_literary_references(terms: list[str], limit: int = 3) -> list[dict]:
    """Retrieve literary motif notes from Chroma, with local fallback if unavailable."""
    query = " ".join(term for term in terms if term)
    try:
        client = get_chroma_client()
        collection = client.get_or_create_collection(name=LITERARY_COLLECTION_NAME)
        if collection.count() > 0:
            result = collection.query(
                query_embeddings=[embed_text(query)],
                n_results=limit,
            )
            documents = result.get("documents", [[]])[0]
            metadatas = result.get("metadatas", [[]])[0]
            if documents:
                return [
                    {"text": document, **metadata}
                    for document, metadata in zip(documents, metadatas)
                ]
    except Exception:
        pass

    passages = load_gutenberg_passages()[:limit]
    return [
        {
            "id": passage.get("id", ""),
            "text": passage["text"],
            "source_title": passage["source_title"],
            "source_author": passage["source_author"],
            "motifs": passage["motifs"],
        }
        for passage in passages
    ]


def _load_json(filename: str) -> list[dict]:
    """Read a JSON array from the data_sources directory."""
    path = DATA_SOURCES_DIR / filename
    return json.loads(path.read_text(encoding="utf-8"))
