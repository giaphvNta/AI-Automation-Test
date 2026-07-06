#!/usr/bin/env bash
# Wrapper chạy Playwright test qua Docker.
# Usage:
#   ./scripts/run-test.sh <project_name> [extra_playwright_args...]
# Fast mode (skip video/trace/heal):
#   TEST_FAST=1 ./scripts/run-test.sh <project_name>

set -euo pipefail

PROJECT_NAME="${1:?Usage: $0 <project_name> [args...]}"
shift || true

# Tự định vị: script nằm ở <root>/automation/scripts/ → AUTOMATION_DIR = 1 cấp trên
AUTOMATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$AUTOMATION_DIR/projects/$PROJECT_NAME"
RUN_ID="${TEST_RUN_ID:-$(date +%d_%m_%Y_%H_%M_%S_%3N)}"
RUN_DIR="$PROJECT_DIR/test-results/runs/$RUN_ID"
SPEC_PATH="${SPEC_FILE:-projects/$PROJECT_NAME/tests/}"
DEPS_MARKER="$AUTOMATION_DIR/.playwright-deps-ready"
PKG_LOCK="$AUTOMATION_DIR/package-lock.json"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "[run-test] ❌ Project chưa tồn tại: $PROJECT_DIR"
  echo "[run-test] Tạo trước với: mkdir -p $PROJECT_DIR/{tests,specs,test-results}"
  exit 1
fi

cd "$AUTOMATION_DIR"

PROJECT_ENV_FILE=""
if [ -f "$PROJECT_DIR/.env" ]; then
  PROJECT_ENV_FILE="--env-file $PROJECT_DIR/.env"
fi

# Nạp compose override riêng project (nếu có) — ví dụ mount cache đặc thù.
# Mount/volume đặc thù KHÔNG nằm trong docker-compose.yml chung nữa.
COMPOSE_FILES="-f docker-compose.yml"
if [ -f "$PROJECT_DIR/docker-compose.override.yml" ]; then
  COMPOSE_FILES="$COMPOSE_FILES -f $PROJECT_DIR/docker-compose.override.yml"
  echo "[run-test] 🧩 Override: projects/$PROJECT_NAME/docker-compose.override.yml"
fi

GID="$(id -g)"
export UID GID
export TEST_PROJECT="$PROJECT_NAME"
export TEST_RUN_ID="$RUN_ID"
export TEST_FAST="${TEST_FAST:-}"
export TEST_LIVE="${TEST_LIVE:-}"

mkdir -p "$RUN_DIR"

# Guard: từ chối nếu run dir đã có artifacts — ngăn heal rerun ghi đè main run
if [ -d "$RUN_DIR/artifacts" ] && [ -n "$(ls -A "$RUN_DIR/artifacts" 2>/dev/null)" ]; then
  echo "[run-test] ❌ RUN_ID '$RUN_ID' đã có artifacts tại:"
  echo "           $RUN_DIR/artifacts"
  echo "[run-test] Dùng HEAL_RUN_ID riêng: TEST_RUN_ID=\"${RUN_ID}_h1\" ./scripts/run-test.sh ..."
  exit 1
fi

# Lint gate: chặn fake assertion / test.skip che giấu bug (Rule #15) trước khi chạy
"$AUTOMATION_DIR/scripts/lint-test.sh" "$PROJECT_NAME"

echo "[run-test] 🐳 Project: '$PROJECT_NAME' | Run ID: $RUN_ID"
[ -n "$TEST_FAST" ] && echo "[run-test] ⚡ Fast mode ON (no video/trace)"
[ -n "$TEST_LIVE" ] && echo "[run-test] 🖥️  Live mode ON — mở http://localhost:6080/vnc.html để xem"

# Cài deps chỉ khi package-lock.json thay đổi, không cài lại mỗi lần chạy test
# shellcheck disable=SC2086
if [ ! -f "$DEPS_MARKER" ] || [ "$PKG_LOCK" -nt "$DEPS_MARKER" ]; then
  echo "[run-test] 📦 Cài dependencies..."
  docker compose $COMPOSE_FILES $PROJECT_ENV_FILE run --rm --user root \
    -e HOST_UID="$(id -u)" \
    -e HOST_GID="$(id -g)" \
    playwright \
    bash -lc 'npm ci --no-fund --no-audit 2>&1 | tail -3; chown -R "$HOST_UID:$HOST_GID" node_modules'
  touch "$DEPS_MARKER"
else
  echo "[run-test] 📦 Dependencies OK"
fi

# Chạy test — docker compose run dùng bridge network (đã bỏ network_mode: host),
# port mapping (-p) hoạt động bình thường cho mọi project
set +e
if [ -n "$TEST_LIVE" ]; then
  # Live mode: publish port 6080 cho noVNC
  # shellcheck disable=SC2086
  docker compose $COMPOSE_FILES $PROJECT_ENV_FILE run --rm \
    -p 6080:6080 \
    -e TEST_PROJECT="$PROJECT_NAME" \
    -e TEST_RUN_ID="$RUN_ID" \
    -e TEST_LIVE="$TEST_LIVE" \
    -e TEST_FAST="$TEST_FAST" \
    -e VNC_GEOMETRY="${VNC_GEOMETRY:-}" \
    -e SPEC_FILE="$SPEC_PATH" \
    --entrypoint bash \
    playwright \
    /work/scripts/live-entrypoint.sh "$PROJECT_NAME" "$@"
else
  # Normal / fast mode
  # shellcheck disable=SC2086
  docker compose $COMPOSE_FILES $PROJECT_ENV_FILE run --rm \
    -e TEST_PROJECT="$PROJECT_NAME" \
    -e TEST_RUN_ID="$RUN_ID" \
    -e TEST_FAST="$TEST_FAST" \
    playwright \
    npx playwright test "$SPEC_PATH" "$@"
fi

EXIT_CODE=$?
set -e

echo ""
[ "$EXIT_CODE" -eq 0 ] && echo "[run-test] ✅ Exit: $EXIT_CODE" || echo "[run-test] ❌ Exit: $EXIT_CODE"
echo "[run-test] 📁 Run dir: $RUN_DIR"
[ -f "$RUN_DIR/results.json" ]     && echo "[run-test] 📄 JSON: $RUN_DIR/results.json"
[ -d "$RUN_DIR/artifacts" ]        && echo "[run-test] 📁 Artifacts: $RUN_DIR/artifacts"
[ -d "$RUN_DIR/playwright-report" ] && echo "[run-test] 📊 HTML: cd $AUTOMATION_DIR && ./scripts/show-report.sh $PROJECT_NAME $RUN_ID"

exit $EXIT_CODE
