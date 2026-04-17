"""
World Embedder — populates Layer 1 ChromaDB collection with daily world state.

Input: WorldState
Output: None (side effect: creates/overwrites ChromaDB collection)
Process: Chunk world into documents (character profiles, timeline events, evidence),
         embed with text-embedding-3-small, upsert into daily_{YYYY_MM_DD}_world.

RAG Layer: 1 (World State)
Called by: scheduler/daily_job after Architect generates world
"""

import json

from langchain_openai import OpenAIEmbeddings

from casebreaker.backend.models import WorldState
from casebreaker.backend.rag.chroma_client import get_chroma_client
from casebreaker.backend.utils.config import (
    EMBEDDING_MODEL,
    OPENAI_API_KEY,
)


def _chunk_world(world: WorldState) -> list[tuple[str, dict]]:
    """
    Chunk WorldState into (text, metadata) pairs for embedding.

    Returns list of (document_text, metadata) for ChromaDB.
    """
    chunks: list[tuple[str, dict]] = []

    # Character profiles
    for char in world.characters:
        char_text = (
            f"Character: {char.name} (id: {char.character_id})\n"
            f"Age: {char.age}, Occupation: {char.occupation}\n"
            f"Relationship to victim: {char.relationship_to_victim}\n"
            f"Personality: {char.personality}\n"
            f"Alibi: {char.alibi}\n"
            f"Alibi is real: {char.alibi_true}\n"
            f"Secret: {char.secret}\n"
            f"Knowledge: {', '.join(char.knowledge)}\n"
            f"Is killer: {char.is_killer}"
        )
        chunks.append(
            (
                char_text,
                {
                    "type": "character",
                    "character_id": char.character_id,
                    "name": char.name,
                },
            )
        )

    # Timeline events
    for i, evt in enumerate(world.timeline):
        evt_text = (
            f"Timeline event at {evt.get('time', '')}: {evt.get('event', '')}\n"
            f"Witnessed by: {', '.join(evt.get('witnessed_by', []))}"
        )
        chunks.append(
            (
                evt_text,
                {
                    "type": "timeline",
                    "index": i,
                    "time": evt.get("time", ""),
                },
            )
        )

    # Evidence
    for ev in world.evidence:
        ev_text = (
            f"Evidence: {ev.name} (id: {ev.evidence_id})\n"
            f"Location: {ev.location}\n"
            f"Description: {ev.description}\n"
            f"Implicates: {ev.implicates}\n"
            f"Red herring: {ev.is_red_herring}"
        )
        chunks.append(
            (
                ev_text,
                {
                    "type": "evidence",
                    "evidence_id": ev.evidence_id,
                    "name": ev.name,
                },
            )
        )

    # Victim summary
    victim = world.victim
    if isinstance(victim, dict):
        v_name = victim.get("name", "")
        v_age = victim.get("age", "")
        v_occ = victim.get("occupation", "")
        v_cod = victim.get("cause_of_death", "")
    else:
        v_name, v_age = victim.name, victim.age
        v_occ, v_cod = victim.occupation, victim.cause_of_death

    victim_text = (
        f"Victim: {v_name}, age {v_age}, {v_occ}\n"
        f"Cause of death: {v_cod}\n"
        f"Setting: {world.setting}"
    )
    chunks.append((victim_text, {"type": "victim"}))

    return chunks


def embed_world(world: WorldState, persist_directory: str | None = None) -> None:
    """
    Embed WorldState into ChromaDB Layer 1 collection.

    Input: WorldState
    Output: None
    Side effect: Creates/overwrites collection world.chroma_collection with
                 embedded documents.

    RAG Layer: 1
    """
    client = get_chroma_client()
    embeddings_fn = OpenAIEmbeddings(
        model=EMBEDDING_MODEL,
        api_key=OPENAI_API_KEY,
    )

    chunks = _chunk_world(world)
    documents = [c[0] for c in chunks]
    metadatas = [c[1] for c in chunks]

    # ChromaDB metadata values must be str, int, float, or bool
    clean_metadatas = []
    for m in metadatas:
        clean = {}
        for k, v in m.items():
            if isinstance(v, (str, int, float, bool)):
                clean[k] = v
            else:
                clean[k] = str(v)
        clean_metadatas.append(clean)

    ids = [f"doc_{i}" for i in range(len(documents))]

    # Get or create collection (overwrites if exists for same-day refresh)
    collection = client.get_or_create_collection(
        name=world.chroma_collection,
        metadata={"description": "Daily world state"},
    )

    # Delete existing documents and re-add (idempotent for daily refresh)
    try:
        collection.delete(ids)
    except Exception:
        pass

    # Embed and add
    embeds = embeddings_fn.embed_documents(documents)
    collection.add(
        ids=ids,
        documents=documents,
        embeddings=embeds,
        metadatas=clean_metadatas,
    )
