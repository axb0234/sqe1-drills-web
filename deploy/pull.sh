#!/usr/bin/env bash
set -euo pipefail
cd /srv/sqe1prep/app
git pull --ff-only
docker compose --project-name sqe1prep -f docker-compose.yml up -d --build web
docker compose --project-name sqe1prep exec caddy caddy reload --config /etc/caddy/Caddyfile || true
echo "Deploy complete."