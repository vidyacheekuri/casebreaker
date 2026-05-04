"""Shared LLM provider adapter for Anthropic or OpenAI."""

from __future__ import annotations

import json
import sys
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
    provider_order = _provider_order()
    for provider in provider_order:
        if provider == "anthropic":
            text = _generate_anthropic(
                system=system,
                user=user,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        elif provider == "openai":
            text = _generate_openai(
                system=system,
                user=user,
                max_tokens=max_tokens,
                temperature=temperature,
                json_mode=json_mode,
            )
        else:
            text = None
        if text:
            return text
    return None


def generate_claude_text(
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float = 0.7,
) -> str | None:
    """Generate text with Claude specifically, returning None if unavailable."""
    if not ANTHROPIC_API_KEY:
        return None
    return _generate_anthropic(
        system=system,
        user=user,
        max_tokens=max_tokens,
        temperature=temperature,
    )


def generate_json(
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float = 0.7,
) -> dict[str, Any] | None:
    """Generate and parse a JSON object from the active provider."""
    import sys
    print(f"[generate_json] Calling LLM with temp={temperature}, max_tokens={max_tokens}", file=sys.stderr)
    print(f"[generate_json] User message hash: {hash(user)}", file=sys.stderr)

    text = generate_text(
        system=system,
        user=user,
        max_tokens=max_tokens,
        temperature=temperature,
        json_mode=True,
    )
    if not text:
        _log_llm_warning("generate_json received no text from any configured provider.")
        return None

    print(f"[generate_json] Raw LLM text (first 150 chars): {text[:150]}", file=sys.stderr)

    try:
        result = json.loads(_strip_fences(text))
        print(f"[generate_json] Parsed JSON successfully: {str(result)[:100]}", file=sys.stderr)
        return result
    except Exception as exc:
        extracted = _extract_json_object(text)
        if extracted:
            try:
                result = json.loads(extracted)
                print(f"[generate_json] Parsed extracted JSON successfully: {str(result)[:100]}", file=sys.stderr)
                return result
            except Exception:
                pass
        _log_llm_warning(f"generate_json could not parse provider text: {exc}. Raw preview: {text[:240]!r}")
        return None


def _generate_anthropic(
    *,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
) -> str | None:
    import sys
    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=ANTHROPIC_API_KEY)
        print(f"[_generate_anthropic] Sending request to Claude API", file=sys.stderr)
        response = client.messages.create(
            model=CLAUDE_MODEL,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(getattr(block, "text", "") for block in response.content).strip()
        print(f"[_generate_anthropic] Received response: {text[:100]}", file=sys.stderr)
        if getattr(response, "stop_reason", None) == "max_tokens":
            _log_llm_warning("Anthropic response hit max_tokens; trying next provider if available.")
        return text
    except Exception as exc:
        _log_llm_warning(f"Anthropic generation failed: {type(exc).__name__}: {exc}")
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
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        _log_llm_warning(f"OpenAI generation failed: HTTP {exc.code}: {detail}")
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        _log_llm_warning(f"OpenAI generation failed: {type(exc).__name__}: {exc}")
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


def _provider_order() -> list[str]:
    if LLM_PROVIDER == "openai":
        return ["openai"] if OPENAI_API_KEY else []
    if LLM_PROVIDER == "anthropic":
        return ["anthropic"] if ANTHROPIC_API_KEY else []

    order: list[str] = []
    if ANTHROPIC_API_KEY:
        order.append("anthropic")
    if OPENAI_API_KEY:
        order.append("openai")
    return order


def _extract_json_object(text: str) -> str | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return text[start : end + 1]


def _log_llm_warning(message: str) -> None:
    print(f"[llm_provider] {message}", file=sys.stderr)
