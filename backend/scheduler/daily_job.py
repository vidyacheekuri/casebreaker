"""Midnight generation job for daily mystery slots."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from agents.architect import generate_daily_worlds, generate_slot_world
from agents.keyword_extractor import extract_daily_keywords
from db.database import (
    fetch_prior_fingerprints,
    replace_asset_statuses,
    replace_daily_keywords,
    replace_daily_slots,
)
from models.session import GenerationStatus
from models.world import Character, WorldState
from rag.world_embedder import embed_world
from services.tripo_service import TripoModelResult, generate_character_model_asset
from services.voice_matcher import match_voice_for_character
from utils.novelty_guard import detect_duplicate


async def generate_daily_slots(connection) -> dict:
    """Generate, validate, embed, and publish the 3 daily slots."""
    now = datetime.now(timezone.utc)
    case_date = now.strftime("%Y-%m-%d")
    generated_at = now.isoformat()
    expires_at = (now + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()

    prior_fingerprints = await fetch_prior_fingerprints(connection, case_date)
    accepted_worlds = []
    fingerprints: dict[str, dict] = {}

    for world in await generate_daily_worlds(case_date):
        novelty = detect_duplicate(world, prior_fingerprints + list(fingerprints.values()))
        if novelty.is_duplicate:
            refreshed = generate_slot_world(case_date, world.slot_index, variant_seed=1)
            retry_novelty = detect_duplicate(
                refreshed,
                prior_fingerprints + list(fingerprints.values()),
            )
            if not retry_novelty.is_duplicate:
                world = refreshed
                novelty = retry_novelty
        accepted_worlds.append(world)
        fingerprints[world.slot_id] = novelty.fingerprint
        embed_world(world)

    asset_rows: list[dict] = []
    for world in accepted_worlds:
        playable_count, world_asset_rows = await _hydrate_world_assets(world)
        asset_rows.extend(world_asset_rows)
        if playable_count < 2:
            raise RuntimeError(
                f"Slot {world.slot_id} has only {playable_count} playable suspect models."
            )

    keywords = extract_daily_keywords(accepted_worlds, case_date=case_date)
    await replace_daily_slots(
        connection=connection,
        worlds=accepted_worlds,
        generated_at=generated_at,
        expires_at=expires_at,
        fingerprints=fingerprints,
    )
    await replace_daily_keywords(
        connection=connection,
        case_date=case_date,
        keywords=keywords,
    )
    await replace_asset_statuses(
        connection=connection,
        case_date=case_date,
        asset_rows=asset_rows,
    )

    return {
        "slots": accepted_worlds,
        "daily_keywords": keywords,
        "generated_at": generated_at,
        "expires_at": expires_at,
    }


async def run_generation_job(app) -> dict | None:
    """Run one generation job while updating shared app status."""
    lock = app.state.generation_lock
    async with lock:
        started_at = datetime.now(timezone.utc).isoformat()
        app.state.generation_status = GenerationStatus(
            status="running",
            started_at=started_at,
        )
        try:
            payload = await generate_daily_slots(app.state.db)
            finished_at = datetime.now(timezone.utc).isoformat()
            app.state.generation_status = GenerationStatus(
                status="completed",
                started_at=started_at,
                finished_at=finished_at,
                generated_at=payload["generated_at"],
                expires_at=payload["expires_at"],
            )
            return payload
        except Exception as exc:
            finished_at = datetime.now(timezone.utc).isoformat()
            app.state.generation_status = GenerationStatus(
                status="failed",
                started_at=started_at,
                finished_at=finished_at,
                error=str(exc),
            )
            raise


async def _hydrate_world_assets(world: WorldState) -> tuple[int, list[dict]]:
    """Generate models and assign voices for one slot's suspects."""
    model_results = await asyncio.gather(
        *[
            asyncio.to_thread(
                generate_character_model_asset,
                world.slot_id,
                character,
            )
            for character in world.characters
        ]
    )

    playable = 0
    asset_rows: list[dict] = []
    used_voice_ids: frozenset[str] = frozenset()
    for character, model_result in zip(world.characters, model_results):
        if model_result.model_path:
            playable += 1
        voice_match = match_voice_for_character(character, exclude=used_voice_ids)
        used_voice_ids = used_voice_ids | {voice_match.voice_id}
        _attach_assets_to_character(character, model_result, voice_match.voice_id)
        asset_rows.append(
            {
                "slot_id": world.slot_id,
                "character_id": character.character_id,
                "model_path": model_result.model_path,
                "voice_id": voice_match.voice_id,
                "model_status": model_result.model_status,
                "voice_status": "assigned",
                "retry_count": model_result.retry_count,
            }
        )
    return playable, asset_rows


def _attach_assets_to_character(
    character: Character,
    model_result: TripoModelResult,
    voice_id: str,
) -> None:
    """Set model/voice fields in the world JSON that is published for frontend use."""
    character.model_path = model_result.model_path
    character.model_url = model_result.model_url
    character.voice_id = voice_id
