"""Deterministic local embeddings used for Chroma and novelty checks."""

from __future__ import annotations

import hashlib
import math

from .config import NOVELTY_DIMENSIONS


def embed_text(text: str, *, dimensions: int = NOVELTY_DIMENSIONS) -> list[float]:
    """Convert text into a deterministic dense vector without external services."""
    if not text.strip():
        return [0.0] * dimensions

    buckets = [0.0] * dimensions
    tokens = text.lower().split()
    for idx, token in enumerate(tokens, start=1):
        digest = hashlib.sha256(f"{idx}:{token}".encode("utf-8")).digest()
        for offset in range(0, len(digest), 2):
            bucket = digest[offset] % dimensions
            weight = ((digest[offset + 1] / 255.0) * 2.0) - 1.0
            buckets[bucket] += weight

    norm = math.sqrt(sum(value * value for value in buckets))
    if norm == 0:
        return buckets
    return [value / norm for value in buckets]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    """Return cosine similarity for normalized or unnormalized vectors."""
    if not left or not right or len(left) != len(right):
        return 0.0

    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    return dot / (left_norm * right_norm)
