"""Vectorise PDFs into a local SQLite+NumPy vector store (per subject)."""
from __future__ import annotations
import os, argparse, logging, pathlib
from typing import List, Tuple
import numpy as np
from pypdf import PdfReader
from tenacity import retry, wait_exponential, stop_after_attempt
from dotenv import load_dotenv
import tiktoken

from openai import AzureOpenAI
from vector_store import LocalVectorStore, EmbeddingRecord, emb_id

load_dotenv(".env.ai", override=True)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

def embed_client() -> AzureOpenAI:
    # Uses the *embeddings* resource (endpoint/key/version) from .env.ai
    return AzureOpenAI(
        api_key=os.environ["AOAI_EMBEDDINGS_KEY"],
        azure_endpoint=os.environ["AOAI_EMBEDDINGS_ENDPOINT"].rstrip("/"),
        api_version=os.getenv("AOAI_EMBEDDINGS_API_VERSION", "2024-12-01-preview"),
    )

def read_pdf_texts(pdf_path: str) -> List[Tuple[int, str]]:
    pages = []
    r = PdfReader(pdf_path)
    for i, p in enumerate(r.pages):
        txt = (p.extract_text() or "").strip()
        if txt:
            pages.append((i + 1, txt))
    return pages

def chunk_by_tokens(text: str, max_tokens=800, overlap=120) -> List[str]:
    if not text.strip():
        return []
    enc = tiktoken.get_encoding("cl100k_base")
    toks = enc.encode(text)
    out: List[str] = []
    step = max(1, max_tokens - overlap)  # guard against non-positive step
    i = 0
    while i < len(toks):
        chunk = enc.decode(toks[i:i + max_tokens]).strip()
        if chunk:
            out.append(chunk)
        i += step
    return out

@retry(wait=wait_exponential(multiplier=1, min=1, max=20), stop=stop_after_attempt(5))
def embed_batch(cli: AzureOpenAI, deployment: str, texts: List[str]) -> List[List[float]]:
    res = cli.embeddings.create(model=deployment, input=texts)  # deployment name, not base model
    return [d.embedding for d in res.data]

def main():
    ap = argparse.ArgumentParser(description="Vectorise PDFs into local store")
    ap.add_argument("--subject", required=True, help="e.g., 'Contract Law'")
    ap.add_argument("--pdfs-dir", required=True, help="Directory of PDFs")
    ap.add_argument("--emb-deploy", default=os.getenv("AOAI_EMBEDDINGS_DEPLOYMENT", "embed-sqe"))
    ap.add_argument("--max-tokens", type=int, default=800)
    ap.add_argument("--overlap", type=int, default=120)
    ap.add_argument("--batch-size", type=int, default=32)
    args = ap.parse_args()

    cli = embed_client()
    store = LocalVectorStore()

    pdf_dir = pathlib.Path(args.pdfs_dir)
    pdfs = sorted(pdf_dir.rglob("*.pdf"))
    if not pdfs:
        logging.warning("No PDFs found in %s", pdf_dir)
        return 0

    logging.info("Found %d PDFs under %s", len(pdfs), pdf_dir)
    for pdf in pdfs:
        pages = read_pdf_texts(str(pdf))
        for page, text in pages:
            chunks = chunk_by_tokens(text, max_tokens=args.max_tokens, overlap=args.overlap)
            batch_recs: List[EmbeddingRecord] = []
            buf_texts: List[str] = []
            meta = []

            for idx, ch in enumerate(chunks):
                uid = emb_id(args.subject, str(pdf), page, idx)
                buf_texts.append(ch)
                meta.append((uid, args.subject, str(pdf), page, idx, ch))

                if len(buf_texts) >= args.batch_size:
                    vecs = embed_batch(cli, args.emb_deploy, buf_texts)
                    for m, v in zip(meta, vecs):
                        batch_recs.append(EmbeddingRecord(
                            id=m[0], subject=m[1], source_path=m[2], page=m[3], chunk_index=m[4],
                            text=m[5], vec=np.asarray(v, dtype=np.float32)
                        ))
                    store.upsert(batch_recs)
                    batch_recs, buf_texts, meta = [], [], []

            if buf_texts:
                vecs = embed_batch(cli, args.emb_deploy, buf_texts)
                for m, v in zip(meta, vecs):
                    batch_recs.append(EmbeddingRecord(
                        id=m[0], subject=m[1], source_path=m[2], page=m[3], chunk_index=m[4],
                        text=m[5], vec=np.asarray(v, dtype=np.float32)
                    ))
                store.upsert(batch_recs)

        logging.info("Vectorised: %s", pdf.name)

    logging.info("Done.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
