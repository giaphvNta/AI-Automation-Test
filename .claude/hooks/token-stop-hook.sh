#!/bin/bash
# Stop hook: khi agent kết thúc lượt, đo token THẬT của phiên (từ transcript_path do Claude Code
# truyền qua stdin) và ghi token.json vào run dir mới nhất — NẾU run dir đó vừa được tạo/đổi gần đây
# (dấu hiệu vừa chạy test). Deterministic, không phụ thuộc agent nhớ đo.
#
# Fail-open: mọi lỗi đều nuốt, không chặn agent.

set +e
INPUT="$(cat)"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
AUTOMATION_DIR="$PROJECT_DIR/automation"
MEASURE="$AUTOMATION_DIR/scripts/measure-tokens.mjs"

# transcript_path từ stdin JSON (Claude Code cấp). Thiếu jq → thoát êm.
command -v jq >/dev/null 2>&1 || exit 0
TRANSCRIPT="$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty')"
[ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ] || exit 0
[ -f "$MEASURE" ] || exit 0

# Tìm run dir mới nhất trong mọi project
LATEST_RUN="$(ls -dt "$AUTOMATION_DIR"/projects/*/test-results/runs/*/ 2>/dev/null | head -1)"
[ -n "$LATEST_RUN" ] || exit 0

# Chỉ ghi nếu run dir vừa đổi trong 30 phút (tránh ghi cho phiên không chạy test)
if [ -n "$(find "$LATEST_RUN" -maxdepth 0 -mmin -30 2>/dev/null)" ]; then
  node "$MEASURE" "$TRANSCRIPT" --json > "$LATEST_RUN/token.json" 2>/dev/null
fi
exit 0
