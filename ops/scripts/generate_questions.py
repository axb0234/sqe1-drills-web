# ops/scripts/generate_questions.py
"""Retrieve topics (if needed), pull rotating context per topic from Qdrant,
and generate ONE MCQ per call with Azure OpenAI, saving each to Postgres.
Implements 80/20 scenario/recall mix, per-call logging (prompts/responses),
and distinction-level rationales (cite cases when present in context).
"""
from __future__ import annotations

import os, argparse, json, time, logging, math, itertools, hashlib
from typing import Dict, List, Optional, Tuple
from dotenv import load_dotenv
import numpy as np
from openai import AzureOpenAI

from vector_store import QdrantVectorStore
from question_db import insert_mcq_batch, list_subject_topics

load_dotenv(".env.ai", override=True)

LOG_DIR = "ops/logs"
os.makedirs(LOG_DIR, exist_ok=True)

# --------- PROMPTS -----------------------------------------------------------

TOPIC_DISCOVERY_SYSTEM = """You are an SQE1 syllabus analyst for <SUBJECT>.
Return a granular set of examinable TOPICS (concise, ≤60 chars each), suitable as tags for item-writing.
Focus on core black-letter law, leading cases/principles, common pitfalls, and high-yield doctrines.
Output strict JSON: {"topics": ["<t1>","<t2>", "..."]}"""

TOPIC_DISCOVERY_USER = """Subject: {subject}
Existing topic hints (optional, reuse exact text if it’s a good fit):
{hints_list}

Rules:
- Prefer granular, exam-ready topics (not whole workshop headings).
- Avoid duplicates/near-duplicates. 20–40 topics is typical for a major subject.
- Use UK terminology.

Return strictly:
{"topics": ["..."]}"""

# --- System prompts (per question) with one-shot examples and stricter rationale guidance ---

SINGLE_Q_SYSTEM_SCENARIO = """You are an SQE1 item writer.

GOAL
- Produce ONE SINGLE-BEST-ANSWER MCQ of type qtype="scenario".
- Use only the CONTEXT EXTRACTS; do not invent new facts beyond your vignette.

STRUCTURE
- Start the stem with a realistic 40–120 word vignette (only material facts), then the question sentence.
- Exactly FIVE options A–E; exactly ONE is the single best answer.
- Distractors must be plausible and fail by a precise point (missing element, wrong test/scope, modal nuance).

STYLE & RATIONALES (distinction level)
- UK terminology and authorities only.
- Rationales must be detailed and explanatory:
  • Correct option: 2–4 sentences, tie to the rule/test and (where present in CONTEXT) cite leading authority by case name and neutral citation.
  • Incorrect options A–E: 1–2 sentences each, state the precise legal error.
  • If CONTEXT does not contain any case names/citations, explain the principle precisely without inventing citations.
  • Never fabricate cases or citations.

OUTPUT (strict JSON):
{
  "topic": "<string>",
  "questions": [{
    "qtype": "scenario",
    "stem": "<string>",
    "options": ["<A>","<B>","<C>","<D>","<E>"],
    "answer_index": <0-4>,
    "rationale_correct": "<string>",
    "rationale_incorrect": {"A":"<why>","B":"<why>","C":"<why>","D":"<why>","E":"<why>"},
    "source_refs": ["<file#pN>", "..."]
  }]
}

One-shot EXAMPLE (abbreviated JSON):
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
    "rationale_incorrect": {
      "A":"Purely objective standard.",
      "B":"'Should' is objective; foresight must be actual.",
      "C":"—",
      "D":"Adds an unnecessary objective limb.",
      "E":"Eliminates foresight entirely."
    },
    "source_refs": ["intro_to_crim.pdf#p12"]
  }]
}
"""

