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

from agents.llm_provider import generate_claude_text
from models.world import Character
from utils.config import GAME_ROOT, TRIPO_API_KEY, TRIPO_MANUAL_MODE, TRIPO_PROMPT_DIR, TRIPO_REMOTE_ENABLED
from utils.prompts import TRIPO_PROMPT_SYSTEM_PROMPT, TRIPO_PROMPT_USER_PROMPT

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
    """Resolve one suspect model, defaulting to placeholder fallback assets."""
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

    retry_count = 0
    last_error: str | None = None

    if TRIPO_MANUAL_MODE:
        prompt, prompt_source = _build_tripo_prompt(character)
        prompt_paths = _write_manual_prompt_files(
            slot_id=slot_id,
            character=character,
            prompt=prompt,
            prompt_source=prompt_source,
            target_model_path=target_model_path,
        )
        return _fallback_model_result(
            slot_id=slot_id,
            character=character,
            target_model_path=target_model_path,
            target_abs=target_abs,
            retry_count=0,
            status="manual_prompt",
            task_id="manual-prompt",
            error=f"Manual Tripo prompt written to {prompt_paths['prompt']}",
        )

    if TRIPO_REMOTE_ENABLED and TRIPO_API_KEY:
        prompt, _prompt_source = _build_tripo_prompt(character)
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

    return _fallback_model_result(
        slot_id=slot_id,
        character=character,
        target_model_path=target_model_path,
        target_abs=target_abs,
        retry_count=retry_count,
        status="placeholder",
        task_id="placeholder",
        error=last_error,
    )


def _fallback_model_result(
    *,
    slot_id: str,
    character: Character,
    target_model_path: str,
    target_abs: Path,
    retry_count: int,
    status: str,
    task_id: str,
    error: str | None,
) -> TripoModelResult:
    fallback_path = _pick_fallback_model(character)
    try:
        _copy_fallback_model(fallback_path, target_abs)
        return TripoModelResult(
            slot_id=slot_id,
            character_id=character.character_id,
            model_path=target_model_path,
            model_url=target_model_path,
            source="fallback",
            model_status=status,
            retry_count=retry_count,
            task_id=task_id,
            error=error,
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
            error=str(exc) if error is None else f"{error}; fallback={exc}",
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
    payload = {
        "type": "text_to_model",
        "model_version": "v3.0-20250812",
        "prompt": prompt,
        "texture": True,
        "pbr": True,
        "face_rig": True,
        "workflow": "animation",
    }
    return _tripo_request_json("POST", "/task", payload)


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


def _write_manual_prompt_files(
    *,
    slot_id: str,
    character: Character,
    prompt: str,
    prompt_source: str,
    target_model_path: str,
) -> dict[str, str]:
    slot_dir = TRIPO_PROMPT_DIR / slot_id
    slot_dir.mkdir(parents=True, exist_ok=True)
    base_name = f"{character.character_id}-{_slug(character.name)}"
    prompt_path = slot_dir / f"{base_name}.txt"
    metadata_path = slot_dir / f"{base_name}.json"
    prompt_path.write_text(prompt + "\n", encoding="utf-8")
    metadata_path.write_text(
        json.dumps(
            {
                "slot_id": slot_id,
                "character_id": character.character_id,
                "name": character.name,
                "target_model_path": target_model_path,
                "target_absolute_path": str(_public_model_abs_path(target_model_path)),
                "prompt": prompt,
                "prompt_source": prompt_source,
                "tripo_settings": {
                    "type": "text_to_model",
                    "model_version": "v3.0-20250812",
                    "texture": True,
                    "pbr": True,
                    "face_rig": True,
                    "workflow": "animation",
                    "download_format": "glb",
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return {
        "prompt": str(prompt_path),
        "metadata": str(metadata_path),
    }


def _is_valid_glb(path: Path) -> bool:
    if not path.exists() or not path.is_file():
        return False
    try:
        return path.read_bytes()[:4] == b"glTF"
    except Exception:
        return False


_TRIPO_STYLE_SUFFIX = (
    " Photorealistic human, realistic proportions, detailed facial features, "
    "high-quality PBR textures, neutral T-pose, full body visible, animation-ready face rig."
)

def _build_tripo_prompt(character: Character) -> tuple[str, str]:
    claude_prompt = _build_tripo_prompt_with_claude(character)
    if claude_prompt:
        return claude_prompt, "claude"
    return _build_local_tripo_prompt(character), "local_fallback"


def _build_tripo_prompt_with_claude(character: Character) -> str | None:
    prompt = generate_claude_text(
        system=TRIPO_PROMPT_SYSTEM_PROMPT,
        user=TRIPO_PROMPT_USER_PROMPT.format(
            name=character.name,
            age=character.age,
            gender_presentation=character.gender_presentation or "neutral",
            occupation=character.occupation,
            relationship=character.relationship_to_victim,
            archetype=character.archetype or "mystery suspect",
            personality=character.personality,
            speech_style=character.speech_style or "guarded, natural speech",
            emotional_tell=character.emotional_tell or "subtle tension under pressure",
            pressure_response=character.pressure_response or "controlled posture under scrutiny",
            appearance=character.appearance or "period-appropriate mystery suspect",
        ),
        max_tokens=260,
        temperature=0.45,
    )
    if not prompt:
        return None
    cleaned = _clean_prompt_text(prompt)
    if len(cleaned.split()) < 50:
        return None
    return cleaned


def _build_local_tripo_prompt(character: Character) -> str:
    base = character.appearance.strip() or (
        f"Realistic full-body character, {character.age}-year-old {character.occupation}. "
        f"Personality: {character.personality}. "
        f"Archetype: {character.archetype or 'mystery suspect'}. "
        "Practical period-appropriate clothing."
    )
    voice_detail = " ".join(
        part
        for part in (
            f"Age impression: {character.age}.",
            f"Gender presentation: {character.gender_presentation}." if character.gender_presentation else "",
            f"Occupation: {character.occupation}.",
            f"Archetype: {character.archetype}." if character.archetype else "",
            f"Expression and posture should suggest {character.emotional_tell}." if character.emotional_tell else "",
            f"Body language: {character.pressure_response}." if character.pressure_response else "",
            "Design as a single full-body mystery-game suspect with no background scene, no text, and no extra people.",
        )
        if part
    )
    return f"{base} {voice_detail}{_TRIPO_STYLE_SUFFIX}"


def _clean_prompt_text(prompt: str) -> str:
    cleaned = re.sub(r"```(?:text)?|```", "", prompt).strip()
    cleaned = re.sub(r"^(prompt|tripo prompt)\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" \"'")
    return cleaned


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "character"


def _is_image_url(value: str) -> bool:
    return re.search(r"\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)", value, re.IGNORECASE) is not None


def _is_glb_or_gltf_url(value: str) -> bool:
    return re.search(r"\.(glb|gltf)(\?|$)", value, re.IGNORECASE) is not None


def _is_fbx_url(value: str) -> bool:
    return re.search(r"\.fbx(\?|$)", value, re.IGNORECASE) is not None
