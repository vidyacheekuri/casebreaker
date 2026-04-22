"""World state and suspect data models for generated mystery slots."""

from __future__ import annotations

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
    """Playable suspect definition used by the UI and backend agents."""

    model_config = ConfigDict(extra="forbid")

    character_id: str
    name: str
    age: int
    occupation: str
    relationship_to_victim: str
    personality: str
    alibi: str
    alibi_true: bool
    secret: str
    knowledge: list[str] = Field(default_factory=list)
    is_killer: bool = False
    archetype: str = ""
    appearance: str = Field(
        default="",
        description="Text prompt for later Tripo model generation.",
    )
    model_url: str | None = None
    model_path: str | None = None
    voice_id: str | None = None


class Evidence(BaseModel):
    """Physical clue the player can examine."""

    model_config = ConfigDict(extra="forbid")

    evidence_id: str
    name: str
    location: str
    description: str
    implicates: str = Field(
        ...,
        description="The character_id implicated by the evidence, or 'none'.",
    )
    is_red_herring: bool = False


class WorldState(BaseModel):
    """Generated mystery world for one published slot."""

    model_config = ConfigDict(extra="forbid")

    slot_id: str
    slot_index: int = Field(ge=1, le=3)
    case_date: str = Field(description="UTC date the slot belongs to, YYYY-MM-DD.")
    title: str
    summary: str
    mood: str
    setting: str
    victim: Victim | dict[str, Any]
    killer_id: str
    motive: str
    timeline: list[dict[str, Any]] = Field(default_factory=list)
    characters: list[Character] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    red_herrings: list[str] = Field(default_factory=list)
    chroma_collection: str
