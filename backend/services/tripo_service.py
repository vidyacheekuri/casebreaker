"""Tripo model generation + fallback helpers for backend Phase 3."""

from __future__ import annotations

import json
import re
import shutil
import ssl
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import certifi

from models.world import Character
from utils.config import GAME_ROOT, TRIPO_API_KEY

TRIPO_BASE_URL = "https://api.tripo3d.ai/v2/openapi"
_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
TERMINAL_SUCCESS = {"success", "succeeded", "completed", "done", "finished"}
TERMINAL_FAILURE = {"failed", "error", "cancelled", "canceled", "timeout"}
FALLBACK_MODELS = ("/models/fenn.glb", "/models/victoria.glb", "/models/oliver.glb")


@dataclass
class TripoModelResult:
    """Resolved model result for one suspect."""

    slot_id: str
    character_id: str
    model_path: str | None
    model_url: str | None
    source: str
    model_status: str
    retry_count: int
    task_id: str | None = None
    error: str | None = None


def generate_character_model_asset(
    slot_id: str,
    character: Character,
    max_retries: int = 3,
) -> TripoModelResult:
    """Generate one suspect model through Tripo, with fallback asset copy."""
    target_model_path = f"/models/generated/{slot_id}/{character.character_id}.glb"
    target_abs = _public_model_abs_path(target_model_path)

    if _is_valid_glb(target_abs):
        return TripoModelResult(
            slot_id=slot_id,
            character_id=character.character_id,
            model_path=target_model_path,
            model_url=target_model_path,
            source="local-cache",
            model_status="completed",
            retry_count=0,
            task_id="local-cache",
        )

    prompt = _build_tripo_prompt(character)
    retry_count = 0
    last_error: str | None = None

    if TRIPO_API_KEY:
        for attempt in range(1, max_retries + 1):
            retry_count = attempt - 1
            try:
                task_id, model_url = _generate_remote_model(prompt)
                _download_binary(model_url, target_abs)
                if not _is_valid_glb(target_abs):
                    raise RuntimeError("Downloaded model is not a valid GLB.")
                return TripoModelResult(
                    slot_id=slot_id,
                    character_id=character.character_id,
                    model_path=target_model_path,
                    model_url=target_model_path,
                    source="tripo",
                    model_status="completed",
                    retry_count=retry_count,
                    task_id=task_id,
                )
            except Exception as exc:
                last_error = str(exc)

    fallback_path = _pick_fallback_model(character)
    try:
        _copy_fallback_model(fallback_path, target_abs)
        return TripoModelResult(
            slot_id=slot_id,
            character_id=character.character_id,
            model_path=target_model_path,
            model_url=target_model_path,
            source="fallback",
            model_status="fallback",
            retry_count=retry_count,
            task_id="fallback",
            error=last_error,
        )
    except Exception as exc:
        return TripoModelResult(
            slot_id=slot_id,
            character_id=character.character_id,
            model_path=None,
            model_url=None,
            source="failed",
            model_status="failed",
            retry_count=retry_count,
            task_id=None,
            error=str(exc) if last_error is None else f"{last_error}; fallback={exc}",
        )


def _generate_remote_model(prompt: str) -> tuple[str, str]:
    submit_payload = _submit_text_to_model_task(prompt)
    task_id = _pick_task_id(submit_payload)
    if not task_id:
        raise RuntimeError("Tripo submission returned no task id.")

    finished_payload = _poll_tripo_task(task_id)
    model_url = _pick_model_url(finished_payload)
    if not model_url:
        raise RuntimeError("Tripo task completed without a model URL.")

    if _is_fbx_url(model_url):
        convert_payload = _submit_convert_model_task(task_id)
        convert_task_id = _pick_task_id(convert_payload)
        if not convert_task_id:
            raise RuntimeError("Tripo convert_model returned no task id.")
        finished_payload = _poll_tripo_task(convert_task_id)
        model_url = _pick_model_url(finished_payload)
        if not model_url:
            raise RuntimeError("Tripo convert_model completed without a model URL.")
        task_id = convert_task_id

    if not _is_glb_or_gltf_url(model_url):
        raise RuntimeError(f"Unsupported Tripo model URL: {model_url}")
    return task_id, model_url


