"""Layer 2 literary retrieval."""

from __future__ import annotations

from rag.chroma_client import get_chroma_client
from utils.config import LITERARY_COLLECTION_NAME
from utils.embeddings import embed_text


def query_literary_passages(query: str, limit: int = 3) -> list[dict]:
    """Return literary passages related to the supplied query text."""
    client = get_chroma_client()
    collection = client.get_or_create_collection(name=LITERARY_COLLECTION_NAME)
    result = collection.query(
        query_embeddings=[embed_text(query)],
        n_results=limit,
    )
    documents = result.get("documents", [[]])[0]
    metadatas = result.get("metadatas", [[]])[0]
    distances = result.get("distances", [[]])[0]
    return [
        {"document": document, "metadata": metadata, "distance": distance}
        for document, metadata, distance in zip(documents, metadatas, distances)
    ]
