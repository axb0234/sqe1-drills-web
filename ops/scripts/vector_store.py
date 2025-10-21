from __future__ import annotations
import os, sqlite3, hashlib, json
from dataclasses import dataclass
from typing import Iterable, List, Tuple, Optional
import numpy as np

DEFAULT_DB = os.getenv("VECTOR_DB", "ops/data/vector_store.sqlite3")

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS embeddings (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  source_path TEXT NOT NULL,
  page INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vec BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_embeddings_subject ON embeddings(subject);
CREATE INDEX IF NOT EXISTS ix_embeddings_source ON embeddings(source_path);
"""

@dataclass
class EmbeddingRecord:
    id: str
    subject: str
    source_path: str
    page: int
    chunk_index: int
    text: str
    vec: np.ndarray  # float32

class LocalVectorStore:
    def __init__(self, db_path: str = DEFAULT_DB):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._init_db()

    def _conn(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._conn() as cx:
            for stmt in SCHEMA.strip().split(";"):
                s = stmt.strip()
                if s:
                    cx.execute(s)

    def upsert(self, items: Iterable[EmbeddingRecord]):
        rows = []
        for it in items:
            vec = np.asarray(it.vec, dtype=np.float32)
            rows.append((
                it.id, it.subject, it.source_path, it.page, it.chunk_index,
                it.text, int(vec.shape[0]), vec.tobytes()
            ))
        with self._conn() as cx:
            cx.executemany("""
                INSERT INTO embeddings (id,subject,source_path,page,chunk_index,text,dim,vec)
                VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                  subject=excluded.subject,
                  source_path=excluded.source_path,
                  page=excluded.page,
                  chunk_index=excluded.chunk_index,
                  text=excluded.text,
                  dim=excluded.dim,
                  vec=excluded.vec
            """, rows)

    def search(self, subject: str, query_vec: np.ndarray, top_k: int = 12) -> List[dict]:
        """Cosine similarity in Python (loads only the subject’s rows)."""
        with self._conn() as cx:
            cur = cx.execute("SELECT id, source_path, page, chunk_index, text, dim, vec FROM embeddings WHERE subject=?",
                             (subject,))
            rows = cur.fetchall()

        if not rows:
            return []

        vecs = []
        metas = []
        for (id_, src, page, idx, text, dim, blob) in rows:
            v = np.frombuffer(blob, dtype=np.float32)
            if v.shape[0] != dim:
                continue
            vecs.append(v)
            metas.append({"id": id_, "source_path": src, "page": page, "chunk_index": idx, "text": text})

        if not vecs:
            return []

        M = np.vstack(vecs)  # (N, d)
        q = np.asarray(query_vec, dtype=np.float32)
        # cosine similarity
        M_norm = M / (np.linalg.norm(M, axis=1, keepdims=True) + 1e-8)
        q_norm = q / (np.linalg.norm(q) + 1e-8)
        sims = M_norm @ q_norm
        order = np.argsort(-sims)[:top_k]

        results = []
        for i in order:
            m = metas[i].copy()
            m["score"] = float(sims[i])
            results.append(m)
        return results

def emb_id(subject: str, source_path: str, page: int, chunk_idx: int) -> str:
    h = hashlib.sha1()
    h.update(subject.encode()); h.update(b"|")
    h.update(source_path.encode()); h.update(b"|")
    h.update(str(page).encode()); h.update(b"|")
    h.update(str(chunk_idx).encode())
    return h.hexdigest()
