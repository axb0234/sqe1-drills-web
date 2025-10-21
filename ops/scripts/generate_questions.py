"""Retrieve context from Qdrant and generate MCQs via Azure OpenAI (two resources: embeddings + chat),
with richer logging and optional topic inference (no --topic required)."""
from __future__ import annotations

import os, argparse, json, time, logging
from typing import List, Optional
from dotenv import load_dotenv
from openai import AzureOpenAI
import numpy as np

from vector_store import QdrantVectorStore
from question_db import insert_mcq_batch, list_subject_topics

load_dotenv(".env.ai", override=True)

LOG_DIR = "ops/logs"
os.makedirs(LOG_DIR, exist_ok=True)

SYSTEM_PROMPT = """You are an SQE1 item writer.

GOAL
- Produce SINGLE-BEST-ANSWER MCQs in two types:
  1) SCENARIO-APPLICATION (case vignette + legal application)  ← target ≈80%
  2) FACTUAL-RECALL (black-letter rule/definition/element)     ← target ≈20%

TOPIC SELECTION (with hints)
- You may be given a list of EXISTING TOPIC HINTS (aliases/labels already used in the DB).
- If one hint closely matches the CONTEXT EXTRACTS, use that hint EXACTLY as the "topic".
- If none fits well, infer a concise, exam-relevant topic title (≤ 60 chars) from the CONTEXT EXTRACTS.
- Never force a hint that doesn’t match. Accuracy over reuse.

STRUCTURE (for EVERY item)
1) A concise, realistic FACTUAL SCENARIO when qtype="scenario" (≈40–120 words, only material facts).
2) A QUESTION STEM: one sentence asking for the single best answer.
3) FIVE OPTIONS A–E: short, parallel, legally precise.
   - Exactly ONE is the single best answer.
   - Distractors are plausible and differ by a subtle point of law (modal verbs, scope,
     missing element, wrong test, misapplied standard). Avoid “All/None of the above”.

STYLE / GUARDRAILS
- Use UK terminology and authorities. No new facts beyond the scenario. No ambiguity.
- Provide rationales: 1–2 sentences for the correct option and 1–2 sentences for EACH incorrect option,
  explicitly stating the precise error.

OUTPUT: STRICT JSON (extra field "qtype" is REQUIRED)
{
  "topic": "<string>",
  "questions": [
    {
      "qtype": "scenario" | "recall",
      "stem": "<string>",                # include scenario text at the start when qtype="scenario"
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
      "source_refs": ["<file#pN>", "..."]
    }
  ]
}

EXAMPLES (abbreviated)

Example A — SCENARIO-APPLICATION (Criminal: Recklessness)
{
  "topic": "Battery: Recklessness (Subjective Test)",
  "questions": [{
    "qtype": "scenario",
    "stem": "A woman throws a small rock to scare a passer-by; it grazes their head without injury. She denies intending contact. Prosecutors allege recklessness. Which statement is the correct legal test for recklessness in battery on these facts?",
    "options": [
      "Risk judged by a reasonable person is sufficient.",
      "She should have foreseen the risk and took it.",
      "She actually foresaw a risk of unlawful force yet unreasonably took it.",
      "Both she and a reasonable person must have foreseen the risk.",
      "Foresight is unnecessary if contact occurs."
    ],
    "answer_index": 2,
    "rationale_correct": "The test is subjective: the defendant must actually appreciate the risk and proceed unreasonably.",
    "rationale_incorrect": {"A":"Purely objective standard.","B":"'Should' is objective; foresight must be actual.","C":"—","D":"Adds an unnecessary objective limb.","E":"Eliminates foresight entirely."},
    "source_refs": ["intro_to_crim.pdf#p12"]
  }]
}

Example B — FACTUAL-RECALL (Contract: Part-payment of a debt)
{
  "topic": "Consideration: Part-payment of a Debt",
  "questions": [{
    "qtype": "recall",
    "stem": "Which statement best reflects the rule on part-payment of a debt?",
    "options": [
      "A part-payment agreement is binding if in writing.",
      "Part-payment alone does not discharge the balance absent fresh consideration or an exception.",
      "Practical benefit always suffices as consideration for debts.",
      "Early payment automatically provides good consideration.",
      "It is binding unless the creditor acts under duress."
    ],
    "answer_index": 1,
    "rationale_correct": "Part-payment without fresh consideration does not discharge the balance unless a recognised exception applies.",
    "rationale_incorrect": {"A":"Writing alone is insufficient absent deed/statute.","B":"—","C":"Not a blanket rule for debt cases.","D":"Only if genuinely earlier/bargained for.","E":"Duress affects validity, not consideration."},
    "source_refs": ["contract_notes.pdf#p34"]
  }]
}
"""



