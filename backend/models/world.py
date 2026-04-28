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


class GenerationSources(BaseModel):
    """Source identifiers used to construct a generated mystery."""

    model_config = ConfigDict(extra="forbid")

    fbi_id: str = ""
    persona_ids: list[str] = Field(default_factory=list)
    literary_ids: list[str] = Field(default_factory=list)


class CaseRecipe(BaseModel):
    """Compact creative blueprint derived from the local story data sources."""

    model_config = ConfigDict(extra="forbid")

    subgenre: str = ""
    setting: str = ""
    mood: str = ""
    motive_family: str = ""
    victim_role: str = ""
    central_conflict: str = ""
    killer_pressure: str = ""
    clue_styles: list[str] = Field(default_factory=list)
    red_herring_strategy: str = ""
    narrative_twist: str = ""
    forbidden_repeats: list[str] = Field(default_factory=list)


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
    speech_style: str = ""
    emotional_tell: str = ""
    lie_strategy: str = ""
    private_wound: str = ""
    pressure_response: str = ""
    relationship_to_other_suspects: str = ""
    gender_presentation: str | None = None
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
    image_url: str | None = None
    image_prompt: str | None = None
    image_status: str = "idle"


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
    case_recipe: CaseRecipe | None = None
    generation_sources: GenerationSources | None = None
    chroma_collection: str
