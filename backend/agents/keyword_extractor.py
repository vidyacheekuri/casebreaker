"""Daily preference-chip extraction from generated story worlds.

The landing page should not expose literal story nouns such as victim jobs,
evidence names, or room labels. These chips are meant to feel like taste
signals: mood, emotional pressure, investigation fantasy, and suspect energy.
"""

from __future__ import annotations

from collections import defaultdict

from models.session import DailyKeyword
from models.world import WorldState


def extract_daily_keywords(
    worlds: list[WorldState],
    case_date: str,
    min_keywords: int = 10,
    max_keywords: int = 15,
) -> list[DailyKeyword]:
    """Build 10-15 non-spoilery preference chips from today's three stories."""
    if not worlds:
        return []

    chips: dict[tuple[str, str], dict[str, object]] = {}

    for world in worlds:
        for label, category, score in _world_preference_chips(world):
            _add_chip(chips, label, category, world.slot_id, score)

    _add_contrast_chips(chips, worlds)

    ranked = sorted(
        chips.values(),
        key=lambda chip: (
            _category_rank(str(chip["category"])),
            _specificity_rank(len(chip["slot_scores"]), len(worlds)),
            -sum(chip["slot_scores"].values()),
            str(chip["label"]),
        ),
    )

    trimmed = _balanced_trim(ranked, min_keywords=min_keywords, max_keywords=max_keywords)
    date_token = case_date.replace("-", "")
    return [
        DailyKeyword(
            keyword_id=f"kw_{date_token}_{index:02d}",
            label=str(chip["label"]),
            category=str(chip["category"]),
            slot_scores={
                slot_id: round(score, 3)
                for slot_id, score in chip["slot_scores"].items()
            },
        )
        for index, chip in enumerate(trimmed, start=1)
    ]


def _world_preference_chips(world: WorldState) -> list[tuple[str, str, float]]:
    recipe = world.case_recipe
    text = _world_text(world)
    chips: list[tuple[str, str, float]] = []

    chips.append((_emotional_pull(world), "emotion", 1.0))
    chips.append((_atmosphere(world), "atmosphere", 0.95))
    chips.append((_investigation_style(world), "investigation", 1.0))
    chips.append((_social_pressure(world), "tension", 0.95))
    chips.append((_suspect_energy(world), "suspects", 0.9))

    if recipe and recipe.subgenre:
        chips.append((_subgenre_label(recipe.subgenre), "pace", 0.85))
    if recipe and recipe.narrative_twist:
        chips.append((_twist_label(recipe.narrative_twist), "twist", 0.85))

    if any(token in text for token in ("blackmail", "scandal", "public image", "reputation")):
        chips.append(("Secrets About To Break", "emotion", 0.8))
    if any(token in text for token in ("family", "inheritance", "heir", "sibling", "spouse")):
        chips.append(("Family Pressure", "tension", 0.8))
    if any(token in text for token in ("jealous", "romantic", "affair", "devotion", "abandonment")):
        chips.append(("Messy Loyalties", "emotion", 0.8))
    if any(token in text for token in ("ledger", "contract", "signature", "document", "paper")):
        chips.append(("Paper Trail Puzzle", "investigation", 0.75))
    if any(token in text for token in ("garden", "greenhouse", "terrace", "corridor", "grounds")):
        chips.append(("Follow The Footsteps", "investigation", 0.75))

    return chips


def _add_contrast_chips(
    chips: dict[tuple[str, str], dict[str, object]],
    worlds: list[WorldState],
) -> None:
    """Add a few broad cross-story chips so the page feels curated, not extracted."""
    for world in worlds:
        text = _world_text(world)
        if any(token in text for token in ("controlled", "poised", "composed", "formal elegance")):
            _add_chip(chips, "Composed Liars", "suspects", world.slot_id, 0.65)
        if any(token in text for token in ("rattled", "hesitant", "apologetic", "warm on the surface")):
            _add_chip(chips, "Nervous Witnesses", "suspects", world.slot_id, 0.65)
        if any(token in text for token in ("storm", "snow", "fog", "rain", "winter")):
            _add_chip(chips, "Bad Weather Secrets", "atmosphere", world.slot_id, 0.65)
        if any(token in text for token in ("quiet", "withheld", "omission", "quieter clue")):
            _add_chip(chips, "Quiet Contradictions", "investigation", world.slot_id, 0.7)


