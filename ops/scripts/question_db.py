"""Utilities for managing the SQE question SQLite database."""
from __future__ import annotations

import hashlib
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(test_id, name),
    FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    question_hash TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS choices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    choice_text TEXT NOT NULL,
    explanation TEXT NOT NULL,
    is_correct INTEGER NOT NULL CHECK(is_correct IN (0,1)),
    UNIQUE(question_id, label),
    FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
);
"""


@dataclass(frozen=True)
class Choice:
    label: str
    text: str
    explanation: str
    is_correct: bool


class QuestionDatabase:
    """High level helper for the question SQLite database."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(SCHEMA)
            conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def ensure_test(self, name: str) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT OR IGNORE INTO tests(name) VALUES (?)",
                (name,),
            )
            conn.commit()
            cur = conn.execute("SELECT id FROM tests WHERE name = ?", (name,))
            row = cur.fetchone()
            if row is None:
                raise RuntimeError(f"Failed to ensure test '{name}' exists")
            return int(row["id"])

    def ensure_subject(self, test_name: str, subject_name: str) -> int:
        test_id = self.ensure_test(test_name)
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO subjects(test_id, name) VALUES (?, ?)",
                (test_id, subject_name),
            )
            conn.commit()
            cur = conn.execute(
                "SELECT id FROM subjects WHERE test_id = ? AND name = ?",
                (test_id, subject_name),
            )
            row = cur.fetchone()
            if row is None:
                raise RuntimeError(
                    f"Failed to ensure subject '{subject_name}' for test '{test_name}'"
                )
            return int(row["id"])

    def get_recent_question_texts(
        self, subject_id: int, limit: int = 50
    ) -> List[str]:
        with self._connect() as conn:
            cur = conn.execute(
                """
                SELECT question_text
                FROM questions
                WHERE subject_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (subject_id, limit),
            )
            return [str(row["question_text"]) for row in cur.fetchall()]

    def question_exists(self, question_text: str) -> bool:
        question_hash = _hash_question(question_text)
        with self._connect() as conn:
            cur = conn.execute(
                "SELECT 1 FROM questions WHERE question_hash = ?",
                (question_hash,),
            )
            return cur.fetchone() is not None

    def insert_question(
        self,
        subject_id: int,
        question_text: str,
        choices: Sequence[Choice],
    ) -> int:
        if len(choices) != 5:
            raise ValueError("Questions must have exactly 5 choices")

        question_hash = _hash_question(question_text)
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO questions(subject_id, question_text, question_hash) VALUES (?, ?, ?)",
                (subject_id, question_text, question_hash),
            )
            question_id = int(cur.lastrowid)
            conn.executemany(
                """
                INSERT INTO choices(question_id, label, choice_text, explanation, is_correct)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    (
                        question_id,
                        choice.label,
                        choice.text,
                        choice.explanation,
                        1 if choice.is_correct else 0,
                    )
                    for choice in choices
                ],
            )
            conn.commit()
            return question_id

    def iter_subject_questions(self, subject_id: int) -> Iterable[sqlite3.Row]:
        with self._connect() as conn:
            cur = conn.execute(
                "SELECT * FROM questions WHERE subject_id = ? ORDER BY id",
                (subject_id,),
            )
            for row in cur:
                yield row


def _hash_question(question_text: str) -> str:
    normalized = " ".join(question_text.split()).strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
