"""CLI utility to vectorize subject PDFs into the local vector store."""
from __future__ import annotations

import argparse
import hashlib
import logging
from pathlib import Path
from typing import Iterable, List

import numpy as np
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

if __package__ in (None, ""):
    import sys

    package_root = Path(__file__).resolve().parent.parent
    if str(package_root) not in sys.path:
        sys.path.append(str(package_root))
    from scripts.vector_store import Chunk, VectorStore  # type: ignore
else:
    from .vector_store import Chunk, VectorStore


logger = logging.getLogger(__name__)


def chunk_text(text: str, chunk_size: int, overlap: int) -> List[str]:
    tokens = text.split()
    if not tokens:
        return []
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunks.append(" ".join(chunk_tokens))
        if end == len(tokens):
            break
        start = max(end - overlap, 0)
        if start == end:
            start += 1
    return chunks


def checksum_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fp:
        for block in iter(lambda: fp.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def read_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    text_parts: List[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        text_parts.append(text.strip())
    return "\n".join(part for part in text_parts if part)


def vectorize_subject(
    subject: str,
    pdf_dir: Path,
    vector_db: Path,
    model_name: str,
    chunk_size: int,
    overlap: int,
) -> None:
    model = SentenceTransformer(model_name)
    store = VectorStore(vector_db)

    pdf_paths = sorted([p for p in pdf_dir.glob("*.pdf") if p.is_file()])
    logger.info("Found %d PDF(s) for subject '%s'", len(pdf_paths), subject)
    for pdf_path in pdf_paths:
        checksum = checksum_file(pdf_path)
        existing = store.get_file_record(subject, pdf_path)
        if existing and existing["checksum"] == checksum:
            logger.info("Skipping unchanged PDF: %s", pdf_path.name)
            continue
        text = read_pdf(pdf_path)
        if not text:
            logger.warning("Skipping empty PDF: %s", pdf_path)
            continue
        text_chunks = chunk_text(text, chunk_size=chunk_size, overlap=overlap)
        if not text_chunks:
            logger.warning("No chunks generated for %s", pdf_path)
            continue
        embeddings = model.encode(text_chunks, convert_to_numpy=True, normalize_embeddings=True)
        chunk_objects = [
            Chunk(
                subject=subject,
                source_path=pdf_path,
                chunk_index=i,
                content=chunk_text_str,
                embedding=np.asarray(embeddings[i], dtype=np.float32),
            )
            for i, chunk_text_str in enumerate(text_chunks)
        ]
        store.upsert_file(subject, pdf_path, checksum, chunk_objects)
        logger.info(
            "Vectorized %s (%d chunks)",
            pdf_path.name,
            len(chunk_objects),
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("subject", help="Name of the subject the PDFs belong to")
    parser.add_argument("pdf_dir", type=Path, help="Directory containing subject PDFs")
    parser.add_argument(
        "vector_db",
        type=Path,
        help="Path to the SQLite file backing the vector store",
    )
    parser.add_argument(
        "--model",
        default="sentence-transformers/all-MiniLM-L6-v2",
        help="SentenceTransformer model to use",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=180,
        help="Chunk size in tokens (approximate words)",
    )
    parser.add_argument(
        "--overlap",
        type=int,
        default=40,
        help="Chunk overlap in tokens",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return parser


def main(argv: Iterable[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(level=getattr(logging, args.log_level))

    if not args.pdf_dir.exists():
        raise SystemExit(f"PDF directory not found: {args.pdf_dir}")

    vectorize_subject(
        subject=args.subject,
        pdf_dir=args.pdf_dir,
        vector_db=args.vector_db,
        model_name=args.model,
        chunk_size=args.chunk_size,
        overlap=args.overlap,
    )


if __name__ == "__main__":
    main()