SINGLE_Q_SYSTEM_RECALL = """You are an SQE1 item writer.

GOAL
- Produce ONE SINGLE-BEST-ANSWER MCQ of type qtype="recall".
- Test a black-letter rule/definition/elements with precision using only the CONTEXT EXTRACTS.

STRUCTURE
- No vignette. A single sentence stem that asks the legal rule/elements directly.
- Exactly FIVE options A–E; exactly ONE is the single best answer.
- Distractors must be plausible and fail by a precise point.

STYLE & RATIONALES (distinction level)
- UK terminology and authorities only.
- Rationales must be detailed and explanatory:
  • Correct option: 2–4 sentences, tie to the rule/test and (where present in CONTEXT) cite leading authority by case name and neutral citation.
  • Incorrect options A–E: 1–2 sentences each, state the precise legal error.
  • If CONTEXT lacks case names/citations, explain the principle precisely without inventing citations.
  • Never fabricate cases or citations.

OUTPUT (strict JSON):
{
  "topic": "<string>",
  "questions": [{
    "qtype": "recall",
    "stem": "<string>",
    "options": ["<A>","<B>","<C>","<D>","<E>"],
    "answer_index": <0-4>,
    "rationale_correct": "<string>",
    "rationale_incorrect": {"A":"<why>","B":"<why>","C":"<why>","D":"<why>","E":"<why>"},
    "source_refs": ["<file#pN>", "..."]
  }]
}

One-shot EXAMPLE (abbreviated JSON):
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
    "rationale_incorrect": {
      "A":"Writing alone is insufficient absent deed/statute.",
      "B":"—",
      "C":"Not a blanket rule for debt cases.",
      "D":"Only if genuinely earlier/bargained for.",
      "E":"Duress affects validity, not consideration."
    },
    "source_refs": ["contract_notes.pdf#p34"]
  }]
}
"""

SINGLE_Q_USER_FMT = """Subject: {subject}
Topic: {topic}
Required qtype: {qtype}   # Produce exactly ONE item of this type.

CONTEXT EXTRACTS (use only what's relevant; cite as source_refs):
{context}

Rules:
- Generate exactly ONE item in the JSON format specified by the system message.
- Make it distinct from previously generated items on this topic (avoid reusing phrasing).
"""

# --------- CLIENTS -----------------------------------------------------------

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

# --------- TOPIC DISCOVERY ---------------------------------------------------

def infer_topics(cli_chat: AzureOpenAI, subject: str, hints: List[str], chat_deploy: str, max_topics: int) -> List[str]:
    hints_block = "- " + "\n- ".join(hints[:40]) if hints else "(none)"
    messages = [
        {"role": "system", "content": TOPIC_DISCOVERY_SYSTEM},
        {"role": "user", "content": TOPIC_DISCOVERY_USER.format(subject=subject, hints_list=hints_block)},
    ]
    comp = cli_chat.chat.completions.create(
        model=chat_deploy,
        temperature=0.1,
        response_format={"type": "json_object"},
        messages=messages,
    )
    try:
        payload = json.loads(comp.choices[0].message.content or "{}")
        topics = [t.strip() for t in payload.get("topics", []) if t and isinstance(t, str)]
    except Exception:
        logging.warning("Topic inference returned non-JSON; falling back to empty list.")
        topics = []
    # De-dup (casefold) and cap
    seen, out = set(), []
    for t in topics:
        k = t.casefold()
        if k not in seen:
            seen.add(k); out.append(t)
        if len(out) >= max_topics:
            break
    return out

# --------- CONTEXT RETRIEVAL (ROTATING) -------------------------------------

def embed_query(cli_emb: AzureOpenAI, emb_deploy: str, text: str) -> np.ndarray:
    vec = cli_emb.embeddings.create(model=emb_deploy, input=[text]).data[0].embedding
    return np.asarray(vec, dtype=np.float32)

def fetch_pool(store: QdrantVectorStore, subject: str, topic: str, qvec: np.ndarray, per_question: int, need_questions: int) -> List[Dict]:
    """Pull a pool so we can slice unique bundles per question without reuse."""
    pool_size = max(24, min(800, int(math.ceil(per_question * need_questions * 1.2))))
    hits = store.search(subject, qvec, top_k=pool_size) or []
    return hits

def bundle_context(hits: List[Dict], used_keys: set, per_question: int) -> Tuple[str, List[str], List[str]]:
    """
    Slice the next per_question unique items from hits, skipping any we've used.
    Returns (context_str, refs, keys_used_now).
    """
    selected, keys_now = [], []
    for h in hits:
        src = h.get("source_path") or "material"
        page = h.get("page")
        cidx = h.get("chunk_index", None)
        key = f"{src}#p{page}|{cidx}"
        if key in used_keys:
            continue
        txt = (h.get("text") or "").strip()
        if not txt:
            continue
        selected.append((src, page, cidx, txt))
        keys_now.append(key)
        if len(selected) >= per_question:
            break

    if not selected:
        return ("", [], [])

    ctx_lines, refs = [], []
    for i, (src, page, _cidx, txt) in enumerate(selected):
        page_fragment = f"p{page}" if page is not None else "p?"
        snippet = txt[:1200]
        ctx_lines.append(f"[{i+1}] {src}#{page_fragment}\n{snippet}")
        refs.append(f"{src}#{page_fragment}")
    return ("\n\n".join(ctx_lines), refs, keys_now)

