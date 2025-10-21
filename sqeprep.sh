#!/usr/bin/env bash
set -euo pipefail

# --- venv settings ---
VENV_NAME="${VENV_NAME:-sqe1}"
VENV_DIR="${VENV_DIR:-$HOME/.venvs/$VENV_NAME}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$REPO_ROOT/ops/scripts"

# --- load Azure/OpenAI env (optional but recommended) ---
if [[ -f "$REPO_ROOT/.env.ai" ]]; then
  set -a; source "$REPO_ROOT/.env.ai"; set +a
fi

if [[ ! -d "$VENV_DIR" ]]; then
  echo "❌ venv not found at $VENV_DIR"
  echo "Create it:  python3 -m venv \"$VENV_DIR\" && source \"$VENV_DIR/bin/activate\" && pip install -U pip"
  exit 1
fi

# activate venv
# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

# install deps if needed
if ! python -c "import openai, numpy, pypdf, psycopg, qdrant_client" >/dev/null 2>&1; then
  pip install -r "$SCRIPTS_DIR/requirements.txt"
fi

export PYTHONPATH="$SCRIPTS_DIR"

usage() {
  cat <<'EOF'
Usage:
  ./sqeprep.sh vectorise --subject "Contract Law" --pdfs-dir "/path/to/pdfs" [--max-tokens 800 --overlap 120]
  ./sqeprep.sh generate  --subject "Contract Law" [--topic "Consideration" --n 5 --top-k 12 --temperature 0.2]

Relies on .env.ai for:
  AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AOAI_EMBEDDINGS_DEPLOYMENT, AOAI_CHAT_DEPLOYMENT
  DATABASE_URL or PG*/APP_DB_* vars for Postgres, QDRANT_* vars for the vector store
EOF
}

cmd="${1:-}"; shift || true
case "$cmd" in
  vectorise)
    python "$SCRIPTS_DIR/vectorize_pdfs.py" "$@"
    ;;
  generate)
    python "$SCRIPTS_DIR/generate_questions.py" "$@"
    ;;
  ""|-h|--help)
    usage;;
  *)
    echo "Unknown command: $cmd" >&2
    usage; exit 1;;
esac
