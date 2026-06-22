#!/usr/bin/env bash
# AI Automation Test — Setup Script
# Chạy 1 lần khi onboard máy mới.
# Tự động: pull Docker image, cài /ai-test slash command, verify hub.

set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_COMMANDS_DIR="$HOME/.claude/commands"
PW_IMAGE="mcr.microsoft.com/playwright:v1.60.0-noble"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
err()  { echo -e "${RED}  ✗${NC} $*"; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   AI Automation Test — Setup             ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── 1. Docker ───────────────────────────────────────────────────────────────

echo "► Bước 1: Kiểm tra Docker"

if ! command -v docker &>/dev/null; then
  err "Docker không tìm thấy."
  echo ""
  echo "  Windows: cài Docker Desktop, sau đó bật:"
  echo "  Settings → Resources → WSL Integration → distro Ubuntu → Apply & Restart"
  echo "  macOS: cài và mở Docker Desktop, đảm bảo docker CLI nằm trong PATH."
  echo "  Rồi chạy lại script này."
  exit 1
fi

if ! docker info &>/dev/null; then
  err "Docker daemon chưa chạy. Mở Docker Desktop rồi thử lại."
  exit 1
fi

ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ─── 2. Pull Playwright image ─────────────────────────────────────────────────

echo ""
echo "► Bước 2: Pull Playwright Docker image"

if docker images "$PW_IMAGE" --format "{{.Tag}}" | grep -q "v1.60"; then
  ok "Image $PW_IMAGE đã có sẵn"
else
  warn "Đang pull $PW_IMAGE (~1.5GB, vui lòng chờ)..."
  docker pull "$PW_IMAGE"
  ok "Pull xong"
fi

# ─── 3. Verify automation hub ─────────────────────────────────────────────────

echo ""
echo "► Bước 3: Verify automation hub"

HUB="$APP_ROOT/automation"
ERRORS=0

for f in package.json playwright.config.ts docker-compose.yml .mcp.json; do
  if [ -f "$HUB/$f" ]; then
    ok "$f"
  else
    err "MISSING: $HUB/$f"
    ERRORS=$((ERRORS + 1))
  fi
done

for agent in playwright-test-planner playwright-test-generator playwright-test-healer; do
  if [ -f "$HUB/.claude/agents/$agent.md" ]; then
    ok "Agent: $agent"
  else
    err "MISSING agent: $agent"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  err "$ERRORS file thiếu trong automation hub. Clone lại repo và thử."
  exit 1
fi

# Ensure node_modules symlink (tránh npm install lại)
if [ ! -e "$HUB/node_modules" ]; then
  warn "node_modules chưa có. Đang npm install..."
  cd "$HUB" && npm install --no-fund --no-audit
  ok "npm install xong"
else
  ok "node_modules OK"
fi

# ─── 4. Cài /ai-test slash command ────────────────────────────────────────────

echo ""
echo "► Bước 4: Đăng ký slash command /ai-test"

mkdir -p "$CLAUDE_COMMANDS_DIR"

if [ -f "$CLAUDE_COMMANDS_DIR/ai-test.md" ]; then
  warn "~/.claude/commands/ai-test.md đã tồn tại — overwrite"
fi

cp "$APP_ROOT/commands/ai-test.md" "$CLAUDE_COMMANDS_DIR/ai-test.md"
ok "Slash command /ai-test đã đăng ký tại ~/.claude/commands/ai-test.md"

# ─── 5. Tạo .gitignore cho app root ──────────────────────────────────────────

echo ""
echo "► Bước 5: Setup .gitignore"

GITIGNORE="$APP_ROOT/.gitignore"
if [ ! -f "$GITIGNORE" ]; then
  cat > "$GITIGNORE" << 'EOF'
# Credentials
service-auth.json
*-auth.json
.env
.env.local

# Playwright runtime
automation/node_modules/
automation/test-results/
automation/playwright-report/
automation/projects/*/.env
automation/projects/*/.auth/
automation/projects/*/test-results/
automation/projects/*/playwright-report/
EOF
  ok ".gitignore tạo xong"
else
  ok ".gitignore đã có"
fi

# ─── Xong ────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅  Setup hoàn tất!                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Bước tiếp theo:"
echo "  1. Reload VSCode: Ctrl+Shift+P → Developer: Reload Window"
echo "  2. Thử lệnh trong Claude Code chat:"
echo ""
echo '     /ai-test "Test trang example.com — verify title" --project=demo --target=https://example.com'
echo ""
echo "  Thư mục test sẽ được tạo tự động tại:"
echo "  $APP_ROOT/automation/projects/<tên-project>/"
echo ""
