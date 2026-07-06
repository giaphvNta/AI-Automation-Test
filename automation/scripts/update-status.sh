#!/bin/bash
# Ghi trạng thái bước hiện tại cho dashboard real-time
# Usage: bash scripts/update-status.sh <step_num> <step_key> <project> <message> [heal_count] [mode] [status]
# status mặc định là "running", dùng "done" khi kết thúc

STEP=${1:-0}
KEY=${2:-s1}
PROJECT=${3:-unknown}
MSG=${4:-Running...}
HEAL=${5:-0}
MODE=${6:-normal}
STATUS=${7:-running}

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
  'step': num(os.environ.get('STEP')), 'step_key': os.environ.get('KEY', 's1'),
  'project': os.environ.get('PROJECT', 'unknown'), 'status': os.environ.get('STATUS', 'running'),
  'message': os.environ.get('MSG', ''), 'heal_count': num(os.environ.get('HEAL')),
  'heal_max': 3, 'mode': os.environ.get('MODE', 'normal'),
  'timestamp': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
}, open(os.environ['STATUS_FILE'], 'w'))
" 2>/dev/null || true
