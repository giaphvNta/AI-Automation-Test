#!/usr/bin/env bash
# Bước 6b: Convert video webm→mp4 + ghép full-session.mp4 theo ĐÚNG thứ tự chạy test.
# Usage: ./scripts/convert-videos.sh <project_name> <run_id>
# Chạy trên host — tự gọi docker compose. Dùng chung cho mọi project.

set -euo pipefail

PROJECT_NAME="${1:?Usage: $0 <project_name> <run_id>}"
RUN_ID="${2:?Usage: $0 <project_name> <run_id>}"

AUTOMATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULTS_REL="projects/$PROJECT_NAME/test-results/runs/$RUN_ID/artifacts"

if [ ! -d "$AUTOMATION_DIR/$RESULTS_REL" ]; then
  echo "[convert-videos] ❌ Không tìm thấy artifacts: $AUTOMATION_DIR/$RESULTS_REL"
  exit 1
fi

cd "$AUTOMATION_DIR"
docker compose run --rm --entrypoint bash playwright \
  /work/scripts/convert-videos-inner.sh "$RESULTS_REL"
