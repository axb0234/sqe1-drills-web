"""Retrieve context from local vector store and generate MCQs via Azure OpenAI."""
from __future__ import annotations
import os, argparse, json, time, textwrap
from typing import List
from dotenv import load_dotenv
from openai import OpenAI
import numpy as np

from vector_store import LocalVectorStore
from question_db import insert_mcq_batch

load_dotenv(".env.ai", override=True)

SYSTEM_PROMPT = """You are an SQE1 question writer.
Write high-quality single-best-answer MCQs with 5 options (A–E), exactly one correct.
Each question must be self-contained, precise, and exam-ready. No ambiguity.
Use UK law terminology.

Return STRICT JSON:
{
  "topic": "<string>",
  "questions": [
    {
      "stem": "<string>",
      "options": ["<A>","<B>","<C>","<D>","<E>"],
      "answer_index": <0-4>,
      "rationale_correct": "<string>",
      "rationale_incorrect": {
        "A": "<why wrong>",
        "B": "<why wrong>",
        "C": "<why wrong>",
        "D": "<why wrong>",
        "E": "<why wrong>"
      },
      "source_refs": ["<file#pN>", ...]
    }
  ]
}
"""

def azure_client() -> OpenAI:
    endpoint = os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/")
    key = os.environ["AZURE_OPENAI_API_KEY"]
    return OpenAI(api_key=key, base_url=f"{endpoint}/openai/v1")

def main():
    ap = argparse.ArgumentParser(description="Generate SQE1 MCQs using retrieved context")
    ap.add_argument("--subject", required=True, help="e.g., 'Contract Law'")
    ap.add_argument("--topic", required=True, help="e.g., 'Consideration in contract law'")
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--top-k", type=int, default=12)
    ap.add_argument("--temperature", type=float, default=0.2)
    ap.add_argument("--chat-deploy", default=os.getenv("AOAI_CHAT_DEPLOYMENT", "gpt-4o-mini"))
    ap.add_argument("--emb-deploy", default=os.getenv("AOAI_EMBEDDINGS_DEPLOYMENT", "text-embedding-3-large"))
    args = ap.parse_args()

    cli = azure_client()
    store = LocalVectorStore()

    # Query embedding
    qvec = cli.embeddings.create(model=args.emb_deploy, input=[args.topic]).data[0].embedding
    hits = store.search(args.subject, np.asarray(qvec, dtype=np.float32), top_k=args.top_k)

    if not hits:
        ctx = "No context found in the store for this subject."
        refs = []
    else:
        ctx_lines = []
        refs = []
        for i, h in enumerate(hits):
            snippet = (h["text"] or "")[:1200]
            ctx_lines.append(f"[{i+1}] {h['source_path']}#p{h['page']}\n{snippet}")
            refs.append(f"{h['source_path']}#p{h['page']}")
        ctx = "\n\n".join(ctx_lines)

    user_prompt = f"""Topic: {args.topic}
Draft {args.n} MCQs. Use only what is relevant from CONTEXT.

CONTEXT:
{ctx}
"""

    comp = cli.chat.completions.create(
        model=args.chat_deploy,
        temperature=args.temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role":"system", "content": SYSTEM_PROMPT},
            {"role":"user", "content": user_prompt}
        ]
    )

    content = comp.choices[0].message.content
    try:
        data = json.loads(content)
    except Exception:
        data = {"topic": args.topic, "raw": content, "questions": []}

    # Backfill refs if missing
    for q in data.get("questions", []):
        if not q.get("source_refs"):
            q["source_refs"] = refs

    # Persist
    insert_mcq_batch(args.subject, args.topic, data)

    # Write artifact
    os.makedirs("ops/data", exist_ok=True)
    out_path = f"ops/data/mcqs_{int(time.time())}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(out_path)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
