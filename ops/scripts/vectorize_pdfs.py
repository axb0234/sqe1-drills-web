"""Vectorise PDFs into a local SQLite+NumPy vector store (per subject)."""
from __future__ import annotations
import os, argparse, logging, pathlib, hashlib
from typing import List, Tuple
import numpy as np
from pypdf import PdfReader
from tenacity import retry, wait_exponential, stop_after_attempt
from dotenv import load_dotenv
import tiktoken

from openai import OpenAI
from vector_store import LocalVectorStore, EmbeddingRecord, emb_id

load_dotenv(".env.ai", override=True)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

def azure_client() -> OpenAI:
    endpoint = os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/")
    key = os.environ["AZURE_OPENAI_API_KEY"]
    return OpenAI(api_key=key, base_url=f"{endpoint}/openai/v1")

def read_pdf_texts(pdf_path: str) -> List[Tuple[int, str]]:
    pages = []
    r = PdfReader(pdf_path)
    for i, p in enumerate(r.pages):
        txt = (p.extract_text() or "").strip()
        if txt:
            pages.append((i+1, txt))
    return pages

def chunk_by_tokens(text: str, max_tokens=800, overlap=120) -> List[str]:
    if not text.strip():
        return []
    enc = tiktoken.get_encoding("cl100k_base")
    toks = enc.encode(text)
    out = []
    i = 0
    step = max_tokens - overlap
    while i < len(toks):
        chunk = enc.decode(toks[i:i+max_tokens]).strip()
        if chunk:
            out.append(chunk)
        i += step
    return out

@retry(wait=wait_exponential(multiplier=1, min=1, max=20), stop=stop_after_attempt(5))
def embed_batch(cli: OpenAI, deployment: str, texts: List[str]) -> List[List[float]]:
    res = cli.embeddings.create(model=deployment, input=texts)
    return [d.embedding for d in res.data]

def main():
    ap = argparse.ArgumentParser(description="Vectorise PDFs into local store")
    ap.add_argument("--subject", required=True, help="e.g., 'Contract Law'")
    ap.add_argument("--pdfs-dir", required=True, help="Directory of PDFs")
    ap.add_argument("--emb-deploy", default=os.getenv("AOAI_EMBEDDINGS_DEPLOYMENT", "text-embedding-3-large"))
    ap.add_argument("--max-tokens", type=int, default=800)
    ap.add_argument("--overlap", type=int, default=120)
    ap.add_argument("--batch-size", type=int, default=32)
    args = ap.parse_args()

    cli = azure_client()
    store = LocalVectorStore()

    pdf_dir = pathlib.Path(args.pdfs_dir)
    pdfs = sorted([p for p in pdf_dir.rglob("*.pdf")])
    if not pdfs:
        logging.warning("No PDFs found in %s", pdf_dir)
        return 0

    logging.info("Found %d PDFs under %s", len(pdfs), pdf_dir)
    for pdf in pdfs:
        pages = read_pdf_texts(str(pdf))
        for page, text in pages:
            chunks = chunk_by_tokens(text, max_tokens=args.max_tokens, overlap=args.overlap)
            batch = []
            buf_texts = []
            meta = []
            for idx, ch in enumerate(chunks):
                uid = emb_id(args.subject, str(pdf), page, idx)
                buf_texts.append(ch)
                meta.append((uid, args.subject, str(pdf), page, idx, ch))
                if len(buf_texts) >= args.batch_size:
                    vecs = embed_batch(cli, args.emb_deploy, buf_texts)
                    for m, v in zip(meta, vecs):
                        batch.append(EmbeddingRecord(
                            id=m[0], subject=m[1], source_path=m[2], page=m[3], chunk_index=m[4],
                            text=m[5], vec=np.asarray(v, dtype=np.float32)
                        ))
                    store.upsert(batch)
                    batch, buf_texts, meta = [], [], []

            if buf_texts:
                vecs = embed_batch(cli, args.emb_deploy, buf_texts)
                for m, v in zip(meta, vecs):
                    batch.append(EmbeddingRecord(
                        id=m[0], subject=m[1], source_path=m[2], page=m[3], chunk_index=m[4],
                        text=m[5], vec=np.asarray(v, dtype=np.float32)
                    ))
                store.upsert(batch)

        logging.info("Vectorised: %s", pdf.name)

    logging.info("Done.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
