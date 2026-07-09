#!/usr/bin/env bash
# Show Playwright HTML report.
# Usage:
#   ./scripts/show-report.sh <project_name> [run_id]
# Nếu không truyền run_id, tự chọn run mới nhất.

set -euo pipefail

PROJECT_NAME="${1:?Usage: $0 <project_name> [run_id]}"
RUN_ID="${2:-}"

AUTOMATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS_DIR="$AUTOMATION_DIR/projects/$PROJECT_NAME/test-results/runs"

if [ ! -d "$RUNS_DIR" ]; then
  echo "[show-report] ❌ Không tìm thấy runs: $RUNS_DIR"
  exit 1
fi

# Tự chọn run mới nhất nếu không truyền run_id
# Sort theo mtime — KHÔNG sort theo tên vì RUN_ID format DD_MM_YYYY không sort được theo thời gian
if [ -z "$RUN_ID" ]; then
  RUN_ID="$(find "$RUNS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' | sort -n | tail -n 1 | cut -d' ' -f2)"
fi

REPORT_DIR="$AUTOMATION_DIR/projects/$PROJECT_NAME/test-results/runs/$RUN_ID/playwright-report"

if [ ! -d "$REPORT_DIR" ]; then
  echo "[show-report] ❌ Không tìm thấy report: $REPORT_DIR"
  echo "[show-report] Các runs có sẵn:"
  find "$RUNS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '  %f\n' | sort
  exit 1
fi

echo "[show-report] 📊 Project: $PROJECT_NAME | Run: $RUN_ID"
echo "[show-report] 🌐 Mở trình duyệt: http://localhost:9323"
echo "[show-report] ⚠️  LƯU Ý: report HTML này là ẢNH CHỤP LẦN CHẠY GỐC — KHÔNG cập nhật sau heal."
echo "[show-report]     Case đã heal-pass vẫn hiện FAILED + video trước heal ở đây."
echo "[show-report]     👉 Kết quả & video CHÍNH THỨC (đã merge heal): xem AI_REPORT.md trong run dir."
echo ""

cd "$AUTOMATION_DIR"
docker compose run --rm \
  -p 9323:9323 \
  playwright \
  npx playwright show-report \
    --host 0.0.0.0 \
    --port 9323 \
    "projects/$PROJECT_NAME/test-results/runs/$RUN_ID/playwright-report"
