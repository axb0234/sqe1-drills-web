# SQE1 Drills — Web scaffold (Next.js + Bootstrap 5)

Minimal web UI for the SQE1 drills MVP. Pages:
- `/` Dashboard
- `/start`
- `/drill/[sid]`
- `/history`
- `/billing`

## Dev machine (Cursor/VS Code)
1) Install Node.js 20+ and Git.
2) `cd web && npm i`
3) `cp ../.env.example .env.local` (adjust values if needed).
4) `npm run dev` → http://localhost:3000

## Create GitHub repo & push (pick one)
Using GitHub CLI:
```bash
git init
git add .
git commit -m "Scaffold: SQE1 Drills web"
gh repo create sqe1-drills-web --private --source=. --remote=origin --push
```

Manual:
```bash
git init
git add .
git commit -m "Scaffold: SQE1 Drills web"
git remote add origin https://github.com/<you>/sqe1-drills-web.git
git branch -M main
git push -u origin main
```

## Server deploy (Docker + Caddy)
On the server:
```bash
sudo mkdir -p /srv/sqe1prep/app
cd /srv/sqe1prep/app
git clone https://github.com/<you>/sqe1-drills-web.git .
docker network create sqe1prep_default || true
docker compose --project-name sqe1prep -f docker-compose.yml up -d --build web
```
Append `ops/Caddyfile.addon` to `/srv/sqe1prep/ops/Caddyfile`, then reload Caddy:
```bash
docker compose --project-name sqe1prep exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Pull latest on demand
On your dev box:
```bash
git push origin main
```
On the server:
```bash
/srv/sqe1prep/app/deploy/pull.sh
```

> Tip: commit `web/package-lock.json` so Docker can use `npm ci` for reproducible builds.

## Where to tweak the UI
- Navbar/KPIs: `web/components/*`
- Dashboard: `web/app/page.tsx`
- Start form: `web/app/start/page.tsx`
- Drill runner: `web/app/drill/[sid]/page.tsx`
- Global styles: `web/app/globals.css`