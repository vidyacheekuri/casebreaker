"""Rule-based ElevenLabs voice matching for generated suspects."""

from __future__ import annotations

import re
from dataclasses import dataclass

from models.world import Character


@dataclass(frozen=True)
class VoiceProfile:
    """One curated voice-bank entry."""

    voice_id: str
    label: str
    gender_hint: str
    age_band: str
    style_tags: frozenset[str]


@dataclass(frozen=True)
class VoiceMatchResult:
    """Voice assignment result for one suspect."""

    voice_id: str
    source: str
    score: float
    profile_label: str


VOICE_BANK: tuple[VoiceProfile, ...] = (
    VoiceProfile(
        voice_id="pNInz6obpgDQGcFmaJgB",
        label="Adam",
        gender_hint="male",
        age_band="middle",
        style_tags=frozenset({"calm", "formal", "authoritative", "steady"}),
    ),
    VoiceProfile(
        voice_id="TxGEqnHWrfWFTfGW9XjX",
        label="Josh",
        gender_hint="male",
        age_band="young",
        style_tags=frozenset({"tense", "nervous", "impulsive", "sharp"}),
    ),
    VoiceProfile(
        voice_id="ThT5KcBeYPX3keUQqHPh",
        label="Dorothy",
        gender_hint="female",
        age_band="middle",
        style_tags=frozenset({"elegant", "controlled", "composed", "formal"}),
    ),
    VoiceProfile(
        voice_id="21m00Tcm4TlvDq8ikWAM",
        label="Rachel",
        gender_hint="female",
        age_band="young",
        style_tags=frozenset({"soft", "emotional", "gentle"}),
    ),
    VoiceProfile(
        voice_id="ErXwobaYiN019PkySvjV",
        label="Antoni",
        gender_hint="male",
        age_band="middle",
        style_tags=frozenset({"deep", "grave", "serious"}),
    ),
    VoiceProfile(
        voice_id="EXAVITQu4vr4xnSDxMaL",
        label="Bella",
        gender_hint="female",
        age_band="young",
        style_tags=frozenset({"bright", "quick", "lively"}),
    ),
)


def match_voice_for_character(character: Character) -> VoiceMatchResult:
    """Assign the best-fit voice profile for a suspect."""
    inferred_gender = _infer_gender_hint(character)
    inferred_age_band = _infer_age_band(character.age)
    tone_tags = _infer_tone_tags(character)

    best_profile = VOICE_BANK[0]
    best_score = float("-inf")
    for profile in VOICE_BANK:
        score = 0.0
        if profile.gender_hint == inferred_gender:
            score += 2.0
        elif inferred_gender == "unknown":
            score += 0.4
        else:
            score -= 0.5

        if profile.age_band == inferred_age_band:
            score += 1.0
        elif {profile.age_band, inferred_age_band} <= {"young", "middle"}:
            score += 0.4

        score += 0.45 * len(profile.style_tags & tone_tags)
        if score > best_score:
            best_profile = profile
            best_score = score

    return VoiceMatchResult(
        voice_id=best_profile.voice_id,
        source="voice-bank",
        score=round(best_score, 3),
        profile_label=best_profile.label,
    )


def _infer_gender_hint(character: Character) -> str:
    female_tokens = {
        "she",
        "her",
        "wife",
        "mother",
        "daughter",
        "sister",
        "ms",
        "mrs",
        "miss",
        "lady",
    }
    male_tokens = {
        "he",
        "his",
        "husband",
        "father",
        "son",
        "brother",
        "mr",
        "sir",
    }
    text = " ".join(
        [
            character.name,
            character.relationship_to_victim,
            character.archetype,
        ]
    ).lower()
    words = set(re.findall(r"[a-z]+", text))
    if words & female_tokens:
        return "female"
    if words & male_tokens:
        return "male"
    return "unknown"


def _infer_age_band(age: int) -> str:
    if age < 34:
        return "young"
    if age < 52:
        return "middle"
    return "mature"


def _infer_tone_tags(character: Character) -> set[str]:
    text = " ".join(
        [
            character.personality,
            character.secret,
            character.archetype,
            character.occupation,
        ]
    ).lower()
    tags: set[str] = set()
    mapping = {
        "calm": {"calm", "controlled", "composed", "reserved", "measured"},
        "formal": {"formal", "elite", "aristocrat", "doctor", "lawyer"},
        "authoritative": {"commanding", "authoritative", "stern", "strict"},
        "tense": {"tense", "nervous", "anxious", "restless", "agitated"},
        "emotional": {"emotional", "grief", "fragile", "sensitive"},
        "serious": {"serious", "grim", "cold", "hardened"},
        "lively": {"quick", "witty", "charming", "lively"},
    }
    words = set(re.findall(r"[a-z]+", text))
    for tag, triggers in mapping.items():
        if words & triggers:
            tags.add(tag)
    return tags

