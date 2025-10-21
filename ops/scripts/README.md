# SQE1 Automation Scripts

This directory contains Python utilities that support the nightly SQE1 MCQ generation pipeline.

## Overview

| Script | Purpose |
| --- | --- |
| `vectorize_pdfs.py` | Vectorises subject PDF files and upserts embeddings into the shared Qdrant vector database. |
| `generate_questions.py` | Calls Azure OpenAI to create SQE1-style MCQs using retrieved context and stores them in the Postgres question bank. |

Supporting modules:

* `question_db.py` — helpers for creating and writing to the Postgres schema (`subjects`, `questions`, `choices`, `drill_sessions`, `drill_items`). Questions include an `is_active` flag so they can be retired without deletion.
* `vector_store.py` — thin wrapper around Qdrant that manages collection creation and search for subject-specific chunks.

## Python Environment

Create (or reuse) a Python 3.10+ virtual environment on the server and install the required libraries:

```bash
python3 -m venv ~/.venvs/sqe1
source ~/.venvs/sqe1/bin/activate
pip install --upgrade pip
pip install -r ops/scripts/requirements.txt
```

If you prefer not to use a virtual environment, add the `pip install` command directly in your provisioning script/cron job.

## Required Python Packages

The scripts rely on the following libraries:

* `openai` — Azure OpenAI Chat Completions + Embeddings clients.
* `pypdf` — extracts text from PDF files.
* `numpy` — stores embeddings and performs vector operations.
* `tiktoken` — token-aware chunking of long PDF pages.
* `tenacity` — retry helper for embedding requests.
* `psycopg` — Postgres driver used by `question_db.py`.
* `qdrant-client` — client library for the Qdrant vector database.
* `python-dotenv` — loads `.env.ai` with Azure credentials.

All dependencies are listed in `ops/scripts/requirements.txt`.

## Vectorising PDFs

Run the vectorisation script whenever PDFs are added or updated for a subject. Each chunk is written to Qdrant using a deterministic ID, so re-running the script overwrites stale entries automatically.

```bash
source ~/.venvs/sqe1/bin/activate
python ops/scripts/vectorize_pdfs.py \
  --subject "Criminal" \
  --pdfs-dir /srv/sqe1prep/content/Criminal \
  --max-tokens 180 \
  --overlap 40 \
  --collection sqe1_material
```

Key options:

* `--subject` — label stored in Qdrant (matches the subject name in the question bank).
* `--pdfs-dir` — directory containing PDFs for that subject.
* `--collection` — optional override; defaults to the `QDRANT_COLLECTION` environment variable or `sqe1_material`.
* `--emb-deploy` — Azure OpenAI embedding deployment name (defaults to `AOAI_EMBEDDINGS_DEPLOYMENT`).

Qdrant connectivity comes from environment variables:

* `QDRANT_URL` or (`QDRANT_HOST` + `QDRANT_PORT`) — endpoint of the cluster (on the server, `QDRANT_HOST=qdrant`, `QDRANT_PORT=6333`).
* `QDRANT_API_KEY` — only needed if auth is enabled (not required for the internal Docker network).

The script logs how many chunks were embedded per PDF.

## Generating Questions

Schedule the nightly job with `cron` (or another scheduler) after PDFs have been vectorised. Example invocation:

```bash
source ~/.venvs/sqe1/bin/activate
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
export AZURE_OPENAI_KEY="<api-key>"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
export AZURE_OPENAI_API_VERSION="2024-02-01"
python ops/scripts/generate_questions.py \
  --subject "Criminal" \
  --n 20 \
  --top-k 12 \
  --collection sqe1_material
```

Key behaviours:

* Ensures the required Postgres tables exist and upserts the subject row.
* Retrieves distinct existing topics for the subject to avoid duplication.
* Selects random context chunks from Qdrant to ground each question.
* Parses the model’s JSON response, enforces five options with per-choice rationales, and writes the results to Postgres (including JSON `source_refs`).
* Skips inserts gracefully if the response is invalid.

If fewer than the requested questions can be generated (because of duplicate responses or API issues), the script logs a warning with the number actually created.

## Datastores

* **Postgres (`sqe1` database, user `app`)** — persists subjects, questions, choices, drill sessions, and drill items. Configure access via `DATABASE_URL` or the `PG*`/`APP_DB_*` environment variables before running the scripts.
* **Qdrant** — stores embeddings for all subjects inside the `sqe1_material` collection (override with `QDRANT_COLLECTION`).

### Retiring Questions

To hide a question from the drill UI without deleting it, update its `is_active` flag in Postgres:

```bash
psql "$DATABASE_URL" <<'SQL'
UPDATE questions SET is_active = FALSE WHERE id = <question_id>;
SQL
```

Setting the flag back to `TRUE` re-enables the question. New insertions default to `TRUE`.

## Cron Example

Add an entry similar to the following (adjust paths/user as needed):

```
0 2 * * * . $HOME/.venvs/sqe1/bin/activate && cd /srv/sqe1prep/app && \
  export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com" && \
  export AZURE_OPENAI_KEY="<api-key>" && \
  export AZURE_OPENAI_DEPLOYMENT="gpt-4o" && \
  export AZURE_OPENAI_API_VERSION="2024-02-01" && \
  DATABASE_URL="postgresql://app:***@db:5432/sqe1" \
  python ops/scripts/generate_questions.py --subject "Criminal" --n 25 --top-k 12 >> $HOME/logs/sqe1_cron.log 2>&1
```

Run the vectorisation script manually (or on a separate schedule) whenever study materials change.

## Packaging the Scripts for Download

To hand off the latest automation code without pushing to Git yet, create a zip archive from the repo root:

```bash
zip -r sqe1-drill-scripts.zip ops/scripts
```

Transfer the archive to your workstation (for example with `scp` or by copying a base64 encoding) and extract it locally:

```bash
unzip sqe1-drill-scripts.zip -d sqe1-drills-scripts
```

You can then inspect the files, commit them to your own repository, or run the scripts directly from the extracted directory.