def _emotional_pull(world: WorldState) -> str:
    recipe = world.case_recipe
    text = " ".join(
        [
            world.mood,
            recipe.killer_pressure if recipe else "",
            recipe.central_conflict if recipe else "",
        ]
    ).lower()
    mood = world.mood.lower()
    if any(token in text or token in mood for token in ("panic", "paranoia", "fear", "desperation")):
        return "Panic Under Control"
    if any(token in text or token in mood for token in ("shame", "scandal", "humiliation", "dread")):
        return "Social Dread"
    if any(token in text or token in mood for token in ("resentment", "bitterness", "grievance", "fury")):
        return "Old Resentments"
    if any(token in text or token in mood for token in ("yearning", "jealous", "devotion", "abandonment")):
        return "Bruised Hearts"
    return "Emotional Pressure"


def _atmosphere(world: WorldState) -> str:
    setting = world.setting.lower()
    text = _world_text(world)
    if any(token in setting for token in ("hotel", "club", "office", "hall", "school")):
        return "Public Rooms, Private Lies"
    if any(token in setting for token in ("garden", "greenhouse", "terrace", "grounds")):
        return "Secrets Outside The House"
    if any(token in setting for token in ("manor", "estate", "retreat", "lodge", "villa")):
        return "Closed-Circle Elegance"
    if any(token in text for token in ("storm", "snow", "fog", "rain", "wind")):
        return "Weather Closing In"
    return "Intimate Crime Scene"


def _investigation_style(world: WorldState) -> str:
    recipe = world.case_recipe
    clue_text = " ".join(recipe.clue_styles if recipe else []).lower()
    evidence_text = " ".join(f"{item.name} {item.description}" for item in world.evidence).lower()
    text = f"{clue_text} {evidence_text}"
    if any(token in text for token in ("diary", "letter", "correspondence", "note", "telegram")):
        return "Read Between The Lines"
    if any(token in text for token in ("ledger", "contract", "register", "will", "signature", "account")):
        return "Paper Trail Puzzle"
    if any(token in text for token in ("footprint", "boot", "mud", "tool", "key")):
        return "Physical Clues"
    if any(token in text for token in ("photograph", "flower", "glove", "card")):
        return "Small Object, Big Secret"
    return "Clue-First Deduction"


def _social_pressure(world: WorldState) -> str:
    recipe = world.case_recipe
    pressure = f"{recipe.killer_pressure} {recipe.central_conflict}" if recipe else world.motive
    pressure = pressure.lower()
    if any(token in pressure for token in ("scandal", "reputation", "public", "inquiry", "blackmail")):
        return "Reputation On The Line"
    if any(token in pressure for token in ("financial", "inheritance", "debt", "security", "speculation")):
        return "Money Changes Everything"
    if any(token in pressure for token in ("dismissal", "class", "employer", "dependence", "insult")):
        return "Class And Dependence"
    if any(token in pressure for token in ("jealous", "devotion", "affair", "romantic", "love")):
        return "Love Turned Sour"
    return "Everyone Has Something To Lose"


def _suspect_energy(world: WorldState) -> str:
    archetypes = " ".join(character.archetype for character in world.characters).lower()
    speech = " ".join(character.speech_style for character in world.characters).lower()
    combined = f"{archetypes} {speech}"
    if "elegant mask" in combined or "controlled insider" in combined:
        return "Polished Suspects"
    if "volatile" in combined or "indignation" in combined:
        return "Explosive Alibis"
    if "shaken" in combined or "hesitant" in combined:
        return "Fragile Testimony"
    if "ambitious" in combined or "calculating" in combined:
        return "Strategic Charm"
    return "Unreliable People"