def _submit_text_to_model_task(prompt: str) -> dict:
    base_payload = {
        "type": "text_to_model",
        "model_version": "v2.5-20250123",
        "prompt": prompt,
        "texture": True,
        "pbr": True,
        "quad": True,
        "face_rig": True,
        "workflow": "animation",
    }
    payload_attempts = [
        base_payload,
        {key: value for key, value in base_payload.items() if key != "workflow"},
        {
            key: value
            for key, value in base_payload.items()
            if key not in {"workflow", "face_rig"}
        },
        {
            key: value
            for key, value in base_payload.items()
            if key not in {"workflow", "face_rig", "model_version"}
        },
    ]

    last_error: Exception | None = None
    for payload in payload_attempts:
        try:
            return _tripo_request_json("POST", "/task", payload)
        except Exception as exc:
            message = str(exc).lower()
            param_error = any(
                token in message
                for token in ("invalid", "unknown", "not allowed", "unsupported")
            )
            if not param_error:
                raise
            last_error = exc
    if last_error is not None:
        raise last_error
    raise RuntimeError("Tripo submission failed unexpectedly.")


def _submit_convert_model_task(original_task_id: str) -> dict:
    return _tripo_request_json(
        "POST",
        "/task",
        {
            "type": "convert_model",
            "original_model_task_id": original_task_id,
            "format": "GLTF",
            "quad": True,
            "bake": True,
            "texture_format": "WEBP",
        },
    )


def _poll_tripo_task(
    task_id: str,
    timeout_seconds: int = 8 * 60,
    initial_interval_seconds: float = 2.5,
    max_interval_seconds: float = 10.0,
) -> dict:
    started_at = time.time()
    interval = initial_interval_seconds
    last_success_without_url: dict | None = None

    while time.time() - started_at < timeout_seconds:
        payload = _fetch_task_payload(task_id)
        status = _pick_status(payload)
        model_url = _pick_model_url(payload)

        if status in TERMINAL_SUCCESS:
            if model_url:
                return payload
            last_success_without_url = payload
            time.sleep(interval)
            interval = min(interval * 1.15, max_interval_seconds)
            continue

        if status in TERMINAL_FAILURE:
            raise RuntimeError(f"Tripo task {task_id} failed with status={status}")

        time.sleep(interval)
        interval = min(interval * 1.25, max_interval_seconds)

    if last_success_without_url is not None:
        raise RuntimeError(
            "Tripo task completed but did not return a model URL: "
            f"{json.dumps(last_success_without_url)}"
        )
    raise RuntimeError(f"Timed out waiting for Tripo task {task_id}.")


def _fetch_task_payload(task_id: str) -> dict:
    try:
        return _tripo_request_json("GET", f"/task/{task_id}", None)
    except Exception:
        return _tripo_request_json("GET", f"/tasks/{task_id}", None)


def _tripo_request_json(method: str, route_path: str, payload: dict | None) -> dict:
    if not TRIPO_API_KEY:
        raise RuntimeError("TRIPO_API_KEY is not configured.")

    url = f"{TRIPO_BASE_URL}{route_path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        url=url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {TRIPO_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=60, context=_SSL_CONTEXT) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Tripo request failed ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Tripo request failed: {exc.reason}") from exc


def _pick_task_id(payload: dict) -> str | None:
    root = payload if isinstance(payload, dict) else {}
    data = root.get("data", {}) if isinstance(root.get("data"), dict) else {}
    for candidate in ("taskId", "task_id", "id", "uuid"):
        value = root.get(candidate) or data.get(candidate)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _pick_status(payload: dict) -> str:
    root = payload if isinstance(payload, dict) else {}
    data = root.get("data", {}) if isinstance(root.get("data"), dict) else {}
    for candidate in ("status", "state"):
        value = root.get(candidate) or data.get(candidate)
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
    return "unknown"


