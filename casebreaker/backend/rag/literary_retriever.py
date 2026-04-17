"""
Literary Retriever — queries Layer 2 ChromaDB for Detective's Instinct cards.

Input: Query string (player action + evidence description)
Output: DetectiveInstinct | None (if similarity >= INSTINCT_THRESHOLD)
Process: Semantic similarity search against literary_corpus collection.

RAG Layer: 2 (Literary Evidence)
Called by: Character agent after generating response (interrogation/evidence)
"""

from casebreaker.backend.models import DetectiveInstinct
from casebreaker.backend.utils.config import (
    EMBEDDING_MODEL,
    OPENAI_API_KEY,
    LAYER2_COLLECTION_NAME,
    INSTINCT_THRESHOLD,
)
from langchain_openai import OpenAIEmbeddings

from casebreaker.backend.rag.chroma_client import get_chroma_client


def retrieve_detective_instinct(
    query: str,
    threshold: float | None = None,
) -> DetectiveInstinct | None:
    """
    Query Layer 2 RAG for a Detective's Instinct passage.

    Input:
        query: Player message + character response (or evidence description)
        threshold: Min similarity (default INSTINCT_THRESHOLD)

    Output:
        DetectiveInstinct if best match >= threshold, else None

    RAG Layer: 2
    """
    if threshold is None:
        threshold = INSTINCT_THRESHOLD

    embeddings_fn = OpenAIEmbeddings(
        model=EMBEDDING_MODEL,
        api_key=OPENAI_API_KEY,
    )
    client = get_chroma_client()

    try:
        collection = client.get_collection(name=LAYER2_COLLECTION_NAME)
    except Exception:
        return None

    query_embedding = embeddings_fn.embed_query(query)
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=1,
        include=["documents", "metadatas", "distances"],
    )

    if not results or not results.get("documents") or not results["documents"][0]:
        return None

    doc = results["documents"][0][0]
    meta = (results.get("metadatas") or [[]])[0]
    dist = (results.get("distances") or [[]])[0]

    # ChromaDB returns L2 distance; lower = more similar
    # Convert to 0-1 similarity: 1 / (1 + distance)
    d = dist[0] if isinstance(dist, (list, tuple)) else dist
    similarity = 1.0 / (1.0 + float(d)) if d is not None else 1.0

    if similarity < threshold:
        return None

    source_title = meta.get("source_title", "Unknown") if meta else "Unknown"
    source_author = meta.get("source_author", "Unknown") if meta else "Unknown"

    return DetectiveInstinct(
        quote=doc,
        source_title=source_title,
        source_author=source_author,
        trigger=query[:200],
    )