def embed_client() -> AzureOpenAI:
    return AzureOpenAI(
        api_key=os.environ["AOAI_EMBEDDINGS_KEY"],
        azure_endpoint=os.environ["AOAI_EMBEDDINGS_ENDPOINT"].rstrip("/"),
        api_version=os.getenv("AOAI_EMBEDDINGS_API_VERSION", "2024-12-01-preview"),
    )

def chat_client() -> AzureOpenAI:
    return AzureOpenAI(
        api_key=os.environ["AOAI_CHAT_KEY"],
        azure_endpoint=os.environ["AOAI_CHAT_ENDPOINT"].rstrip("/"),
        api_version=os.getenv("AOAI_CHAT_API_VERSION", "2025-01-01-preview"),
    )

def get_existing_topics(subject: str) -> List[str]:
    """Best-effort: read distinct topics already saved for this subject (if any)."""
    try:
        return list_subject_topics(subject)
    except Exception:
        logging.exception("Failed to load existing topics for subject=%s", subject)
        return []

def build_context(store: QdrantVectorStore, subject: str, cli_emb: AzureOpenAI,
                  top_k: int, topic: Optional[str], emb_deploy: str) -> tuple[str, List[str], np.ndarray]:
    """
    Returns (context_str, refs, query_vector).
    - If topic is provided: embed it and search.
    - If topic is None: create a generic subject seed query, embed, and search.
    """
    if topic:
        query_text = topic
        logging.info("Using provided topic for retrieval: %s", topic)
    else:
        query_text = f"{subject} — core examinable rules, definitions, leading cases, common pitfalls"
        logging.info("No topic provided; using inferred seed query: %s", query_text)

    qvec = cli_emb.embeddings.create(model=emb_deploy, input=[query_text]).data[0].embedding
    hits = store.search(subject, np.asarray(qvec, dtype=np.float32), top_k=top_k)

    if not hits:
        logging.warning("No context found in the store for subject=%s", subject)
        return ("No context found in the store for this subject.", [], np.asarray(qvec, dtype=np.float32))

    ctx_lines: List[str] = []
    refs: List[str] = []
    for i, h in enumerate(hits):
        snippet = (h.get("text") or "")[:1200]
        src = h.get("source_path") or "material"
        page = h.get("page")
        page_fragment = f"p{page}" if page is not None else "p?"
        ctx_lines.append(f"[{i+1}] {src}#{page_fragment}\n{snippet}")
        refs.append(f"{src}#{page_fragment}")
    context = "\n\n".join(ctx_lines)
    logging.info("Built context from %d hits.", len(hits))
    return (context, refs, np.asarray(qvec, dtype=np.float32))

