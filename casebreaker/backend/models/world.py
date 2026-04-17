"""
World state data models for CaseBreaker AI.

Pydantic models representing the generated mystery world:
- WorldState: Complete daily case with victim, suspects, evidence, timeline
- Character: Individual suspect with profile, alibi, knowledge, deception rules
- Evidence: Physical evidence items that player can examine
- Victim: Structured victim info (name, age, occupation, cause of death)

Used by: Architect agent output, Layer 1 RAG embedding, Evaluator reference
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Victim(BaseModel):
    """Structured victim information."""

    model_config = ConfigDict(extra="forbid")

    name: str
    age: int
    occupation: str
    cause_of_death: str


class Character(BaseModel):
    """Individual suspect in the mystery."""

    model_config = ConfigDict(extra="forbid")

    character_id: str = Field(..., description="Unique ID for this suspect")
    name: str
    age: int
    occupation: str
    relationship_to_victim: str
    personality: str = Field(
        ..., description="Tone and vocabulary description"
    )
    alibi: str = Field(..., description="Their claimed alibi")
    alibi_true: bool = Field(..., description="Whether alibi is real")
    secret: str = Field(
        ...,
        description="What they are hiding (unrelated to murder if innocent)",
    )
    knowledge: list[str] = Field(
        default_factory=list,
        description="Facts they genuinely know",
    )
    is_killer: bool = False


class Evidence(BaseModel):
    """Physical evidence item the player can examine."""

    model_config = ConfigDict(extra="forbid")

    evidence_id: str = Field(..., description="Unique ID for this evidence")
    name: str
    location: str
    description: str = Field(
        ..., description="Full description revealed when examined"
    )
    implicates: str = Field(
        ...,
        description="character_id of implicated suspect, or 'none'",
    )
    is_red_herring: bool = False


class WorldState(BaseModel):
    """
    Complete generated mystery world for a single day.

    Stored in: Python in-memory cache + ChromaDB daily_{YYYY_MM_DD}_world
    Created by: Mystery Architect agent (once per day)
    Used by: Character agents (via Layer 1 RAG), Evaluator, world_embedder
    """

    model_config = ConfigDict(extra="forbid")

    case_date: str = Field(..., description="YYYY-MM-DD — which day's case")
    setting: str = Field(..., description="e.g. 'Victorian manor'")
    victim: Victim | dict[str, Any] = Field(
        ..., description="name, age, occupation, cause_of_death"
    )
    killer_id: str = Field(
        ..., description="character_id of the true killer"
    )
    motive: str = Field(..., description="Killer's motive")
    timeline: list[dict[str, Any]] = Field(
        default_factory=list,
        description="[{time, event, witnessed_by: list[str]}]",
    )
    characters: list[Character] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    red_herrings: list[str] = Field(
        default_factory=list,
        description="Misleading clues",
    )
    chroma_collection: str = Field(
        ...,
        description="e.g. 'daily_2026_03_08_world'",
    )
