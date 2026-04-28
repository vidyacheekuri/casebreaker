"""Layer 1 world-state storage in Chroma."""

from __future__ import annotations

from models.world import WorldState
from rag.chroma_client import get_chroma_client
from utils.embeddings import embed_text


def embed_world(world: WorldState) -> None:
    """Embed one world into its own Chroma collection."""
    client = get_chroma_client()
    collection = client.get_or_create_collection(name=world.chroma_collection)

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict] = []
    embeddings: list[list[float]] = []

    for character in world.characters:
        doc = "\n".join(
            [
                f"Name: {character.name}",
                f"Occupation: {character.occupation}",
                f"Relationship: {character.relationship_to_victim}",
                f"Personality: {character.personality}",
                f"Speech style: {character.speech_style}",
                f"Emotional tell: {character.emotional_tell}",
                f"Lie strategy: {character.lie_strategy}",
                f"Private wound: {character.private_wound}",
                f"Pressure response: {character.pressure_response}",
                f"Relationship to other suspects: {character.relationship_to_other_suspects}",
                f"Alibi: {character.alibi}",
                f"Secret: {character.secret}",
                f"Knowledge: {'; '.join(character.knowledge)}",
            ]
        )
        ids.append(f"{world.slot_id}:{character.character_id}")
        documents.append(doc)
        metadatas.append(
            {
                "slot_id": world.slot_id,
                "type": "character",
                "character_id": character.character_id,
                "name": character.name,
            }
        )
        embeddings.append(embed_text(doc))

    for evidence in world.evidence:
        doc = f"{evidence.name} in {evidence.location}. {evidence.description}"
        ids.append(f"{world.slot_id}:{evidence.evidence_id}")
        documents.append(doc)
        metadatas.append(
            {
                "slot_id": world.slot_id,
                "type": "evidence",
                "evidence_id": evidence.evidence_id,
                "implicates": evidence.implicates,
            }
        )
        embeddings.append(embed_text(doc))

    for index, event in enumerate(world.timeline, start=1):
        doc = f"{event.get('time', 'Unknown time')}: {event.get('event', '')}"
        ids.append(f"{world.slot_id}:timeline:{index}")
        documents.append(doc)
        metadatas.append(
            {
                "slot_id": world.slot_id,
                "type": "timeline",
                "witnessed_by": ",".join(event.get("witnessed_by", [])),
            }
        )
        embeddings.append(embed_text(doc))

    collection.upsert(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas,
    )
