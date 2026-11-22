#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
MOBILE_DIR="$ROOT_DIR/frontend/mobile"
LOG_FILE="$BACKEND_DIR/backend.log"
BACKEND_PID=""

cleanup() {
  echo ""
  echo "Stopping Workspace Chat..."
  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    pkill -P "${BACKEND_PID}" 2>/dev/null || true
    kill "${BACKEND_PID}" 2>/dev/null || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
  lsof -ti :3001 | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "=========================================="
echo "   Starting Workspace Chat (5th-Sem)      "
echo "=========================================="

# 1. Ensure Docker Desktop is running
if ! docker info >/dev/null 2>&1; then
  echo "-> Starting Docker Desktop..."
  open -a Docker
  echo -n "-> Waiting for Docker daemon"
  until docker info >/dev/null 2>&1; do
    printf "."
    sleep 2
  done
  echo " ready!"
fi

# 2. Start MongoDB container
echo "-> Starting MongoDB..."
docker compose -f "$ROOT_DIR/docker-compose.yml" --env-file "$BACKEND_DIR/.env" up -d mongo

# 3. Sync Prisma schema & ensure dependencies/build exist
if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
  echo "-> Installing backend dependencies..."
  npm --prefix "$BACKEND_DIR" install
fi

if [[ ! -d "$MOBILE_DIR/node_modules" ]]; then
  echo "-> Installing mobile dependencies..."
  npm --prefix "$MOBILE_DIR" install
fi

echo "-> Syncing database schema..."
PRISMA_STAMP="$BACKEND_DIR/node_modules/.prisma/client/index.js"
if [[ ! -f "$PRISMA_STAMP" || "$BACKEND_DIR/prisma/schema.prisma" -nt "$PRISMA_STAMP" ]]; then
  (cd "$BACKEND_DIR" && npx prisma generate >/dev/null)
fi
(cd "$BACKEND_DIR" && npx prisma db push --skip-generate >/dev/null)

# 4. Start NestJS Backend (+ Web UI) on port 3001
lsof -ti :3001 | xargs kill -9 2>/dev/null || true
echo "-> Starting Backend API & Web UI..."
(cd "$BACKEND_DIR" && npm run start:dev > "$LOG_FILE" 2>&1) &
BACKEND_PID=$!

echo -n "-> Waiting for Backend on port 3001"
for _ in $(seq 1 45); do
  if curl -s -o /dev/null http://localhost:3001/docs; then
    echo " ready!"
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo ""
    echo "Backend failed to start. Last log lines:"
    tail -n 25 "$LOG_FILE"
    exit 1
  fi
  printf "."
  sleep 1
done

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 'localhost')"
echo ""
echo "   Backend API  : http://localhost:3001  (LAN: http://${LAN_IP}:3001)"
echo "   Web Chat UI  : http://localhost:3001"
echo "   Swagger Docs : http://localhost:3001/docs"
echo "   Backend Logs : backend/backend.log"
echo ""
echo "-> Starting Expo Go (press Ctrl+C to stop everything)..."
echo ""

# 5. Start Expo in foreground (displays QR code cleanly)
lsof -ti :8081 | xargs kill -9 2>/dev/null || true
cd "$MOBILE_DIR"
npx expo start --lan
