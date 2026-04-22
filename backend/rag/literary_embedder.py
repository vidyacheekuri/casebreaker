"""Layer 2 literary corpus ingest helpers."""

from __future__ import annotations

from rag.chroma_client import get_chroma_client
from utils.config import LITERARY_COLLECTION_NAME
from utils.embeddings import embed_text
from utils.source_material import load_gutenberg_passages


def ensure_default_literary_corpus() -> int:
    """Seed the literary corpus with a small default set if empty."""
    client = get_chroma_client()
    collection = client.get_or_create_collection(name=LITERARY_COLLECTION_NAME)
    existing = collection.count()
    if existing > 0:
        return existing

    passages = load_gutenberg_passages()
    collection.upsert(
        ids=[entry["id"] for entry in passages],
        documents=[entry["text"] for entry in passages],
        embeddings=[embed_text(entry["text"]) for entry in passages],
        metadatas=[
            {
                "source_title": entry["source_title"],
                "source_author": entry["source_author"],
                "motifs": ", ".join(entry["motifs"]),
            }
            for entry in passages
        ],
    )
    return collection.count()
