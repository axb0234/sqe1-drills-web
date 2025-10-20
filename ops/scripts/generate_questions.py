"""Nightly question generation script using Azure OpenAI."""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Iterable, List

from openai import AzureOpenAI

if __package__ in (None, ""):
    import sys

    package_root = Path(__file__).resolve().parent.parent
    if str(package_root) not in sys.path:
        sys.path.append(str(package_root))
    from scripts.question_db import Choice, QuestionDatabase  # type: ignore
    from scripts.vector_store import VectorStore, chunks_to_json  # type: ignore
else:
    from .question_db import Choice, QuestionDatabase
    from .vector_store import VectorStore, chunks_to_json


logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are an expert legal educator creating multiple-choice questions for the SQE1 exam.
Follow the SQE1 format strictly: each question must have exactly five answer choices (A-E) and one correct choice.
Write questions that are challenging, scenario-based, and reflect UK law terminology.
Provide concise explanations for why the correct answer is correct and why each incorrect answer is wrong.
Avoid duplicating any question stems already provided.
Return your result as strict JSON matching this schema:
{
  "question": "<question stem>",
  "choices": [
    {"label": "A", "text": "<answer text>", "explanation": "<explain>"},
    {"label": "B", "text": "<answer text>", "explanation": "<explain>"},
    {"label": "C", "text": "<answer text>", "explanation": "<explain>"},
    {"label": "D", "text": "<answer text>", "explanation": "<explain>"},
    {"label": "E", "text": "<answer text>", "explanation": "<explain>"}
  ],
  "correct_answer": "<label of correct answer>",
  "difficulty": "medium | hard",
  "topic": "<topic summary>"
}
Do not include markdown. Ensure explanations mention the relevant legal principles.
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("subject", help="Subject name to generate questions for")
    parser.add_argument(
        "--test-name",
        default="SQE1",
        help="Name of the test (defaults to SQE1)",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("ops/data/questions.db"),
        help="Path to the SQLite question database",
    )
    parser.add_argument(
        "--vector-db",
        type=Path,
        default=Path("ops/data/vector_store.db"),
        help="Path to the vector store database",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=10,
        help="Number of questions to generate",
    )
    parser.add_argument(
        "--azure-endpoint",
        default=None,
        help="Azure OpenAI endpoint (overrides AZURE_OPENAI_ENDPOINT)",
    )
    parser.add_argument(
        "--azure-deployment",
        default=None,
        help="Azure OpenAI deployment name (overrides AZURE_OPENAI_DEPLOYMENT)",
    )
    parser.add_argument(
        "--azure-api-key",
        default=None,
        help="Azure OpenAI API key (overrides AZURE_OPENAI_KEY)",
    )
    parser.add_argument(
        "--azure-api-version",
        default=None,
        help="Azure OpenAI API version (overrides AZURE_OPENAI_API_VERSION)",
    )
    parser.add_argument(
        "--context-chunks",
        type=int,
        default=3,
        help="How many random chunks to include as context",
    )
    parser.add_argument(
        "--max-attempts",
        type=int,
        default=30,
        help="Maximum attempts to satisfy the requested question count",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return parser


def build_client(args: argparse.Namespace) -> tuple[AzureOpenAI, str]:
    endpoint = args.azure_endpoint or getenv_required("AZURE_OPENAI_ENDPOINT")
    api_key = args.azure_api_key or getenv_required("AZURE_OPENAI_KEY")
    deployment = args.azure_deployment or getenv_required("AZURE_OPENAI_DEPLOYMENT")
    api_version = args.azure_api_version or getenv_required("AZURE_OPENAI_API_VERSION")

    client = AzureOpenAI(
        azure_endpoint=endpoint,
        api_key=api_key,
        api_version=api_version,
    )
    return client, deployment


def getenv_required(name: str) -> str:
    import os

    value = os.getenv(name)
    if not value:
        raise SystemExit(f"Environment variable {name} is required")
    return value


def select_context_chunks(store: VectorStore, subject: str, count: int) -> List[dict]:
    chunks = store.random_subject_chunks(subject, count)
    return chunks_to_json(chunks)


def build_messages(existing_questions: List[str], context_chunks: List[dict], subject: str) -> List[dict]:
    user_prompt = {
        "role": "user",
        "content": json.dumps(
            {
                "subject": subject,
                "context": context_chunks,
                "existing_questions": existing_questions,
            },
            ensure_ascii=False,
        ),
    }
    return [
        {"role": "system", "content": SYSTEM_PROMPT.strip()},
        user_prompt,
    ]


def parse_response(content: str) -> dict:
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model returned invalid JSON: {exc}\n{content}") from exc


def validate_payload(payload: dict) -> dict:
    if "question" not in payload or not payload["question"].strip():
        raise ValueError("Missing question text")
    choices = payload.get("choices")
    if not isinstance(choices, list) or len(choices) != 5:
        raise ValueError("Expected five choices")
    correct = payload.get("correct_answer")
    if correct not in {"A", "B", "C", "D", "E"}:
        raise ValueError("Correct answer must be one of A-E")
    labels = {choice.get("label") for choice in choices}
    if labels != {"A", "B", "C", "D", "E"}:
        raise ValueError("Choices must include labels A-E exactly once")
    explanations_missing = [c for c in choices if not c.get("explanation")]
    if explanations_missing:
        raise ValueError("All choices must include explanations")
    return payload


def to_choice_objects(payload: dict) -> List[Choice]:
    correct_label = payload["correct_answer"]
    choices = []
    for choice in payload["choices"]:
        label = choice["label"]
        choices.append(
            Choice(
                label=label,
                text=choice["text"],
                explanation=choice["explanation"],
                is_correct=(label == correct_label),
            )
        )
    return choices


def generate_questions(args: argparse.Namespace) -> None:
    logging.basicConfig(level=getattr(logging, args.log_level))
    db = QuestionDatabase(args.db_path)
    store = VectorStore(args.vector_db)
    client, deployment_name = build_client(args)
    subject_id = db.ensure_subject(args.test_name, args.subject)
    existing_questions = db.get_recent_question_texts(subject_id, limit=60)

    created = 0
    attempts = 0
    while created < args.count and attempts < args.max_attempts:
        attempts += 1
        context_chunks = select_context_chunks(store, args.subject, args.context_chunks)
        if not context_chunks:
            raise SystemExit(
                f"No vectorized content found for subject '{args.subject}'. Run vectorize_pdfs.py first."
            )
        messages = build_messages(existing_questions, context_chunks, args.subject)
        response = client.chat.completions.create(
            model=deployment_name,
            temperature=0.7,
            max_tokens=900,
            messages=messages,
        )
        choice_message = response.choices[0].message
        payload = validate_payload(parse_response(choice_message.content))
        question_text = payload["question"].strip()
        if db.question_exists(question_text):
            logger.info("Duplicate question detected; requesting another")
            continue
        choice_objects = to_choice_objects(payload)
        question_id = db.insert_question(subject_id, question_text, choice_objects)
        existing_questions.append(question_text)
        if len(existing_questions) > 60:
            existing_questions = existing_questions[-60:]
        created += 1
        logger.info("Created question %s for subject %s", question_id, args.subject)

    if created < args.count:
        logger.warning(
            "Requested %d questions but created %d (after %d attempts)",
            args.count,
            created,
            attempts,
        )
    else:
        logger.info("Successfully created %d questions", created)


def main(argv: Iterable[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    generate_questions(args)


if __name__ == "__main__":
    main()
