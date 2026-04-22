"""Shared LLM provider adapter for Anthropic or OpenAI."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from utils.config import ANTHROPIC_API_KEY, CLAUDE_MODEL, LLM_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL


def configured_provider() -> str | None:
    """Return the active LLM provider name in priority order."""
    if LLM_PROVIDER == "openai" and OPENAI_API_KEY:
        return "openai"
    if LLM_PROVIDER == "anthropic" and ANTHROPIC_API_KEY:
        return "anthropic"
    if ANTHROPIC_API_KEY:
        return "anthropic"
    if OPENAI_API_KEY:
        return "openai"
    return None


def generate_text(
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float = 0.7,
    json_mode: bool = True,
) -> str | None:
    """Generate text from whichever provider is configured.

    Anthropic is preferred when both keys exist to preserve the repo's original
    behavior. If only OPENAI_API_KEY exists, OpenAI is used automatically.
    """
    provider = configured_provider()
    if provider == "anthropic":
        return _generate_anthropic(
            system=system,
            user=user,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    if provider == "openai":
        return _generate_openai(
            system=system,
            user=user,
            max_tokens=max_tokens,
            temperature=temperature,
            json_mode=json_mode,
        )
    return None


def generate_json(
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float = 0.7,
) -> dict[str, Any] | None:
    """Generate and parse a JSON object from the active provider."""
    text = generate_text(
        system=system,
        user=user,
        max_tokens=max_tokens,
        temperature=temperature,
        json_mode=True,
    )
    if not text:
        return None

    try:
        return json.loads(_strip_fences(text))
    except Exception:
        return None


def _generate_anthropic(
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
) -> str | None:
    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=CLAUDE_MODEL,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": "user", "content": user}],
        )
        if getattr(response, "stop_reason", None) == "max_tokens":
            return None
        return "".join(getattr(block, "text", "") for block in response.content).strip()
    except Exception:
        return None


def _generate_openai(
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
    json_mode: bool,
) -> str | None:
    if not OPENAI_API_KEY:
        return None

    payload: dict[str, Any] = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    choices = raw.get("choices")
    if not isinstance(choices, list) or not choices:
        return None

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    return content.strip() if isinstance(content, str) else None


def _strip_fences(text: str) -> str:
    import re

    cleaned = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if match:
        return match.group(1).strip()
    return cleaned
