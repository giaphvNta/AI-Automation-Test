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

python3 -c "
import json, datetime
json.dump({
  'step': $STEP, 'step_key': '$KEY',
  'project': '$PROJECT', 'status': '$STATUS',
  'message': '$MSG', 'heal_count': $HEAL,
  'heal_max': 3, 'mode': '$MODE',
  'timestamp': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
}, open('/home/user/ai-automation-test/automation/.test-status.json', 'w'))
" 2>/dev/null || true