def _pick_model_url(payload: dict) -> str | None:
    keys = (
        "pbr_model_url",
        "base_model_url",
        "raw_model_url",
        "glb_url",
        "glbUrl",
        "model_url",
        "modelUrl",
        "model",
        "url",
        "download_url",
        "downloadUrl",
        "asset",
    )

    def select_from_value(value: object) -> str | None:
        if not isinstance(value, str):
            return None
        if _is_image_url(value):
            return None
        if _is_glb_or_gltf_url(value) or _is_fbx_url(value):
            return value
        if value.startswith("http://") or value.startswith("https://"):
            if re.search(r"/(model|mesh|asset)[^/]*($|\?)", value, re.IGNORECASE):
                return value
        return None

    queue: list[object] = [payload]
    seen: set[int] = set()
    fallback_http_url: str | None = None

    while queue:
        current = queue.pop(0)
        marker = id(current)
        if marker in seen:
            continue
        seen.add(marker)

        direct = select_from_value(current)
        if direct:
            return direct

        if isinstance(current, dict):
            for key in keys:
                if key in current:
                    maybe = select_from_value(current[key])
                    if maybe:
                        return maybe
                    if (
                        fallback_http_url is None
                        and isinstance(current[key], str)
                        and current[key].startswith(("http://", "https://"))
                        and not _is_image_url(current[key])
                    ):
                        fallback_http_url = current[key]
            queue.extend(current.values())
        elif isinstance(current, list):
            queue.extend(current)

    return fallback_http_url


def _download_binary(url: str, destination: Path) -> None:
    request = Request(url=url, method="GET")
    try:
        with urlopen(request, timeout=120, context=_SSL_CONTEXT) as response:
            payload = response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Model download failed ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Model download failed: {exc.reason}") from exc

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)


def _public_model_abs_path(model_path: str) -> Path:
    normalized = model_path[1:] if model_path.startswith("/") else model_path
    return GAME_ROOT / "public" / normalized


def _pick_fallback_model(character: Character) -> str:
    female_tokens = {
        "mrs",
        "ms",
        "miss",
        "lady",
        "her",
        "she",
        "sister",
        "wife",
        "mother",
        "daughter",
    }
    name_tokens = set(re.findall(r"[a-z]+", character.name.lower()))
    archetype_tokens = set(re.findall(r"[a-z]+", character.archetype.lower()))
    relationship_tokens = set(
        re.findall(r"[a-z]+", character.relationship_to_victim.lower())
    )
    if (
        female_tokens & name_tokens
        or female_tokens & archetype_tokens
        or female_tokens & relationship_tokens
    ):
        return "/models/victoria.glb"
    return "/models/fenn.glb" if character.age >= 42 else "/models/oliver.glb"


def _copy_fallback_model(fallback_model_path: str, destination: Path) -> None:
    candidate_paths = [fallback_model_path, *FALLBACK_MODELS]
    for candidate in candidate_paths:
        source_abs = _public_model_abs_path(candidate)
        if not source_abs.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_abs, destination)
        if _is_valid_glb(destination):
            return
    raise RuntimeError("No valid fallback GLB found in game/public/models.")


def _is_valid_glb(path: Path) -> bool:
    if not path.exists() or not path.is_file():
        return False
    try:
        return path.read_bytes()[:4] == b"glTF"
    except Exception:
        return False


def _build_tripo_prompt(character: Character) -> str:
    if character.appearance.strip():
        return character.appearance.strip()
    return (
        f"Realistic full-body character, {character.age}-year-old {character.occupation}. "
        f"Personality: {character.personality}. "
        f"Archetype: {character.archetype or 'mystery suspect'}. "
        "Neutral T-pose, game-ready clean topology, detailed but practical clothing."
    )


def _is_image_url(value: str) -> bool:
    return re.search(r"\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)", value, re.IGNORECASE) is not None


def _is_glb_or_gltf_url(value: str) -> bool:
    return re.search(r"\.(glb|gltf)(\?|$)", value, re.IGNORECASE) is not None


def _is_fbx_url(value: str) -> bool:
    return re.search(r"\.fbx(\?|$)", value, re.IGNORECASE) is not None

