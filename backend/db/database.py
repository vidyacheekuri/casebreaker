"""SQLite helpers for the CaseBreaker backend."""

from __future__ import annotations

import json
from pathlib import Path

import aiosqlite

from models.session import DailyKeyword, DailySlot, InterrogationTurn, SessionState
from models.world import Character, Evidence, Victim, WorldState
from utils.config import DATABASE_PATH

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


async def connect() -> aiosqlite.Connection:
    """Open the shared SQLite database connection."""
    connection = await aiosqlite.connect(DATABASE_PATH)
    connection.row_factory = aiosqlite.Row
    await connection.execute("PRAGMA journal_mode=WAL;")
    await connection.execute("PRAGMA foreign_keys=ON;")
    return connection


async def init_db(connection: aiosqlite.Connection) -> None:
    """Create database tables if they do not exist."""
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    await connection.executescript(schema)
    await connection.commit()


async def replace_daily_slots(
    connection: aiosqlite.Connection,
    worlds: list[WorldState],
    generated_at: str,
    expires_at: str,
    fingerprints: dict[str, dict],
) -> None:
    """Replace all slots for a given day with the provided generated worlds."""
    if not worlds:
        return

    case_date = worlds[0].case_date
    await connection.execute(
        "DELETE FROM suspects WHERE slot_id IN (SELECT slot_id FROM daily_slots WHERE case_date = ?)",
        (case_date,),
    )
    await connection.execute(
        "DELETE FROM evidence WHERE slot_id IN (SELECT slot_id FROM daily_slots WHERE case_date = ?)",
        (case_date,),
    )
    await connection.execute("DELETE FROM daily_slots WHERE case_date = ?", (case_date,))

    for world in worlds:
        await connection.execute(
            """
            INSERT INTO daily_slots (
                slot_id, slot_index, case_date, generated_at, expires_at, title, summary, mood,
                setting, victim_json, world_json, fingerprint_json, chroma_collection, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
            """,
            (
                world.slot_id,
                world.slot_index,
                world.case_date,
                generated_at,
                expires_at,
                world.title,
                world.summary,
                world.mood,
                world.setting,
                json.dumps(_victim_to_dict(world.victim)),
                world.model_dump_json(),
                json.dumps(fingerprints[world.slot_id]),
                world.chroma_collection,
            ),
        )

        for character in world.characters:
            await connection.execute(
                """
                INSERT INTO suspects (
                    slot_id, character_id, name, age, occupation, relationship_to_victim,
                    personality, alibi, alibi_true, secret, knowledge_json, is_killer,
                    archetype, appearance, model_path, voice_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    world.slot_id,
                    character.character_id,
                    character.name,
                    character.age,
                    character.occupation,
                    character.relationship_to_victim,
                    character.personality,
                    character.alibi,
                    int(character.alibi_true),
                    character.secret,
                    json.dumps(character.knowledge),
                    int(character.is_killer),
                    character.archetype,
                    character.appearance,
                    character.model_path,
                    character.voice_id,
                ),
            )

        for evidence in world.evidence:
            await connection.execute(
                """
                INSERT INTO evidence (
                    slot_id, evidence_id, name, location, description, implicates, is_red_herring
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    world.slot_id,
                    evidence.evidence_id,
                    evidence.name,
                    evidence.location,
                    evidence.description,
                    evidence.implicates,
                    int(evidence.is_red_herring),
                ),
            )

    await connection.commit()


async def fetch_today_slots(
    connection: aiosqlite.Connection,
    case_date: str,
) -> list[DailySlot]:
    """Return published slots for the requested UTC date."""
    cursor = await connection.execute(
        """
        SELECT slot_id, slot_index, case_date, generated_at, expires_at, title, summary, mood,
               setting, victim_json, world_json, chroma_collection
        FROM daily_slots
        WHERE case_date = ? AND status = 'published'
        ORDER BY slot_index
        """,
        (case_date,),
    )
    rows = await cursor.fetchall()
    slots: list[DailySlot] = []
    for row in rows:
        world = WorldState.model_validate_json(row["world_json"])
        slots.append(
            DailySlot(
                slot_id=row["slot_id"],
                slot_index=row["slot_index"],
                case_date=row["case_date"],
                generated_at=row["generated_at"],
                expires_at=row["expires_at"],
                title=row["title"],
                summary=row["summary"],
                mood=row["mood"],
                setting=row["setting"],
                victim=Victim.model_validate(json.loads(row["victim_json"])),
                suspects=world.characters,
                evidence=world.evidence,
                world_collection=row["chroma_collection"],
            )
        )
    return slots


