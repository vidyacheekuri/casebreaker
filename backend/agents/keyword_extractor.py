"""Daily keyword chip extraction from generated story worlds."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Iterable

from models.session import DailyKeyword
from models.world import WorldState

_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "before",
    "but",
    "by",
    "for",
    "from",
    "had",
    "has",
    "have",
    "in",
    "into",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "them",
    "they",
    "this",
    "to",
    "was",
    "were",
    "with",
}

_MOTIVE_PATTERNS = (
    ("inheritance", "Inheritance Conflict"),
    ("money", "Money Pressure"),
    ("financial", "Money Pressure"),
    ("debt", "Debt Risk"),
    ("blackmail", "Blackmail"),
    ("revenge", "Revenge"),
    ("jealous", "Jealousy"),
    ("status", "Status Anxiety"),
    ("reputation", "Reputation Risk"),
    ("romance", "Romantic Conflict"),
    ("affair", "Romantic Conflict"),
    ("cover", "Cover-up"),
    ("secret", "Hidden Secret"),
)


def extract_daily_keywords(
    worlds: list[WorldState],
    case_date: str,
    min_keywords: int = 10,
    max_keywords: int = 15,
) -> list[DailyKeyword]:
    """Extract 10-15 keyword chips grounded in the generated worlds."""
    if not worlds:
        return []

    chips: dict[tuple[str, str], dict[str, object]] = {}

    for world in worlds:
        slot_id = world.slot_id
        _add_chip(chips, _setting_label(world.setting), "setting", slot_id, 1.0)
        _add_chip(chips, world.mood, "tone", slot_id, 1.0)
        _add_chip(chips, _motive_label(world.motive), "motive", slot_id, 1.0)
        _add_chip(chips, _relationship_label(world), "relationship", slot_id, 0.9)
        _add_chip(chips, _clue_label(world), "clue", slot_id, 0.9)
        _add_chip(chips, _victim_occupation(world), "victim", slot_id, 0.7)

    if len(chips) < min_keywords:
        for label, slot_scores in _summary_keywords(worlds):
            _add_chip_dict(chips, label, "story", slot_scores)
            if len(chips) >= max_keywords:
                break

    ranked = sorted(
        chips.values(),
        key=lambda chip: (
            -len(chip["slot_scores"]),
            -sum(chip["slot_scores"].values()),
            chip["category"],
            chip["label"],
        ),
    )
    trimmed = ranked[:max_keywords]
    if len(trimmed) < min_keywords:
        trimmed = ranked[:min(min_keywords, len(ranked))]

    date_token = case_date.replace("-", "")
    keywords: list[DailyKeyword] = []
    for index, chip in enumerate(trimmed, start=1):
        keywords.append(
            DailyKeyword(
                keyword_id=f"kw_{date_token}_{index:02d}",
                label=chip["label"],
                category=chip["category"],
                slot_scores={
                    slot_id: round(score, 3)
                    for slot_id, score in chip["slot_scores"].items()
                },
            )
        )
    return keywords


def _add_chip(
    chips: dict[tuple[str, str], dict[str, object]],
    label: str | None,
    category: str,
    slot_id: str,
    score: float,
) -> None:
    if not label:
        return
    normalized_label = _normalize_label(label)
    if not normalized_label:
        return
    key = (normalized_label.lower(), category)
    chip = chips.setdefault(
        key,
        {
            "label": normalized_label,
            "category": category,
            "slot_scores": defaultdict(float),
        },
    )
    chip["slot_scores"][slot_id] += score


def _add_chip_dict(
    chips: dict[tuple[str, str], dict[str, object]],
    label: str,
    category: str,
    slot_scores: dict[str, float],
) -> None:
    normalized_label = _normalize_label(label)
    if not normalized_label:
        return
    key = (normalized_label.lower(), category)
    chip = chips.setdefault(
        key,
        {
            "label": normalized_label,
            "category": category,
            "slot_scores": defaultdict(float),
        },
    )
    for slot_id, score in slot_scores.items():
        chip["slot_scores"][slot_id] += score


def _normalize_label(raw: str) -> str:
    clean = re.sub(r"\s+", " ", raw).strip(" .,:;!?-")
    if not clean:
        return ""
    lower = clean.lower()
    if lower.startswith("the ") and len(clean) > 12:
        clean = clean[4:]
    if len(clean) > 42:
        clean = clean[:42].rsplit(" ", 1)[0]
    return clean[:1].upper() + clean[1:]


def _motive_label(motive: str) -> str:
    lower = motive.lower()
    for token, label in _MOTIVE_PATTERNS:
        if token in lower:
            return label
    return _top_keywords(motive, max_words=2, fallback="Motive Tension")


def _setting_label(setting: str) -> str:
    return _top_keywords(setting, max_words=3, fallback="Classic Estate")


def _relationship_label(world: WorldState) -> str:
    killer = next(
        (character for character in world.characters if character.character_id == world.killer_id),
        world.characters[0] if world.characters else None,
    )
    if killer is None:
        return "Relationship Tension"
    relationship = killer.relationship_to_victim
    relationship = relationship.replace("/", " and ").replace("-", " ")
    return _top_keywords(relationship, max_words=3, fallback="Relationship Tension")


def _clue_label(world: WorldState) -> str:
    evidence = next(
        (item for item in world.evidence if item.implicates == world.killer_id and not item.is_red_herring),
        world.evidence[0] if world.evidence else None,
    )
    if evidence is None:
        return "Hidden Clue"
    base = evidence.name or evidence.description
    return _top_keywords(base, max_words=3, fallback="Hidden Clue")


def _victim_occupation(world: WorldState) -> str:
    victim = world.victim
    if isinstance(victim, dict):
        return str(victim.get("occupation", "Victim Role"))
    return victim.occupation


def _top_keywords(text: str, max_words: int, fallback: str) -> str:
    words = [
        word
        for word in re.findall(r"[A-Za-z][A-Za-z'-]+", text)
        if word.lower() not in _STOPWORDS and len(word) > 2
    ]
    if not words:
        return fallback
    phrase = " ".join(words[:max_words])
    return phrase.title()


def _summary_keywords(worlds: Iterable[WorldState]) -> list[tuple[str, dict[str, float]]]:
    """Extract backup chips from title+summary text when we need more variety."""
    totals: Counter[str] = Counter()
    per_slot: dict[str, Counter[str]] = {}
    for world in worlds:
        text = " ".join(
            [
                world.title,
                world.summary,
                world.motive,
                *[item.name for item in world.evidence],
            ]
        )
        words = [
            word.lower()
            for word in re.findall(r"[A-Za-z][A-Za-z'-]+", text)
            if len(word) >= 5 and word.lower() not in _STOPWORDS
        ]
        slot_counter = Counter(words)
        per_slot[world.slot_id] = slot_counter
        totals.update(slot_counter)

    results: list[tuple[str, dict[str, float]]] = []
    for token, _count in totals.most_common(12):
        slot_scores = {
            slot_id: min(0.8, score / 2.0)
            for slot_id, score in (
                (slot_id, slot_counter.get(token, 0))
                for slot_id, slot_counter in per_slot.items()
            )
            if score > 0
        }
        if slot_scores:
            results.append((token.title(), slot_scores))
    return results
