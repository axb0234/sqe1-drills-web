from __future__ import annotations

import os
from typing import Any, Dict, Iterable, List

import psycopg
from psycopg import conninfo
from psycopg.rows import tuple_row
from psycopg.types.json import Json


def _build_conninfo() -> str:
    direct = (
        os.getenv("QUESTIONS_DSN")
        or os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL")
    )
    if direct:
        return direct

    params = {
        "host": os.getenv("PGHOST") or os.getenv("POSTGRES_HOST") or "localhost",
        "port": os.getenv("PGPORT") or os.getenv("POSTGRES_PORT") or "5432",
        "dbname": os.getenv("PGDATABASE") or os.getenv("APP_DB") or "sqe1",
        "user": os.getenv("PGUSER") or os.getenv("APP_DB_USER") or "app",
    }
    password = os.getenv("PGPASSWORD") or os.getenv("APP_DB_PASS")
    if password:
        params["password"] = password
    sslmode = os.getenv("PGSSLMODE") or os.getenv("POSTGRES_SSLMODE")
    if sslmode:
        params["sslmode"] = sslmode
    return conninfo.make_conninfo(**params)


_CONNINFO = _build_conninfo()

SCHEMA_STATEMENTS: List[str] = [
    """
    CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        topic TEXT NOT NULL,
        stem TEXT NOT NULL,
        answer_index INTEGER NOT NULL,
        rationale_correct TEXT NOT NULL,
        source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS choices (
        id SERIAL PRIMARY KEY,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        text TEXT NOT NULL,
        rationale TEXT NOT NULL,
        UNIQUE (question_id, label)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_choices_question ON choices(question_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_questions_subject ON questions(subject_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_questions_active ON questions(is_active)
    """,
    """
    CREATE TABLE IF NOT EXISTS drill_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        subject TEXT NOT NULL,
        total INTEGER NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        duration_sec INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS drill_items (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES drill_sessions(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        user_answer INTEGER,
        is_correct BOOLEAN,
        answered_at TIMESTAMPTZ,
        elapsed_ms INTEGER,
        UNIQUE (session_id, order_index)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_drill_items_session ON drill_items(session_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_drill_items_question ON drill_items(question_id)
    """,
]


def _conn():
    return psycopg.connect(_CONNINFO, row_factory=tuple_row)


def ensure_schema() -> None:
    with _conn() as cx:
        with cx.cursor() as cur:
            for stmt in SCHEMA_STATEMENTS:
                cur.execute(stmt)


def upsert_subject(name: str) -> int:
    ensure_schema()
    with _conn() as cx:
        with cx.cursor() as cur:
            cur.execute(
                """
                INSERT INTO subjects(name) VALUES (%s)
                ON CONFLICT (name) DO NOTHING
                RETURNING id
                """,
                (name,),
            )
            row = cur.fetchone()
            if row:
                return int(row[0])
            cur.execute("SELECT id FROM subjects WHERE name = %s", (name,))
            found = cur.fetchone()
            if not found:
                raise RuntimeError(f"Failed to locate subject '{name}' after upsert")
            return int(found[0])


def insert_mcq_batch(subject: str, topic: str, payload: Dict[str, Any]) -> None:
    ensure_schema()
    sid = upsert_subject(subject)
    questions = payload.get("questions", []) or []

    with _conn() as cx:
        with cx.cursor() as cur:
            for q in questions:
                chosen_topic = (
                    q.get("topic")
                    or topic
                    or payload.get("topic")
                    or "General"
                )

                cur.execute(
                    """
                    INSERT INTO questions (subject_id, topic, stem, answer_index, rationale_correct, source_refs)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        sid,
                        chosen_topic,
                        q["stem"],
                        int(q["answer_index"]),
                        q.get("rationale_correct", ""),
                        Json(q.get("source_refs") or []),
                    ),
                )
                question_id = int(cur.fetchone()[0])

                options: Iterable[str] = q.get("options", [])
                wrong = q.get("rationale_incorrect", {}) or {}
                labels = ["A", "B", "C", "D", "E"]
                for idx, label in enumerate(labels):
                    text = options[idx] if idx < len(options) else ""
                    cur.execute(
                        """
                        INSERT INTO choices (question_id, label, text, rationale)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (question_id, label) DO UPDATE SET
                            text = EXCLUDED.text,
                            rationale = EXCLUDED.rationale
                        """,
                        (
                            question_id,
                            label,
                            text,
                            wrong.get(label, ""),
                        ),
                    )


def list_subject_topics(subject: str, limit: int = 50) -> List[str]:
    ensure_schema()
    with _conn() as cx:
        with cx.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT q.topic
                FROM questions q
                JOIN subjects s ON s.id = q.subject_id
                WHERE s.name = %s
                ORDER BY q.topic
                LIMIT %s
                """,
                (subject, limit),
            )
            rows = cur.fetchall()
            return [r[0] for r in rows if r and r[0]]