async def fetch_prior_fingerprints(
    connection: aiosqlite.Connection,
    case_date: str,
) -> list[dict]:
    """Return fingerprints for all slots published before the provided date."""
    cursor = await connection.execute(
        """
        SELECT fingerprint_json
        FROM daily_slots
        WHERE case_date < ?
        """,
        (case_date,),
    )
    rows = await cursor.fetchall()
    return [json.loads(row["fingerprint_json"]) for row in rows]


async def replace_daily_keywords(
    connection: aiosqlite.Connection,
    case_date: str,
    keywords: list[DailyKeyword],
) -> None:
    """Replace all keyword chips for one UTC day."""
    await connection.execute("DELETE FROM keywords WHERE case_date = ?", (case_date,))

    for keyword in keywords:
        await connection.execute(
            """
            INSERT INTO keywords (
                keyword_id, case_date, label, category, slot_scores_json
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                keyword.keyword_id,
                case_date,
                keyword.label,
                keyword.category,
                json.dumps(keyword.slot_scores),
            ),
        )
    await connection.commit()


async def fetch_daily_keywords(
    connection: aiosqlite.Connection,
    case_date: str,
) -> list[DailyKeyword]:
    """Fetch keyword chips for one UTC day."""
    cursor = await connection.execute(
        """
        SELECT keyword_id, label, category, slot_scores_json
        FROM keywords
        WHERE case_date = ?
        ORDER BY label
        """,
        (case_date,),
    )
    rows = await cursor.fetchall()
    keywords: list[DailyKeyword] = []
    for row in rows:
        keywords.append(
            DailyKeyword(
                keyword_id=row["keyword_id"],
                label=row["label"],
                category=row["category"],
                slot_scores=json.loads(row["slot_scores_json"]),
            )
        )
    return keywords


async def replace_asset_statuses(
    connection: aiosqlite.Connection,
    case_date: str,
    asset_rows: list[dict],
) -> None:
    """Replace per-suspect asset status rows for one UTC case day."""
    await connection.execute(
        "DELETE FROM asset_status WHERE slot_id LIKE ?",
        (f"{case_date}-%",),
    )

    for row in asset_rows:
        await connection.execute(
            """
            INSERT INTO asset_status (
                slot_id, character_id, model_path, voice_id,
                model_status, voice_status, retry_count
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["slot_id"],
                row["character_id"],
                row.get("model_path"),
                row.get("voice_id"),
                row.get("model_status", "pending"),
                row.get("voice_status", "pending"),
                int(row.get("retry_count", 0)),
            ),
        )
    await connection.commit()


def _victim_to_dict(victim: Victim | dict) -> dict:
    """Normalize victim data for JSON storage."""
    if isinstance(victim, Victim):
        return victim.model_dump()
    return victim


async def fetch_world_by_slot_id(
    connection: aiosqlite.Connection,
    slot_id: str,
) -> WorldState | None:
    """Return the full WorldState for a published slot, or None if missing."""
    cursor = await connection.execute(
        "SELECT world_json FROM daily_slots WHERE slot_id = ? AND status = 'published'",
        (slot_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return WorldState.model_validate_json(row["world_json"])


async def insert_session(
    connection: aiosqlite.Connection,
    session_id: str,
    slot_id: str,
    started_at: str,
    state: SessionState,
    transcript: list[InterrogationTurn] | None = None,
) -> None:
    """Insert a new session row."""
    payload = {
        "state": state.model_dump(),
        "transcript": [turn.model_dump() for turn in (transcript or [])],
    }
    await connection.execute(
        """
        INSERT INTO sessions (session_id, slot_id, started_at, state_json)
        VALUES (?, ?, ?, ?)
        """,
        (session_id, slot_id, started_at, json.dumps(payload)),
    )
    await connection.commit()


async def fetch_session(
    connection: aiosqlite.Connection,
    session_id: str,
) -> dict | None:
    """Return session row as {session_id, slot_id, started_at, state, transcript}."""
    cursor = await connection.execute(
        "SELECT session_id, slot_id, started_at, state_json FROM sessions WHERE session_id = ?",
        (session_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    payload = json.loads(row["state_json"])
    state_raw = payload.get("state") or {}
    transcript_raw = payload.get("transcript") or []
    return {
        "session_id": row["session_id"],
        "slot_id": row["slot_id"],
        "started_at": row["started_at"],
        "state": SessionState.model_validate(state_raw),
        "transcript": [InterrogationTurn.model_validate(turn) for turn in transcript_raw],
    }


async def update_session(
    connection: aiosqlite.Connection,
    session_id: str,
    state: SessionState,
    transcript: list[InterrogationTurn],
) -> None:
    """Overwrite session state + transcript."""
    payload = {
        "state": state.model_dump(),
        "transcript": [turn.model_dump() for turn in transcript],
    }
    await connection.execute(
        "UPDATE sessions SET state_json = ? WHERE session_id = ?",
        (json.dumps(payload), session_id),
    )
    await connection.commit()
