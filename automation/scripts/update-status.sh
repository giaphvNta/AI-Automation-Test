#!/bin/bash
# Ghi trạng thái pha hiện tại cho dashboard real-time.
# Usage: bash scripts/update-status.sh <phase_num> <phase_key> <project> <message> [heal_count] [mode] [status] [--run-id=<id>] [--note=<text>]
# phase_key mới: prep | author | run_heal | finalize
# key cũ s1..s7 vẫn được dashboard map ngược để tương thích.
# status mặc định là "running", dùng "done"/"skipped"/"blocked" khi kết thúc.
# Script cũng best-effort update projects/<project>/.run-checklist.* để main context có thể clear/resume gọn.

STEP=${1:-0}
KEY=${2:-prep}
PROJECT=${3:-unknown}
MSG=${4:-Running...}
HEAL=${5:-0}
MODE=${6:-normal}
STATUS=${7:-running}
RUN_ID=""
NOTE="$MSG"

for EXTRA in "${@:8}"; do
  case "$EXTRA" in
    --run-id=*) RUN_ID="${EXTRA#--run-id=}" ;;
    --note=*) NOTE="${EXTRA#--note=}" ;;
    *)
      if [ -z "$RUN_ID" ]; then
        RUN_ID="$EXTRA"
      else
        NOTE="$EXTRA"
      fi
      ;;
  esac
done

# Tự định vị: .test-status.json nằm ở AUTOMATION_DIR (1 cấp trên scripts/)
AUTOMATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Truyền qua env var — không interpolate vào Python string (message chứa quote sẽ vỡ lệnh)
STEP="$STEP" KEY="$KEY" PROJECT="$PROJECT" MSG="$MSG" HEAL="$HEAL" MODE="$MODE" STATUS="$STATUS" \
STATUS_FILE="$AUTOMATION_DIR/.test-status.json" \
python3 -c "
import json, datetime, os
def num(v, default=0):
    try: return int(v)
    except (ValueError, TypeError): return default
json.dump({
  'step': num(os.environ.get('STEP')), 'step_key': os.environ.get('KEY', 'prep'),
  'project': os.environ.get('PROJECT', 'unknown'), 'status': os.environ.get('STATUS', 'running'),
  'message': os.environ.get('MSG', ''), 'heal_count': num(os.environ.get('HEAL')),
  'heal_max': 3, 'mode': os.environ.get('MODE', 'normal'),
  'timestamp': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
}, open(os.environ['STATUS_FILE'], 'w'))
" 2>/dev/null || true

# Đồng bộ checklist cùng lúc với dashboard. Best-effort: không để lỗi checklist làm hỏng test run.
# finalize/done được finalize-run.mjs xử lý và reset project-level về idle; không mark lại ở đây để tránh stale state.
if [ "${UPDATE_STATUS_CHECKLIST:-1}" != "0" ]; then
  PHASE=""
  case "$KEY" in
    prep|s1|s1b|s2|s3) PHASE="prep" ;;
    author|s3b|s4|s5) PHASE="author" ;;
    run|run_heal|s6) PHASE="run_heal" ;;
    finalize|s6b|s7) PHASE="finalize" ;;
  esac

  CHECK_STATUS=""
  case "$STATUS" in
    pending|running|done|blocked|skipped) CHECK_STATUS="$STATUS" ;;
    fail|failed|error) CHECK_STATUS="blocked" ;;
  esac

  if [ -n "$PHASE" ] && [ -n "$CHECK_STATUS" ] \
    && [ -n "$PROJECT" ] && [ "$PROJECT" != "unknown" ] && [ "$PROJECT" != "no project" ] && [ "$PROJECT" != "—" ]; then
    if ! { [ "$PHASE" = "finalize" ] && [ "$CHECK_STATUS" = "done" ]; }; then
      CHECK_ARGS=(scripts/pipeline/checklist.mjs mark "$PROJECT" "$PHASE" "$CHECK_STATUS" "--note=$NOTE")
      if [ -n "$RUN_ID" ]; then
        CHECK_ARGS+=("--run-id=$RUN_ID")
      fi
      (cd "$AUTOMATION_DIR" && node "${CHECK_ARGS[@]}") >/dev/null 2>&1 || true
    fi
  fi
fi
