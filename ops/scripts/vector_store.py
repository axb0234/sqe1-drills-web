from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Iterable, List

import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels


DEFAULT_COLLECTION = os.getenv("QDRANT_COLLECTION", "sqe1_material")


def _build_client() -> QdrantClient:
    api_key = os.getenv("QDRANT_API_KEY")
    url = os.getenv("QDRANT_URL")
    if url:
        return QdrantClient(url=url, api_key=api_key)

    host = os.getenv("QDRANT_HOST", "localhost")
    port = int(os.getenv("QDRANT_PORT", "6333"))
    prefer_grpc = (os.getenv("QDRANT_PREFER_GRPC") or "").lower() in {"1", "true", "yes"}
    return QdrantClient(host=host, port=port, api_key=api_key, prefer_grpc=prefer_grpc)


@dataclass
class EmbeddingRecord:
    id: str
    subject: str
    source_path: str
    page: int
    chunk_index: int
    text: str
    vec: np.ndarray  # float32


class QdrantVectorStore:
    def __init__(self, collection: str = DEFAULT_COLLECTION):
        self.collection = collection
        self.client = _build_client()

    def _ensure_collection(self, dim: int) -> None:
        if not self.client.collection_exists(self.collection):
            self.client.recreate_collection(
                collection_name=self.collection,
                vectors_config=qmodels.VectorParams(size=dim, distance=qmodels.Distance.COSINE),
            )
            return

        info = self.client.get_collection(self.collection)
        existing_dim = info.config.params.vectors.size
        if existing_dim != dim:
            raise ValueError(
                f"Qdrant collection '{self.collection}' expects dimension {existing_dim}, got {dim}"
            )

    def upsert(self, items: Iterable[EmbeddingRecord]) -> None:
        batch = list(items)
        if not batch:
            return

        vectors = [np.asarray(it.vec, dtype=np.float32) for it in batch]
        dim = int(vectors[0].shape[0])
        self._ensure_collection(dim)

        points = []
        for it, vec in zip(batch, vectors):
            points.append(
                qmodels.PointStruct(
                    id=it.id,
                    vector=vec.tolist(),
                    payload={
                        "subject": it.subject,
                        "source_path": it.source_path,
                        "page": int(it.page),
                        "chunk_index": int(it.chunk_index),
                        "text": it.text,
                    },
                )
            )

        self.client.upsert(collection_name=self.collection, points=points)

    def search(self, subject: str, query_vec: np.ndarray, top_k: int = 12) -> List[dict]:
        if not self.client.collection_exists(self.collection):
            return []

        vector = np.asarray(query_vec, dtype=np.float32).tolist()
        flt = qmodels.Filter(
            must=[
                qmodels.FieldCondition(
                    key="subject",
                    match=qmodels.MatchValue(value=subject),
                )
            ]
        )

        results = self.client.search(
            collection_name=self.collection,
            vector=vector,
            limit=top_k,
            with_payload=True,
            filter=flt,
        )

        hits: List[dict] = []
        for hit in results:
            payload = hit.payload or {}
            hits.append(
                {
                    "id": str(hit.id),
                    "score": float(hit.score) if hit.score is not None else 0.0,
                    "subject": payload.get("subject"),
                    "source_path": payload.get("source_path"),
                    "page": payload.get("page"),
                    "chunk_index": payload.get("chunk_index"),
                    "text": payload.get("text"),
                }
            )
        return hits


def emb_id(subject: str, source_path: str, page: int, chunk_idx: int) -> str:
    h = hashlib.sha1()
    h.update(subject.encode()); h.update(b"|")
    h.update(source_path.encode()); h.update(b"|")
    h.update(str(page).encode()); h.update(b"|")
    h.update(str(chunk_idx).encode())
    return h.hexdigest()
