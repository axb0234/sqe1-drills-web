"""Retrieve context from local vector store and generate MCQs via Azure OpenAI (two resources: embeddings + chat),
with richer logging and optional topic inference (no --topic required)."""
from __future__ import annotations

import os, argparse, json, time, logging, sqlite3
from typing import List, Optional
from dotenv import load_dotenv
from openai import AzureOpenAI
import numpy as np

from vector_store import LocalVectorStore
from question_db import insert_mcq_batch

load_dotenv(".env.ai", override=True)

LOG_DIR = "ops/logs"
os.makedirs(LOG_DIR, exist_ok=True)

SYSTEM_PROMPT = """You are an SQE1 item writer.
Produce SINGLE-BEST-ANSWER multiple-choice questions (MCQs) in the exact structure:
1) A concise, realistic FACTUAL SCENARIO (sets the scene).
2) A QUESTION STEM that asks for the single best answer about the scenario.
3) FIVE OPTIONS, labelled A–E, where only ONE is the single best answer.
   - Each distractor must be plausible and differ by a subtle point of law (modal verbs,
     qualifiers, scope, or a misapplied test), not obviously wrong.
   - Avoid “All/None of the above”. Avoid trivia; focus on examinable rules.

Style and constraints (SQE1):
- UK terminology and authorities. No new facts beyond the scenario. No ambiguity.
- Scenario: ~40–120 words; no irrelevant detail. Stem: a single sentence.
- Options: short, parallel, legally precise. Exactly one correct.
- Output STRICT JSON (see schema below). Provide a 1–2 sentence rationale for the correct
  option and a 1–2 sentence rationale for EACH incorrect option explaining the precise error
  (wrong test, wrong standard, missing element, wrong outcome, etc.).

If the user topic is “INFER” or not supplied:
- Infer a concise, exam-relevant topic title (<= 60 chars) from the CONTEXT EXTRACTS.
- Set "topic" in the JSON to that inferred title.

JSON schema to return:
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
      "source_refs": ["<file#pN>", "..."]
    }
  ]
}

EXAMPLES (format + tone):

Example 1 (Criminal Law — Recklessness):
{
  "topic": "Battery: Recklessness (Subjective Test)",
  "questions": [
    {
      "stem": "Which option states the correct test for recklessness in battery on these facts?",
      "options": [
        "There must be a risk of force and a reasonable person would have foreseen it and taken it.",
        "There must be a risk of force and the defendant should have foreseen it and unjustifiably taken it.",
        "There must be a risk of force and the defendant actually foresaw that risk yet went on unreasonably to take it.",
        "There must be a risk of force that both the defendant and a reasonable person would have foreseen.",
        "There must be a risk of force, but foresight is unnecessary if the outcome occurs."
      ],
      "answer_index": 2,
      "rationale_correct": "Recklessness for battery is subjective: the defendant must actually appreciate a risk of applying unlawful force and nonetheless unreasonably take that risk on the facts.",
      "rationale_incorrect": {
        "A": "Imports a purely objective yardstick; subjective appreciation by the defendant is required.",
        "B": "Uses 'should' (objective). The test turns on the defendant’s actual foresight.",
        "C": "—",
        "D": "Combines subjective and objective elements; only the defendant’s foresight is essential.",
        "E": "Removes the foresight element altogether, which is incorrect."
      },
      "source_refs": ["intro_to_crim.pdf#p12"]
    }
  ]
}

Example 2 (Contract — Consideration: Part-payment of a debt):
{
  "topic": "Consideration: Part-Payment of a Debt",
  "questions": [
    {
      "stem": "A creditor agrees in writing to accept £8,000 now in full satisfaction of a due £10,000. No fresh benefit is provided. Which option is the best statement of the legal effect?",
      "options": [
        "The agreement is binding because practical benefits to the creditor are always sufficient consideration.",
        "The agreement is binding if made in writing, as written promises are enforceable without consideration.",
        "It is not binding absent fresh consideration; part-payment of a debt does not discharge the balance.",
        "It is binding because early payment is automatically good consideration.",
        "It is binding unless the debtor acted under economic duress."
      ],
      "answer_index": 2,
      "rationale_correct": "Part-payment alone does not discharge the balance without fresh consideration or a recognised exception; mere writing does not cure the lack of consideration.",
      "rationale_incorrect": {
        "A": "Practical benefit reasoning is not a blanket rule for debts; part-payment cases are treated differently.",
        "B": "A promise in writing still requires consideration unless made by deed or falling within a statutory exception.",
        "C": "—",
        "D": "Early payment can be good consideration only if genuinely earlier than due and bargained for; not automatic.",
        "E": "Duress concerns validity but does not supply consideration to bind the creditor to accept less."
      },
      "source_refs": ["contract_notes.pdf#p34"]
    }
  ]
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
    db_path = os.getenv("QUESTIONS_DB", "ops/data/questions.sqlite3")
    if not os.path.exists(db_path):
        return []
    try:
        cx = sqlite3.connect(db_path)
        cur = cx.execute("""
            SELECT DISTINCT q.topic
            FROM questions q
            JOIN subjects s ON s.id = q.subject_id
            WHERE s.name = ?
            ORDER BY q.topic
            LIMIT 50
        """, (subject,))
        topics = [r[0] for r in cur.fetchall() if r and r[0]]
        cx.close()
        return topics
    except Exception:
        return []

def build_context(store: LocalVectorStore, subject: str, cli_emb: AzureOpenAI,
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
        ctx_lines.append(f"[{i+1}] {h['source_path']}#p{h['page']}\n{snippet}")
        refs.append(f"{h['source_path']}#p{h['page']}")
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
    ap.add_argument("--debug", action="store_true", help="Enable verbose logging and save prompt/response.")
    args = ap.parse_args()

    # Logging setup
    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(levelname)s %(message)s"
    )

    cli_emb = embed_client()
    cli_chat = chat_client()
    store = LocalVectorStore()

    # 1) Retrieve context
    context, refs, _qvec = build_context(store, args.subject, cli_emb, args.top_k, args.topic, args.emb_deploy)

    # 2) Existing topics (hints)
    existing_topics = get_existing_topics(args.subject)
    hints_block = ""
    if existing_topics:
        hints_block = "Existing topics in DB (optional hints; choose a new one if appropriate):\n- " + "\n- ".join(existing_topics[:20])

    # 3) Build prompt
    requested_topic = args.topic if args.topic else "INFER"  # tells the model to infer if missing
    user_prompt = f"""Subject: {args.subject}
Topic: {requested_topic}
Draft {args.n} SINGLE-BEST-ANSWER MCQs following the structure and constraints. Use only what is relevant from CONTEXT EXTRACTS. If Topic is INFER, infer a concise, exam-relevant title from the extracts and set it in the JSON. 
If possible consider the existing topics in the DB and use one of those as a topic if it matches.

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