# --------- DEDUP HELPERS -----------------------------------------------------

def stem_fingerprint(stem: str) -> str:
    s = " ".join(stem.split()).casefold()
    return hashlib.sha1(s.encode("utf-8")).hexdigest()

# --------- MAIN PIPELINE -----------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Generate SQE1 MCQs (topic-driven, one-per-call, rotating context, 80/20 mix)")
    ap.add_argument("--subject", required=True, help="e.g., 'Contract Law'")
    ap.add_argument("--topic", required=False, help="If omitted, we infer granular topics and round-robin them.")
    ap.add_argument("--n", type=int, default=5, help="Total number of questions to generate")
    ap.add_argument("--per-context", type=int, default=12, help="Context snippets per question (bundle size)")
    ap.add_argument("--max-topics", type=int, default=24, help="Cap on inferred topics when --topic not provided")
    ap.add_argument("--temperature", type=float, default=0.2)
    ap.add_argument("--chat-deploy", default=os.getenv("AOAI_CHAT_DEPLOYMENT", "mcqgenerate"))
    ap.add_argument("--emb-deploy", default=os.getenv("AOAI_EMBEDDINGS_DEPLOYMENT", "embed-sqe"))
    ap.add_argument("--collection", default=os.getenv("QDRANT_COLLECTION"),
                    help="Override Qdrant collection name (defaults to env or 'sqe1_material').")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.debug else logging.INFO, format="%(levelname)s %(message)s")

    cli_emb = embed_client()
    cli_chat = chat_client()
    store = QdrantVectorStore(collection=args.collection or os.getenv("QDRANT_COLLECTION", "sqe1_material"))

    subject = args.subject
    total_needed = max(1, args.n)

    # 0) Topics
    if args.topic:
        topics = [args.topic]
    else:
        try:
            hints = list_subject_topics(subject)
        except Exception:
            logging.exception("Failed to load existing topic hints; continuing without.")
            hints = []
        topics = infer_topics(cli_chat, subject, hints, args.chat_deploy, args.max_topics)
        if not topics:
            topics = ["Core doctrines and leading cases"]
        logging.info("Using %d topics (round-robin): %s", len(topics), ", ".join(topics[:10]) + ("..." if len(topics) > 10 else ""))

    # 1) Prepare per-topic pools and pointers
    per_topic_target = max(1, math.ceil(total_needed / len(topics)))
    qvec_by_topic: Dict[str, np.ndarray] = {}
    pool_by_topic: Dict[str, List[Dict]] = {}
    idx_by_topic: Dict[str, int] = {t: 0 for t in topics}
    used_keys_global: set = set()
    seen_stems: set = set()

    for t in topics:
        qvec = embed_query(cli_emb, args.emb_deploy, t)
        qvec_by_topic[t] = qvec
        pool_by_topic[t] = fetch_pool(store, subject, t, qvec, args.per_context, per_topic_target)

    # 2) Generate one question per call, cycling topics, enforcing 80/20 qtype mix
    scenario_count = 0
    recall_count = 0
    all_items: List[Dict] = []
    round_robin = itertools.cycle(topics)
    made = 0
    attempt_guard = 0
    MAX_ATTEMPTS = total_needed * 6  # safety

    while made < total_needed and attempt_guard < MAX_ATTEMPTS:
        attempt_guard += 1
        topic = next(round_robin)

        # qtype selection: aim for 80% scenario overall
        desired_scenarios_by_now = round((made + 1) * 0.8)
        qtype = "scenario" if scenario_count < desired_scenarios_by_now else "recall"

        # Ensure we have enough unseen context for this topic; if not, top up pool
        hits = pool_by_topic[topic]
        slice_hits = hits[idx_by_topic[topic]:] + hits[:idx_by_topic[topic]]  # rotate view
        ctx, refs, used_now = bundle_context(slice_hits, used_keys_global, args.per_context)

        if not ctx:
            # Top-up: fetch a fresh pool with a jittered seed
            jittered = f"{topic} — exceptions, contrasts, leading authorities"
            qvec_by_topic[topic] = embed_query(cli_emb, args.emb_deploy, jittered)
            pool_by_topic[topic] = fetch_pool(store, subject, topic, qvec_by_topic[topic], args.per_context, per_topic_target)
            idx_by_topic[topic] = 0
            hits = pool_by_topic[topic]
            ctx, refs, used_now = bundle_context(hits, used_keys_global, args.per_context)
            if not ctx:
                logging.warning("No context available for topic '%s'; skipping this turn.", topic)
                continue

        # Build prompt + write artifacts (per-call)
        ts = int(time.time() * 1000)
        sys_prompt = SINGLE_Q_SYSTEM_SCENARIO if qtype == "scenario" else SINGLE_Q_SYSTEM_RECALL
        user_prompt = SINGLE_Q_USER_FMT.format(subject=subject, topic=topic, qtype=qtype, context=ctx)

        # Save plaintext prompt
        prompt_path = os.path.join(LOG_DIR, f"prompt_{topic}_{qtype}_{ts}.txt")
        with open(prompt_path, "w", encoding="utf-8") as f:
            f.write("---- SYSTEM ----\n")
            f.write(sys_prompt.strip() + "\n\n")
            f.write("---- USER ----\n")
            f.write(user_prompt)

        # Save full messages JSON
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt},
        ]
        messages_path = os.path.join(LOG_DIR, f"messages_{topic}_{qtype}_{ts}.json")
        with open(messages_path, "w", encoding="utf-8") as f:
            json.dump(messages, f, ensure_ascii=False, indent=2)

        # 3) ONE question call
        logging.info("Calling chat model for ONE item | topic='%s' | qtype=%s", topic, qtype)
        comp = cli_chat.chat.completions.create(
            model=args.chat_deploy,
            temperature=args.temperature,
            response_format={"type": "json_object"},
            messages=messages,
        )
        content = comp.choices[0].message.content

        # Save raw response JSON/text
        response_path = os.path.join(LOG_DIR, f"response_{topic}_{qtype}_{ts}.json")
        with open(response_path, "w", encoding="utf-8") as f:
            try:
                json.dump(json.loads(content), f, ensure_ascii=False, indent=2)
            except Exception:
                f.write(content)

        # 4) Parse, fill refs if needed, dedupe, save to DB
        try:
            data = json.loads(content)
        except Exception:
            logging.warning("Non-JSON response; skipping this attempt.")
            used_keys_global.update(used_now)
            idx_by_topic[topic] += len(used_now)
            continue

        qs = data.get("questions") or []
        if not qs:
            used_keys_global.update(used_now)
            idx_by_topic[topic] += len(used_now)
            continue

        q = qs[0]
        if not q.get("source_refs"):
            q["source_refs"] = refs

        # De-dup by stem fingerprint
        fp = stem_fingerprint(q.get("stem", ""))
        if fp in seen_stems:
            logging.info("Duplicate/near-duplicate stem; will try fresh context next turn.")
            used_keys_global.update(used_now)
            idx_by_topic[topic] += len(used_now)
            continue

        # Persist this single item
        out_payload = {"topic": data.get("topic") or topic, "questions": [q]}
        insert_mcq_batch(subject, out_payload["topic"], out_payload)

        # Advance bookkeeping
        seen_stems.add(fp)
        used_keys_global.update(used_now)
        idx_by_topic[topic] += len(used_now)
        made += 1
        if qtype == "scenario":
            scenario_count += 1
        else:
            recall_count += 1

        logging.info("Saved Q%02d/%02d | topic='%s' | qtype=%s", made, total_needed, out_payload["topic"], qtype)
        logging.debug("Artifacts:\n  Prompt:   %s\n  Messages: %s\n  Response: %s", prompt_path, messages_path, response_path)

    # 5) Write an aggregate artifact for quick review (optional)
    os.makedirs("ops/data", exist_ok=True)
    ts_all = int(time.time())
    out_path = f"ops/data/mcqs_{subject}_{ts_all}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"subject": subject, "generated": made, "mix": {"scenario": scenario_count, "recall": recall_count}}, f, ensure_ascii=False, indent=2)

    print(out_path)
    logging.info("Done. Generated %d/%d questions (scenario=%d, recall=%d). Artifact: %s",
                 made, total_needed, scenario_count, recall_count, out_path)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
