#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# Configuration section
# Fill in the Azure OpenAI credentials before running.
# ------------------------------------------------------------
export AZURE_OPENAI_ENDPOINT="${AZURE_OPENAI_ENDPOINT:-https://your-azure-endpoint.openai.azure.com/}"
export AZURE_OPENAI_KEY="${AZURE_OPENAI_KEY:-replace-with-azure-openai-key}"
export AZURE_OPENAI_DEPLOYMENT="${AZURE_OPENAI_DEPLOYMENT:-gpt-4o-mini}"
export AZURE_OPENAI_API_VERSION="${AZURE_OPENAI_API_VERSION:-2024-02-15-preview}"

# Paths and runtime settings
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

SUBJECT_NAME="${SUBJECT_NAME:-Contract Law}"
PDF_DIRECTORY="${PDF_DIRECTORY:-$PROJECT_ROOT/ops/pdfs/contract}"
VECTOR_DB_PATH="${VECTOR_DB_PATH:-$PROJECT_ROOT/ops/data/vector_store.db}"
QUESTION_DB_PATH="${QUESTION_DB_PATH:-$PROJECT_ROOT/ops/data/questions.db}"

# Vectorisation parameters
SENTENCE_MODEL="${SENTENCE_MODEL:-sentence-transformers/all-MiniLM-L6-v2}"
CHUNK_SIZE="${CHUNK_SIZE:-180}"
CHUNK_OVERLAP="${CHUNK_OVERLAP:-40}"
VECTORISE_LOG_LEVEL="${VECTORISE_LOG_LEVEL:-INFO}"

# Question generation parameters
QUESTION_COUNT="${QUESTION_COUNT:-10}"
CONTEXT_CHUNKS="${CONTEXT_CHUNKS:-3}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"
GENERATE_LOG_LEVEL="${GENERATE_LOG_LEVEL:-INFO}"

usage() {
    cat <<USAGE
Usage: $0 <command>

Commands:
  vectorise   Vectorise PDFs for $SUBJECT_NAME into $VECTOR_DB_PATH
  generate    Generate questions for $SUBJECT_NAME into $QUESTION_DB_PATH

Override configuration by exporting environment variables before running.
USAGE
}

ensure_credentials() {
    local missing=0
    for var in AZURE_OPENAI_ENDPOINT AZURE_OPENAI_KEY AZURE_OPENAI_DEPLOYMENT AZURE_OPENAI_API_VERSION; do
        if [[ -z "${!var}" || "${!var}" == *"replace"* || "${!var}" == *"your-azure"* ]]; then
            echo "Missing or placeholder value for $var" >&2
            missing=1
        fi
    done
    if [[ $missing -eq 1 ]]; then
        echo "Update the Azure OpenAI credentials in sqeprep.sh or export them before running." >&2
        exit 1
    fi
}

run_vectorise() {
    mkdir -p "$(dirname "$VECTOR_DB_PATH")"
    if [[ ! -d "$PDF_DIRECTORY" ]]; then
        echo "PDF directory not found: $PDF_DIRECTORY" >&2
        exit 1
    fi
    "$PYTHON_BIN" "$PROJECT_ROOT/ops/scripts/vectorize_pdfs.py" \
        "$SUBJECT_NAME" \
        "$PDF_DIRECTORY" \
        "$VECTOR_DB_PATH" \
        --model "$SENTENCE_MODEL" \
        --chunk-size "$CHUNK_SIZE" \
        --overlap "$CHUNK_OVERLAP" \
        --log-level "$VECTORISE_LOG_LEVEL"
}

run_generate() {
    ensure_credentials
    mkdir -p "$(dirname "$QUESTION_DB_PATH")"
    mkdir -p "$(dirname "$VECTOR_DB_PATH")"
    "$PYTHON_BIN" "$PROJECT_ROOT/ops/scripts/generate_questions.py" \
        "$SUBJECT_NAME" \
        --db-path "$QUESTION_DB_PATH" \
        --vector-db "$VECTOR_DB_PATH" \
        --count "$QUESTION_COUNT" \
        --context-chunks "$CONTEXT_CHUNKS" \
        --max-attempts "$MAX_ATTEMPTS" \
        --log-level "$GENERATE_LOG_LEVEL"
}

command="${1:-}"
case "$command" in
    vectorise)
        run_vectorise
        ;;
    generate)
        run_generate
        ;;
    ""|-h|--help)
        usage
        ;;
    *)
        echo "Unknown command: $command" >&2
        usage >&2
        exit 1
        ;;
esac
