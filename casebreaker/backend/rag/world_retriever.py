"""
World Retriever — queries Layer 1 ChromaDB for character agent context.

Input: character_id, collection_name, optional query for relevant context
Output: Retrieved text (character profile + relevant timeline/evidence)
Process: Query ChromaDB for character profile by metadata, then optionally
         query for relevant timeline/evidence by semantic similarity.

RAG Layer: 1 (World State)
Called by: Character agent before every response
"""

from langchain_openai import OpenAIEmbeddings

from casebreaker.backend.rag.chroma_client import get_chroma_client


def retrieve_character_context(
    character_id: str,
    collection_name: str,
    query: str | None = None,
    n_results: int = 10,
    embedding_fn: OpenAIEmbeddings | None = None,
) -> str:
    """
    Retrieve context for a character agent from Layer 1 RAG.

    Input:
        character_id: The suspect's character_id
        collection_name: e.g. daily_2026_03_08_world
        query: Optional — player message + context for relevance search
        n_results: Max results to return (default 10)
        embedding_fn: OpenAI embeddings (injected for testing)

    Output:
        Concatenated retrieved text for the character agent prompt

    RAG Layer: 1
    """
    from casebreaker.backend.utils.config import EMBEDDING_MODEL, OPENAI_API_KEY

    client = get_chroma_client()
    if embedding_fn is None:
        embedding_fn = OpenAIEmbeddings(
            model=EMBEDDING_MODEL,
            api_key=OPENAI_API_KEY,
        )

    try:
        collection = client.get_collection(name=collection_name)
    except Exception:
        return ""

    # First: get character profile by metadata filter
    char_results = collection.get(
        where={"character_id": character_id},
        include=["documents"],
    )
    char_text = ""
    if char_results and char_results.get("documents"):
        char_text = "\n\n".join(char_results["documents"])

    # Second: if query provided, get relevant timeline + evidence
    context_parts = [char_text]
    if query and char_text:
        query_embedding = embedding_fn.embed_query(query)
        rel_results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(n_results, 5),
            include=["documents", "metadatas"],
        )
        if rel_results and rel_results.get("documents"):
            docs = rel_results["documents"][0]
            metas = rel_results.get("metadatas", [[]])[0]
            seen = set()
            for doc, meta in zip(docs, metas or []):
                t = meta.get("type", "")
                if t in ("timeline", "evidence", "victim") and doc not in seen:
                    context_parts.append(doc)
                    seen.add(doc)

    return "\n\n---\n\n".join(context_parts) if context_parts else char_text