def _subgenre_label(subgenre: str) -> str:
    lower = subgenre.lower()
    if "pressure" in lower:
        return "Pressure-Cooker Case"
    if "social" in lower or "reputation" in lower:
        return "Social Chess Match"
    if "household" in lower:
        return "Intimate Betrayal"
    if "clue" in lower:
        return "Classic Clue Hunt"
    return "Slow-Burn Mystery"


def _twist_label(twist: str) -> str:
    lower = twist.lower()
    if "timing" in lower:
        return "Timeline Trap"
    if "routine" in lower:
        return "Broken Routine"
    if "secret" in lower:
        return "The Loud Secret Is Wrong"
    if "calmest" in lower:
        return "Too Calm To Trust"
    return "Hidden Contradiction"


def _add_chip(
    chips: dict[tuple[str, str], dict[str, object]],
    label: str | None,
    category: str,
    slot_id: str,
    score: float,
) -> None:
    label = _normalize_label(label)
    if not label:
        return
    key = (label.lower(), category)
    chip = chips.setdefault(
        key,
        {
            "label": label,
            "category": category,
            "slot_scores": defaultdict(float),
        },
    )
    chip["slot_scores"][slot_id] += score


def _balanced_trim(
    ranked: list[dict[str, object]],
    *,
    min_keywords: int,
    max_keywords: int,
) -> list[dict[str, object]]:
    selected: list[dict[str, object]] = []
    category_counts: dict[str, int] = defaultdict(int)

    for chip in ranked:
        category = str(chip["category"])
        if category_counts[category] >= 3:
            continue
        selected.append(chip)
        category_counts[category] += 1
        if len(selected) >= max_keywords:
            break

    if len(selected) < min_keywords:
        seen = {(str(chip["label"]).lower(), str(chip["category"])) for chip in selected}
        for chip in ranked:
            key = (str(chip["label"]).lower(), str(chip["category"]))
            if key in seen:
                continue
            selected.append(chip)
            seen.add(key)
            if len(selected) >= min(max_keywords, min_keywords):
                break

    return selected[:max_keywords]


def _category_rank(category: str) -> int:
    order = {
        "emotion": 0,
        "investigation": 1,
        "tension": 2,
        "suspects": 3,
        "atmosphere": 4,
        "twist": 5,
        "pace": 6,
    }
    return order.get(category, 99)


def _specificity_rank(slot_count: int, total_slots: int) -> int:
    if slot_count <= 1:
        return 0
    if slot_count < total_slots:
        return 1
    return 2


def _normalize_label(raw: str | None) -> str:
    if not raw:
        return ""
    clean = " ".join(raw.strip(" .,:;!?-").split())
    if len(clean) > 36:
        clean = clean[:36].rsplit(" ", 1)[0]
    return clean


def _world_text(world: WorldState) -> str:
    recipe = world.case_recipe
    victim = world.victim if isinstance(world.victim, dict) else world.victim.model_dump()
    return " ".join(
        [
            world.title,
            world.summary,
            world.mood,
            world.setting,
            world.motive,
            str(victim.get("occupation", "")),
            recipe.subgenre if recipe else "",
            recipe.central_conflict if recipe else "",
            recipe.killer_pressure if recipe else "",
            recipe.red_herring_strategy if recipe else "",
            recipe.narrative_twist if recipe else "",
            " ".join(recipe.clue_styles) if recipe else "",
            " ".join(world.red_herrings),
            " ".join(character.archetype for character in world.characters),
            " ".join(character.personality for character in world.characters),
            " ".join(character.speech_style for character in world.characters),
            " ".join(item.name for item in world.evidence),
            " ".join(item.description for item in world.evidence),
        ]
    ).lower()
