"""
Literary Embedder — ONE-TIME: embeds classic detective fiction into Layer 2 ChromaDB.

Input: List of (text_chunk, source_title, source_author) tuples
Output: None (side effect: populates literary_corpus collection)
Process: Embed chunks with text-embedding-3-small, upsert into literary_corpus.

RAG Layer: 2 (Literary Evidence)
Called by: scripts/build_literary_corpus.py (run once)
"""

from langchain_openai import OpenAIEmbeddings

from casebreaker.backend.rag.chroma_client import get_chroma_client
from casebreaker.backend.utils.config import (
    EMBEDDING_MODEL,
    OPENAI_API_KEY,
    LAYER2_COLLECTION_NAME,
)


def embed_literary_corpus(
    chunks: list[tuple[str, str, str]],
) -> None:
    """
    Embed literary chunks into ChromaDB Layer 2 collection.

    Input:
        chunks: List of (text, source_title, source_author)

    Output: None
    Side effect: Creates/overwrites literary_corpus collection

    RAG Layer: 2
    """
    if not chunks:
        return

    client = get_chroma_client()
    embeddings_fn = OpenAIEmbeddings(
        model=EMBEDDING_MODEL,
        api_key=OPENAI_API_KEY,
    )

    documents = [c[0] for c in chunks]
    metadatas = [
        {"source_title": c[1], "source_author": c[2], "chunk_id": f"lit_{i}"}
        for i, c in enumerate(chunks)
    ]
    ids = [f"lit_{i}" for i in range(len(documents))]

    embeds = embeddings_fn.embed_documents(documents)

    collection = client.get_or_create_collection(
        name=LAYER2_COLLECTION_NAME,
        metadata={"description": "Classic detective fiction for Detective's Instinct"},
    )

    # Upsert in batches (OpenAI rate limits)
    batch_size = 100
    for i in range(0, len(documents), batch_size):
        end = min(i + batch_size, len(documents))
        collection.upsert(
            ids=ids[i:end],
            documents=documents[i:end],
            embeddings=embeds[i:end],
            metadatas=metadatas[i:end],
        )
