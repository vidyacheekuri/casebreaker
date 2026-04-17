"""
Build Literary Corpus — run ONCE before first session.

1. Downloads .txt files from Project Gutenberg for classic detective fiction
2. Cleans and chunks each text into ~300 token passages with overlap
3. Tags each chunk with source_title, source_author, chunk_id
4. Embeds all chunks using text-embedding-3-small
5. Stores in ChromaDB collection: literary_corpus

Usage:
    cd Casebreaker_AI && PYTHONPATH=. python -m casebreaker.backend.scripts.build_literary_corpus
"""

import re
import sys
from pathlib import Path

# Add project root to path
_root = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(_root))

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)

# Gutenberg book IDs and metadata
GUTENBERG_BOOKS = [
    {"id": 863, "title": "The Mysterious Affair at Styles", "author": "Agatha Christie"},
    {"id": 25514, "title": "And Then There Were None", "author": "Agatha Christie"},
    {"id": 16354, "title": "The Murder of Roger Ackroyd", "author": "Agatha Christie"},
    {"id": 244, "title": "A Study in Scarlet", "author": "Arthur Conan Doyle"},
    {"id": 2852, "title": "The Hound of the Baskervilles", "author": "Arthur Conan Doyle"},
    {"id": 2348, "title": "The Adventure of the Norwood Builder", "author": "Arthur Conan Doyle"},
    {"id": 2148, "title": "The Murders in the Rue Morgue", "author": "Edgar Allan Poe"},
]

# ~4 chars per token rough estimate; 300 tokens ≈ 1200 chars
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200


def fetch_gutenberg_text(book_id: int) -> str:
    """Fetch plain text from Project Gutenberg."""
    url = f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.txt"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        return r.text
    except Exception as e:
        print(f"  Failed to fetch {book_id}: {e}")
        return ""


def clean_text(text: str) -> str:
    """Remove Gutenberg boilerplate and normalize."""
    # Common Gutenberg headers/footers
    start_markers = [
        "*** START OF",
        "***START OF",
        "Beginning of this Project Gutenberg",
    ]
    end_markers = [
        "*** END OF",
        "***END OF",
        "End of the Project Gutenberg",
    ]
    for m in start_markers:
        idx = text.find(m)
        if idx != -1:
            text = text[idx:]
            break
    for m in end_markers:
        idx = text.find(m)
        if idx != -1:
            text = text[:idx]
            break
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start = end - overlap
    return chunks


def main():
    print("Building literary corpus for CaseBreaker AI Layer 2 RAG...")
    all_chunks: list[tuple[str, str, str]] = []

    for book in GUTENBERG_BOOKS:
        print(f"  Fetching {book['title']}...")
        raw = fetch_gutenberg_text(book["id"])
        if not raw:
            continue
        cleaned = clean_text(raw)
        chunks = chunk_text(cleaned)
        for c in chunks:
            all_chunks.append((c, book["title"], book["author"]))
        print(f"    -> {len(chunks)} chunks")

    print(f"\nTotal chunks: {len(all_chunks)}")
    if not all_chunks:
        print("No chunks to embed. Exiting.")
        sys.exit(1)

    print("Embedding into ChromaDB (literary_corpus)...")
    from casebreaker.backend.rag.literary_embedder import embed_literary_corpus

    embed_literary_corpus(all_chunks)
    print("Done. literary_corpus collection is ready.")


if __name__ == "__main__":
    main()
