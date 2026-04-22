"""One-time Gutenberg ingest utility for the literary Chroma collection."""

from __future__ import annotations

import argparse
from pathlib import Path
from urllib.request import urlopen

from rag.chroma_client import get_chroma_client
from utils.config import GUTENBERG_CACHE_DIR, LITERARY_COLLECTION_NAME
from utils.embeddings import embed_text

SOURCES = {
    "styles": (
        "The Mysterious Affair at Styles",
        "Agatha Christie",
        "https://www.gutenberg.org/cache/epub/863/pg863.txt",
    ),
    "scarlet": (
        "A Study in Scarlet",
        "Arthur Conan Doyle",
        "https://www.gutenberg.org/cache/epub/244/pg244.txt",
    ),
    "norwood": (
        "The Adventure of the Norwood Builder",
        "Arthur Conan Doyle",
        "https://www.gutenberg.org/cache/epub/2852/pg2852.txt",
    ),
}


def chunk_text(text: str, chunk_size: int = 1100, overlap: int = 180) -> list[str]:
    """Chunk raw text into overlapping segments."""
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = max(end - overlap, end)
    return chunks


def main() -> None:
    """Download and embed selected Gutenberg texts."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=3)
    args = parser.parse_args()

    client = get_chroma_client()
    collection = client.get_or_create_collection(name=LITERARY_COLLECTION_NAME)

    count = 0
    for key, (title, author, url) in list(SOURCES.items())[: args.limit]:
        target = GUTENBERG_CACHE_DIR / f"{key}.txt"
        if not target.exists():
            text = urlopen(url, timeout=30).read().decode("utf-8", errors="ignore")
            target.write_text(text, encoding="utf-8")
        raw = target.read_text(encoding="utf-8")
        chunks = chunk_text(raw)
        collection.upsert(
            ids=[f"{key}:{index}" for index, _ in enumerate(chunks, start=1)],
            documents=chunks,
            embeddings=[embed_text(chunk) for chunk in chunks],
            metadatas=[
                {"source_title": title, "source_author": author}
                for _ in chunks
            ],
        )
        count += len(chunks)

    print(f"Embedded {count} literary chunks into {LITERARY_COLLECTION_NAME}.")


if __name__ == "__main__":
    main()
