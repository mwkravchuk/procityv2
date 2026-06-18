# ProcityV2

Thin-slice scaffold for a production-minded ProcityV2 stack:
- Go API with transactional queue -> match promotion logic
- PostgreSQL as source of truth
- React + Vite client with stub login + queue controls
- Docker Compose for local Postgres
- Dbmate for versioned SQL migrations
- GitHub Actions CI for backend and frontend

## Stack
- Backend: Go 1.22, chi, pgx
- Frontend: React + TypeScript + Vite
- DB: PostgreSQL 16

## Local Setup

1. Start PostgreSQL

```bash
cd infra
docker compose up -d
```

2. Apply migration

```bash
cp backend/.env.example backend/.env
./scripts/migrate.sh
```

To create a new migration:

```bash
./scripts/new_migration.sh add_some_change
```

3. Run backend

```bash
cd backend
go mod tidy
go run ./cmd/api
```

4. Run frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend defaults to `http://localhost:5173` and calls API at `http://localhost:8080`.

## Migration Workflow
- Migrations live in `backend/migrations`
- `dbmate` records applied versions in the database via `schema_migrations`
- `./scripts/migrate.sh` applies only pending migrations
- `./scripts/new_migration.sh name_here` creates a new migration file with `migrate:up` and `migrate:down` sections

## Current API Endpoints
- `GET /health`
- `POST /auth/dev-login` body: `{ "displayName": "name" }`
- `GET /queue/state?userId=1`
- `GET /queue/ws?userId=1`
- `POST /queue/join` body: `{ "userId": 1 }`
- `POST /queue/leave` body: `{ "userId": 1 }`
- `POST /matches/{matchID}/draft/captains?userId=1`
- `GET /matches/{matchID}/draft/state?userId=1`
- `POST /matches/{matchID}/draft/picks` body: `{ "captainUserId": 1, "pickedUserId": 2, "pickNumber": 1 }`
- `GET /matches/{matchID}/draft/ws?userId=1`

## Queue Promotion Behavior
- Queue table is intentionally minimal: `id`, `user_id`, `created_at`
- Map pool is database-backed in `maps` with `is_active` flag
- A unique `user_id` constraint prevents double-join
- On join, backend transaction checks queue length
- Queue pages load one HTTP snapshot, then subscribe to queue WebSocket updates
- Queue join, leave, and match promotion all broadcast fresh queue snapshots to connected clients
- If at least 10 players are queued:
  - lock 10 oldest entries (`FOR UPDATE SKIP LOCKED`)
  - pick random active map from `maps`
  - create `matches` row in `drafting`
  - create `match_players` rows (draft positions assigned later during captain draft)
  - randomly assign two captains onto teams 1 and 2
  - delete consumed queue entries

This gives deterministic promotion and race-safe behavior under concurrent joins.

## Draft Behavior
- Captains are assigned randomly when a match is created
- Frontend match pages live at `/matches/{matchID}`
- Draft pages load one HTTP snapshot, then subscribe to match-scoped WebSocket updates
- The WebSocket broadcasts the full `DraftState` after draft mutations
- Snapshot endpoints remain the recovery path for refreshes, reconnects, and closed tabs
- Draft order is snake-style by team: `1, 2, 2, 1, 1, 2, 2, 1`
- The pick endpoint validates `pickNumber`, captain turn, and player availability server-side
- Each submitted pick updates `match_players.team`, sets `draft_pick_position`, and appends a `match_draft_picks` timeline row
