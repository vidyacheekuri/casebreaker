"""Load and select grounded source material for story generation."""

from __future__ import annotations

import json
import random
from pathlib import Path

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


def select_story_grounding(case_date: str, slot_index: int, variant_seed: int = 0) -> dict:
    """Choose one grounded package for a slot from the three source layers."""
    rng = random.Random(f"{case_date}:grounding:{slot_index}:{variant_seed}")
    fbi_patterns = load_fbi_patterns()
    personas = load_persona_archetypes()
    fbi_rng = random.Random(f"{case_date}:fbi-order:{variant_seed}")
    fbi_rng.shuffle(fbi_patterns)
    fbi_entry = fbi_patterns[(slot_index - 1) % len(fbi_patterns)]

    shuffled_personas = personas[:]
    rng.shuffle(shuffled_personas)
    selected_personas = shuffled_personas[:3]

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
    }


def build_generation_context(case_date: str, slot_index: int, variant_seed: int = 0) -> dict:
    """Return prompt-ready text blocks for grounded generation."""
    grounding = select_story_grounding(case_date, slot_index, variant_seed)
    fbi_entry = grounding["fbi"]
    personas = grounding["personas"]
    literary_refs = grounding["literary_refs"]

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
        "raw": grounding,
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