def main():
    ap = argparse.ArgumentParser(description="Generate SQE1 MCQs using retrieved context")
    ap.add_argument("--subject", required=True, help="e.g., 'Contract Law'")
    ap.add_argument("--topic", required=False, help="If omitted, the model will infer a topic from context.")
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--top-k", type=int, default=12)
    ap.add_argument("--temperature", type=float, default=0.2)
    ap.add_argument("--chat-deploy", default=os.getenv("AOAI_CHAT_DEPLOYMENT", "mcqgenerate"))
    ap.add_argument("--emb-deploy", default=os.getenv("AOAI_EMBEDDINGS_DEPLOYMENT", "embed-sqe"))
    ap.add_argument(
        "--collection",
        default=os.getenv("QDRANT_COLLECTION"),
        help="Override Qdrant collection name (defaults to QDRANT_COLLECTION env or 'sqe1_material').",
    )
    ap.add_argument("--debug", action="store_true", help="Enable verbose logging and save prompt/response.")
    args = ap.parse_args()

    # Logging setup
    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(levelname)s %(message)s"
    )

    cli_emb = embed_client()
    cli_chat = chat_client()
    store = QdrantVectorStore(collection=args.collection or os.getenv("QDRANT_COLLECTION", "sqe1_material"))

    # 1) Retrieve context
    context, refs, _qvec = build_context(store, args.subject, cli_emb, args.top_k, args.topic, args.emb_deploy)

    # 2) Existing topics (hints)
    existing_topics = get_existing_topics(args.subject)
    hints_block = ""
    if existing_topics:
        hints_block = "EXISTING TOPIC HINTS (use exact text if a hint fits well):\n- " + "\n- ".join(existing_topics[:20])

    # 3) Build prompt
    requested_topic = args.topic if args.topic else "INFER"

    user_prompt = f"""Subject: {args.subject}
    Topic: {requested_topic}

    Produce exactly {args.n} SINGLE-BEST-ANSWER items with this mix:
    - SCENARIO-APPLICATION: ≈80%
    - FACTUAL-RECALL: ≈20%

    RULES
    - If Topic is INFER, first try to match one of the EXISTING TOPIC HINTS below to the CONTEXT EXTRACTS.
      If a hint matches closely, use that hint EXACTLY as the "topic".
      If none fits, infer a concise exam-relevant topic (≤ 60 chars) and use that.
    - For qtype="scenario", embed a 40–120 word realistic vignette at the start of the stem.
    - For qtype="recall", do not add a scenario; test the rule/elements cleanly.
    - Use only what is relevant from CONTEXT EXTRACTS. No new facts beyond the scenario.

    {hints_block}

    CONTEXT EXTRACTS:
    {context}
    """


    # Save prompt (for prompt-eng analysis)
    ts = int(time.time())
    prompt_path = os.path.join(LOG_DIR, f"prompt_{ts}.txt")
    with open(prompt_path, "w", encoding="utf-8") as f:
        f.write("---- SYSTEM ----\n")
        f.write(SYSTEM_PROMPT.strip() + "\n\n")
        f.write("---- USER ----\n")
        f.write(user_prompt)
    logging.info("Prompt written to %s", prompt_path)

    # 4) Call chat model
    logging.info("Calling chat model: deploy=%s, temp=%.2f", args.chat_deploy, args.temperature)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt}
    ]
    with open(os.path.join(LOG_DIR, f"messages_{ts}.json"), "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False, indent=2)

    
    comp = cli_chat.chat.completions.create(
        model=args.chat_deploy,
        temperature=args.temperature,
        response_format={"type": "json_object"},
        messages=messages,
    )

    content = comp.choices[0].message.content

    # Save raw response for inspection
    response_path = os.path.join(LOG_DIR, f"response_{ts}.json")
    with open(response_path, "w", encoding="utf-8") as f:
        try:
            json.dump(json.loads(content), f, ensure_ascii=False, indent=2)
        except Exception:
            # not valid JSON; save raw
            f.write(content)
    logging.info("Response written to %s", response_path)

    # 5) Parse and persist
    try:
        data = json.loads(content)
    except Exception:
        logging.warning("Response was not valid JSON; stored raw content. Falling back to empty questions.")
        data = {"topic": args.topic or "Inferred Topic", "raw": content, "questions": []}

    # Backfill refs if missing
    for q in data.get("questions", []):
        if not q.get("source_refs"):
            q["source_refs"] = refs

    topic_for_db = data.get("topic") or args.topic or "Inferred Topic"
    insert_mcq_batch(args.subject, topic_for_db, data)

    # 6) Write artifact for quick review
    os.makedirs("ops/data", exist_ok=True)
    out_path = f"ops/data/mcqs_{ts}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(out_path)
    logging.info("Done. Saved MCQs to %s", out_path)
    logging.info("Logs:\n  Prompt:   %s\n  Response: %s", prompt_path, response_path)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
