#!/usr/bin/env bash
# Wrapper chạy Playwright test qua Docker.
# Usage:
#   ./scripts/run-test.sh <project_name> [extra_playwright_args...]
# Example:
#   ./scripts/run-test.sh demo
#   ./scripts/run-test.sh customer-A --grep="login"

set -euo pipefail

PROJECT_NAME="${1:?Usage: $0 <project_name> [args...]}"
shift || true

AUTOMATION_DIR="/home/user/ai-automation-test/automation"
PROJECT_DIR="$AUTOMATION_DIR/projects/$PROJECT_NAME"
RUN_ID="${TEST_RUN_ID:-$(date +%Y%m%d-%H%M%S-%N)}"
RUN_DIR="$PROJECT_DIR/test-results/runs/$RUN_ID"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "[run-test] ❌ Project chưa tồn tại: $PROJECT_DIR"
  echo "[run-test] Tạo trước với: mkdir -p $PROJECT_DIR/{tests,specs,test-results}"
  exit 1
fi

cd "$AUTOMATION_DIR"

# Load .env của project nếu có
PROJECT_ENV_FILE=""
if [ -f "$PROJECT_DIR/.env" ]; then
  PROJECT_ENV_FILE="--env-file $PROJECT_DIR/.env"
fi

export UID GID
export TEST_PROJECT="$PROJECT_NAME"
export TEST_RUN_ID="$RUN_ID"

mkdir -p "$RUN_DIR"

echo "[run-test] 🐳 Chạy test cho project '$PROJECT_NAME' qua Docker..."
echo "[run-test] Run ID: $RUN_ID"
echo "[run-test] Args: $*"

# Ensure dependencies exist inside Docker volume. Run as root only for the
# dependency volume, then execute tests as the mapped host user.
# shellcheck disable=SC2086
docker compose $PROJECT_ENV_FILE run --rm --user root \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  playwright \
  bash -lc 'if [ ! -d node_modules/@playwright/test ]; then npm ci --no-fund --no-audit; fi; chown -R "$HOST_UID:$HOST_GID" node_modules'

# shellcheck disable=SC2086
set +e
docker compose $PROJECT_ENV_FILE run --rm \
  -e TEST_PROJECT="$PROJECT_NAME" \
  -e TEST_RUN_ID="$RUN_ID" \
  playwright \
  npx playwright test "projects/$PROJECT_NAME/tests/" "$@"

EXIT_CODE=$?
set -e

echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "[run-test] ✅ Exit code: $EXIT_CODE"
else
  echo "[run-test] ❌ Exit code: $EXIT_CODE"
fi
echo "[run-test] 📁 Run dir: $RUN_DIR"
if [ -d "$RUN_DIR/artifacts" ]; then
  echo "[run-test] 📁 Artifacts: $RUN_DIR/artifacts"
fi
if [ -f "$RUN_DIR/results.json" ]; then
  echo "[run-test] 📄 JSON: $RUN_DIR/results.json"
fi
if [ -d "$RUN_DIR/playwright-report" ]; then
  echo "[run-test] 📊 HTML report: cd $AUTOMATION_DIR && docker compose run --rm playwright npx playwright show-report projects/$PROJECT_NAME/test-results/runs/$RUN_ID/playwright-report"
else
  echo "[run-test] 📊 HTML report: not generated for this run"
fi

exit $EXIT_CODE
