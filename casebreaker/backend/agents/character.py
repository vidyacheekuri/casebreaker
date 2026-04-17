"""
Character Agent — individual suspect agent using Layer 1 + Layer 2 RAG.

Input: player_message, character_id, session_state
Output: (response: str, detective_instinct: DetectiveInstinct | None)
Process:
  a) Query Layer 1 for character profile + context
  b) Check session_state for what player has revealed
  c) Generate response using retrieved context ONLY
  d) Query Layer 2 for Detective's Instinct (if similarity >= 0.75)
"""

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from casebreaker.backend.models import SessionState, DetectiveInstinct
from casebreaker.backend.rag.world_retriever import retrieve_character_context
from casebreaker.backend.rag.literary_retriever import retrieve_detective_instinct
from casebreaker.backend.api.state_store import daily_world_cache
from casebreaker.backend.utils.config import LLM_MODEL, OPENAI_API_KEY
from casebreaker.backend.utils.prompts import CHARACTER_SYSTEM_PROMPT, CHARACTER_USER_PROMPT


def _session_context_summary(session: SessionState) -> str:
    """Build a summary of what the player has revealed for this session."""
    parts = []
    if session.evidence_examined:
        parts.append(f"Evidence examined: {', '.join(session.evidence_examined)}")
    if session.player_claims:
        parts.append(f"Player claims: {'; '.join(session.player_claims[:5])}")
    if session.contradictions_found:
        parts.append(f"Contradictions surfaced: {', '.join(session.contradictions_found[:3])}")
    return "\n".join(parts) if parts else "Nothing revealed yet."


def interrogate(
    character_id: str,
    player_message: str,
    session: SessionState,
) -> tuple[str, str, DetectiveInstinct | None]:
    """
    Run character agent: retrieve context, generate response, optionally get Detective's Instinct.

    Input:
        character_id: e.g. char_1
        player_message: What the player said
        session: Current SessionState

    Output:
        (response, character_name, detective_instinct or None)

    RAG: Layer 1 (world_retriever), Layer 2 (literary_retriever)
    """
    world = daily_world_cache
    if not world:
        return (
            "No active case. Please refresh and try again.",
            "System",
            None,
        )

    collection_name = world.chroma_collection
    character_profile = retrieve_character_context(
        character_id=character_id,
        collection_name=collection_name,
        query=player_message,
    )
    if not character_profile:
        return ("I don't have anything to say.", "Unknown", None)

    # Extract character name from profile for response
    char = next((c for c in world.characters if c.character_id == character_id), None)
    char_name = char.name if char else character_id

    session_ctx = _session_context_summary(session)
    # character_profile already includes profile + relevant timeline/evidence from retrieval
    user_prompt = CHARACTER_USER_PROMPT.format(
        player_message=player_message,
        character_profile=character_profile,
        relevant_context=character_profile,
        session_context=session_ctx,
    )

    llm = ChatOpenAI(
        model=LLM_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=0.7,
    )
    messages = [
        SystemMessage(content=CHARACTER_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ]
    response = llm.invoke(messages)
    content = response.content if hasattr(response, "content") else str(response)

    # Layer 2: Detective's Instinct
    instinct_query = f"Player asked: {player_message}\nCharacter response: {content[:300]}"
    detective_instinct = retrieve_detective_instinct(instinct_query)

    return (content, char_name, detective_instinct)
