#!/usr/bin/env bash
# Runbook-style deploy script for ru-prime.ru.
#
# Usage (on the server, as user `deploy`):
#
#   cd /opt/dota-coach
#   git pull
#   bash scripts/deploy.sh
#
# What it does:
#   1. Verifies the required variables are set in .env.
#   2. Takes a pg_dump backup of the database into ~/backups.
#   3. Applies the additive SQL migrations required by the latest code
#      (lifetime_games, parsed_games_n, coach_application_status).
#   4. Rebuilds and restarts the docker compose stack.
#   5. Runs smoke tests against the internal /health endpoints.
#
# The script is idempotent: every SQL statement uses IF NOT EXISTS guards,
# and docker compose up is fine to re-run. Re-deploy is safe.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/dota-coach}"
ENV_FILE="$PROJECT_DIR/.env"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"

cd "$PROJECT_DIR"

log() { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 1. Env sanity ----------
log "Checking .env..."
[[ -f "$ENV_FILE" ]] || fail ".env not found at $ENV_FILE"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

REQUIRED_VARS=(JWT_SECRET ML_INTERNAL_TOKEN POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL)
for v in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    fail "Required env var $v is empty in .env"
  fi
done

# Trim obvious "change-me" placeholders.
if [[ "${JWT_SECRET}" == *change-me* || "${ML_INTERNAL_TOKEN}" == *change-me* ]]; then
  fail "JWT_SECRET / ML_INTERNAL_TOKEN still contain placeholder values. Replace them first."
fi

log "Env OK. FORCE_REVOKE_ALL_SESSIONS=${FORCE_REVOKE_ALL_SESSIONS:-false}"

# ---------- 2. DB backup ----------
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/dota_coach_${STAMP}.sql.gz"

log "Backing up database to $BACKUP_FILE"
docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
  fail "Backup is empty; aborting before migration"
fi
log "Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"

# ---------- 3. Schema migrations ----------
log "Applying additive SQL migrations..."
docker compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
-- Iteration 1.5 — data accuracy: canonical game counts on player_accounts.
ALTER TABLE player_accounts
  ADD COLUMN IF NOT EXISTS lifetime_games INTEGER,
  ADD COLUMN IF NOT EXISTS parsed_games_n INTEGER;

-- Iteration 2 — coach application workflow.
DO $$ BEGIN
  CREATE TYPE coach_application_status_enum
    AS ENUM ('NONE','PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS coach_application_status
    coach_application_status_enum NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS coach_application_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coach_approved_at TIMESTAMPTZ;
SQL
log "Migrations applied."

# ---------- 4. Rebuild & restart ----------
log "docker compose build --pull ..."
docker compose build --pull

log "docker compose up -d --remove-orphans"
docker compose up -d --remove-orphans

log "Waiting 8s for services to come up..."
sleep 8

docker compose ps

# ---------- 5. Smoke tests ----------
log "Health checks..."

# External (via nginx): /health should NOT be exposed on ml from the internet.
# Internal checks run inside the docker network.
docker compose exec -T auth  curl -fsS http://localhost:8001/health >/dev/null && log "auth OK"  || fail "auth /health failed"
docker compose exec -T core  curl -fsS http://localhost:8002/health >/dev/null && log "core OK"  || fail "core /health failed"
docker compose exec -T ml    curl -fsS http://localhost:8003/health >/dev/null && log "ml OK"    || fail "ml /health failed"
docker compose exec -T llm   curl -fsS http://localhost:8004/health >/dev/null && log "llm OK"   || fail "llm /health failed"

# Confirm ml is no longer exposed externally.
if nc -z -w2 "${SERVER_PUBLIC_IP:-127.0.0.1}" 8003 2>/dev/null; then
  log "WARNING: port 8003 is still reachable from \"${SERVER_PUBLIC_IP:-127.0.0.1}\". Check docker-compose.yml and nginx."
else
  log "Port 8003 is closed externally — ml is internal-only as expected."
fi

log "Deploy finished. Backup kept at $BACKUP_FILE."
log "After the first successful run, set FORCE_REVOKE_ALL_SESSIONS=false and restart auth:"
log "  docker compose restart auth"
