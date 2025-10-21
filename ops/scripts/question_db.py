from __future__ import annotations
import os, sqlite3, json
from typing import List, Dict, Any

DEFAULT_DB = os.getenv("QUESTIONS_DB", "ops/data/questions.sqlite3")

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL,
  topic TEXT NOT NULL,
  stem TEXT NOT NULL,
  answer_index INTEGER NOT NULL,
  rationale_correct TEXT NOT NULL,
  source_refs TEXT NOT NULL,   -- JSON array
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(subject_id) REFERENCES subjects(id)
);
CREATE TABLE IF NOT EXISTS choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL,
  label TEXT NOT NULL,    -- 'A'..'E'
  text TEXT NOT NULL,
  rationale TEXT NOT NULL,
  FOREIGN KEY(question_id) REFERENCES questions(id)
);
"""

def _conn(db_path: str = DEFAULT_DB):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    cx = sqlite3.connect(db_path)
    return cx

def ensure_schema(db_path: str = DEFAULT_DB):
    with _conn(db_path) as cx:
        for stmt in SCHEMA.strip().split(";"):
            s = stmt.strip()
            if s:
                cx.execute(s)

def upsert_subject(name: str, db_path: str = DEFAULT_DB) -> int:
    ensure_schema(db_path)
    with _conn(db_path) as cx:
        cx.execute("INSERT OR IGNORE INTO subjects(name) VALUES (?)", (name,))
        row = cx.execute("SELECT id FROM subjects WHERE name=?", (name,)).fetchone()
    return int(row[0])

def insert_mcq_batch(subject: str, topic: str, payload: Dict[str, Any], db_path: str = DEFAULT_DB):
    """
    payload schema:
    {
      "topic": "...",
      "questions": [
        {
          "stem": "...",
          "options": ["A","B","C","D","E"],
          "answer_index": 0..4,
          "rationale_correct": "...",
          "rationale_incorrect": {"A":"...","B":"...","C":"...","D":"...","E":"..."},
          "source_refs": ["file#p1", ...]
        }, ...
      ]
    }
    """
    ensure_schema(db_path)
    sid = upsert_subject(subject, db_path)
    with _conn(db_path) as cx:
        for q in payload.get("questions", []):
            cur = cx.execute("""
              INSERT INTO questions(subject_id, topic, stem, answer_index, rationale_correct, source_refs)
              VALUES (?, ?, ?, ?, ?, ?)
            """, (sid, topic, q["stem"], int(q["answer_index"]), q["rationale_correct"], json.dumps(q.get("source_refs", []))))
            qid = cur.lastrowid
            opts = q["options"]
            wrong = q.get("rationale_incorrect", {})
            labels = ["A","B","C","D","E"]
            for i, label in enumerate(labels):
                cx.execute("""
                  INSERT INTO choices(question_id, label, text, rationale)
                  VALUES (?, ?, ?, ?)
                """, (qid, label, opts[i], wrong.get(label, "")))
