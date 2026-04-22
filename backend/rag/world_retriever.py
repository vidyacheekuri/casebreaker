"""Layer 1 retrieval helpers."""

from __future__ import annotations

from rag.chroma_client import get_chroma_client
from utils.embeddings import embed_text


def query_world_context(collection_name: str, query: str, limit: int = 5) -> list[dict]:
    """Return nearest world-state documents from a slot collection."""
    client = get_chroma_client()
    collection = client.get_or_create_collection(name=collection_name)
    result = collection.query(
        query_embeddings=[embed_text(query)],
        n_results=limit,
    )
    documents = result.get("documents", [[]])[0]
    metadatas = result.get("metadatas", [[]])[0]
    return [
        {"document": document, "metadata": metadata}
        for document, metadata in zip(documents, metadatas)
    ]
