"""Shared persistent Chroma client."""

from __future__ import annotations

import chromadb

from utils.config import CHROMA_PATH

_client: chromadb.PersistentClient | None = None


def get_chroma_client() -> chromadb.PersistentClient:
    """Return the singleton Chroma client."""
    global _client
    if _client is None:
        CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    return _client
