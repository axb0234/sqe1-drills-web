# SQE1 Automation Scripts

This directory contains Python utilities that support the nightly SQE1 MCQ generation pipeline.

## Overview

| Script | Purpose |
| --- | --- |
| `vectorize_pdfs.py` | Vectorises subject PDF files into an on-disk vector store (SQLite + NumPy embeddings). |
| `generate_questions.py` | Calls Azure OpenAI to create SQE1-style MCQs using the vectorised material as context and saves them into the local question bank database. |

Supporting modules:

* `question_db.py` — schema helpers for the SQLite question bank (`tests`, `subjects`, `questions`, `choices`). The `questions`
  table also tracks an `is_active` flag so individual questions can be retired without deletion.
* `vector_store.py` — wrapper around the embedding store that keeps chunk metadata per subject.

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

* `openai` — Azure OpenAI Chat Completions client.
* `sentence-transformers` — generates dense embeddings for PDF chunks.
* `pypdf` — extracts text from PDF files.
* `numpy` — stores embeddings and performs vector operations.

These are listed in `ops/scripts/requirements.txt` for convenience.

## Vectorising PDFs

Run the vectorisation script whenever PDFs are added or updated for a subject. The script calculates a checksum for each PDF and re-embeds it only when the file changes.

```bash
source ~/.venvs/sqe1/bin/activate
python ops/scripts/vectorize_pdfs.py "Criminal" /srv/sqe1prep/content/Criminal ops/data/vector_store.db \
  --model sentence-transformers/all-MiniLM-L6-v2 --chunk-size 180 --overlap 40
```

* `subject` — label stored in the vector DB (matches the subject name in the question bank).
* `pdf_dir` — directory containing PDFs for that subject.
* `vector_db` — path to the SQLite-backed embedding store (created automatically if missing).

The script emits INFO logs summarising how many chunks were generated per PDF.

### Incremental Updates

Checksums and chunk counts are stored in the `files` table. If a PDF is unchanged since the last run, the stored embeddings are reused. New or modified PDFs replace their previous chunk entries automatically.

## Generating Questions

Schedule the nightly job with `cron` (or another scheduler) after PDFs have been vectorised. Example invocation:

```bash
source ~/.venvs/sqe1/bin/activate
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
export AZURE_OPENAI_KEY="<api-key>"
export AZURE_OPENAI_DEPLOYMENT="gpt-4o"
export AZURE_OPENAI_API_VERSION="2024-02-01"
python ops/scripts/generate_questions.py "Criminal" \
  --db-path ops/data/questions.db \
  --vector-db ops/data/vector_store.db \
  --count 20 \
  --context-chunks 4
```

Key behaviours:

* Ensures the `SQE1` test and the specified subject exist in the SQLite database.
* Pulls recent question stems for the subject and instructs Azure OpenAI not to duplicate them.
* Selects random context chunks from the vector store to ground each question.
* Parses the model’s JSON response, validates the shape, enforces five answer options and per-choice explanations, and stores the result.
* Skips duplicates by hashing the question stem before insertion.

If fewer than the requested questions can be generated (because of duplicate responses or API issues), the script logs a warning with the number actually created.

## Database Files

* `ops/data/vector_store.db` — stores embeddings per subject/PDF.
* `ops/data/questions.db` — stores the MCQ bank (`tests`, `subjects`, `questions`, `choices`).

Create regular backups of these SQLite files as part of your ops process.

### Retiring Questions

To hide a question from the drill UI without deleting it, update its `is_active` flag:

```bash
sqlite3 ops/data/questions.db <<'SQL'
UPDATE questions SET is_active = 0 WHERE id = <question_id>;
SQL
```

Setting the flag back to `1` re-enables the question. New insertions default to `is_active = 1`.

## Cron Example

Add an entry similar to the following (adjust paths/user as needed):

```
0 2 * * * . $HOME/.venvs/sqe1/bin/activate && cd /srv/sqe1prep/app && \
  export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com" && \
  export AZURE_OPENAI_KEY="<api-key>" && \
  export AZURE_OPENAI_DEPLOYMENT="gpt-4o" && \
  export AZURE_OPENAI_API_VERSION="2024-02-01" && \
  python ops/scripts/generate_questions.py "Criminal" --count 25 --context-chunks 5 >> $HOME/logs/sqe1_cron.log 2>&1
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
