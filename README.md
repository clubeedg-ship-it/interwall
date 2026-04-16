# Interwall

This repo’s active runtime is the Docker Compose backend stack:

- `postgres`
- `api`
- `nginx`

Start it with:

1. `cp .env.example .env`
2. Fill in real values in `.env`
3. `docker compose up -d --build`
4. Open `http://localhost:1441`

Backend health check:

- `curl -fsS http://localhost:1441/api/health/ping`

Operational backend docs:

- runbook: [.project/BACKEND-DEPLOY-RUNBOOK.md](.project/BACKEND-DEPLOY-RUNBOOK.md)
- active state: [.project/COACH-HANDOFF.md](.project/COACH-HANDOFF.md)
- roadmap / tasks: [.project/TODO.md](.project/TODO.md)
