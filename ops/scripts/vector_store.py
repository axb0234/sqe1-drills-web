"""Vector store helpers for PDF embeddings."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence

import numpy as np


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    path TEXT NOT NULL,
    checksum TEXT NOT NULL,
    chunk_count INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(subject, path)
);

CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB NOT NULL,
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
);
"""


@dataclass(frozen=True)
class Chunk:
    subject: str
    source_path: Path
    chunk_index: int
    content: str
    embedding: np.ndarray


class VectorStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(SCHEMA)
            conn.commit()

    def upsert_file(self, subject: str, path: Path, checksum: str, chunks: Sequence[Chunk]) -> None:
        with self._connect() as conn:
            cur = conn.execute(
                "SELECT id, checksum FROM files WHERE subject = ? AND path = ?",
                (subject, str(path)),
            )
            row = cur.fetchone()
            if row is None:
                cur = conn.execute(
                    "INSERT INTO files(subject, path, checksum, chunk_count) VALUES (?, ?, ?, ?)",
                    (subject, str(path), checksum, len(chunks)),
                )
                file_id = int(cur.lastrowid)
            else:
                file_id = int(row["id"])
                if row["checksum"] != checksum:
                    conn.execute("DELETE FROM chunks WHERE file_id = ?", (file_id,))
                    conn.execute(
                        "UPDATE files SET checksum = ?, chunk_count = ?, updated_at = datetime('now') WHERE id = ?",
                        (checksum, len(chunks), file_id),
                    )
                else:
                    conn.execute(
                        "UPDATE files SET chunk_count = ?, updated_at = datetime('now') WHERE id = ?",
                        (len(chunks), file_id),
                    )
                    conn.execute("DELETE FROM chunks WHERE file_id = ?", (file_id,))

            conn.executemany(
                """
                INSERT INTO chunks(file_id, chunk_index, content, embedding)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (
                        file_id,
                        chunk.chunk_index,
                        chunk.content,
                        chunk.embedding.tobytes(),
                    )
                    for chunk in chunks
                ],
            )
            conn.commit()

    def get_file_record(self, subject: str, path: Path) -> dict | None:
        with self._connect() as conn:
            cur = conn.execute(
                "SELECT id, checksum, chunk_count, updated_at FROM files WHERE subject = ? AND path = ?",
                (subject, str(path)),
            )
            row = cur.fetchone()
            return dict(row) if row else None

    def remove_file(self, subject: str, path: Path) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM files WHERE subject = ? AND path = ?", (subject, str(path)))
            conn.commit()

    def list_subject_chunks(self, subject: str) -> List[Chunk]:
        with self._connect() as conn:
            cur = conn.execute(
                """
                SELECT files.path, chunks.chunk_index, chunks.content, chunks.embedding
                FROM chunks
                JOIN files ON chunks.file_id = files.id
                WHERE files.subject = ?
                ORDER BY files.path, chunks.chunk_index
                """,
                (subject,),
            )
            return [
                Chunk(
                    subject=subject,
                    source_path=Path(row["path"]),
                    chunk_index=int(row["chunk_index"]),
                    content=str(row["content"]),
                    embedding=np.frombuffer(row["embedding"], dtype=np.float32),
                )
                for row in cur.fetchall()
            ]

    def random_subject_chunks(self, subject: str, k: int) -> List[Chunk]:
        chunks = self.list_subject_chunks(subject)
        if not chunks:
            return []
        indices = np.random.choice(len(chunks), size=min(k, len(chunks)), replace=False)
        return [chunks[int(idx)] for idx in indices]

    def export_metadata(self) -> List[dict]:
        with self._connect() as conn:
            cur = conn.execute(
                "SELECT subject, path, checksum, chunk_count, updated_at FROM files ORDER BY subject, path"
            )
            return [dict(row) for row in cur.fetchall()]


def chunks_to_json(chunks: Iterable[Chunk]) -> List[dict]:
    return [
        {
            "subject": chunk.subject,
            "source_path": str(chunk.source_path),
            "chunk_index": chunk.chunk_index,
            "content": chunk.content,
        }
        for chunk in chunks
    ]
