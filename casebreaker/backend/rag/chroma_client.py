"""
Shared ChromaDB client — persistent storage for Layer 1 and Layer 2.
"""

import chromadb
from pathlib import Path

# Persist to project data directory
_data_dir = Path(__file__).resolve().parent.parent.parent.parent / "chroma_data"
_data_dir.mkdir(parents=True, exist_ok=True)

_client = None


def get_chroma_client():
    """Return shared persistent ChromaDB client."""
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=str(_data_dir))
    return _client
