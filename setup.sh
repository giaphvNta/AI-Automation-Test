#!/usr/bin/env bash
# AI Automation Test — Setup Script
# Chạy 1 lần khi onboard máy mới.
# Tự động: pull Docker image, cài Claude commands, cài Codex skills/hooks, verify hub.

set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_COMMANDS_DIR="$HOME/.claude/commands"
CODEX_SKILLS_DIR="$HOME/.codex/skills"
CODEX_HOOKS_FILE="$HOME/.codex/hooks.json"
ROOT_MARKER="$HOME/.ai-automation-test-root"
PW_IMAGE="mcr.microsoft.com/playwright:v1.60.0-noble"
CODEX_ONLY=0
UNINSTALL_CODEX_ONLY=0

case "${1:-}" in
  --codex-only)
    CODEX_ONLY=1
    ;;
  --uninstall-codex)
    UNINSTALL_CODEX_ONLY=1
    ;;
esac

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
err()  { echo -e "${RED}  ✗${NC} $*"; }

# ─── Uninstall mode ───────────────────────────────────────────────────────────
if [[ "${1:-}" == "--uninstall" || "$UNINSTALL_CODEX_ONLY" -eq 1 ]]; then
  echo ""
  if [ "$UNINSTALL_CODEX_ONLY" -eq 1 ]; then
    echo "╔══════════════════════════════════════════╗"
    echo "║   AI Automation Test — Codex Uninstall   ║"
    echo "╚══════════════════════════════════════════╝"
  else
    echo "╔══════════════════════════════════════════╗"
    echo "║   AI Automation Test — Uninstall         ║"
    echo "╚══════════════════════════════════════════╝"
  fi
  echo ""
  REMOVED=0
  if [ "$UNINSTALL_CODEX_ONLY" -eq 0 ]; then
    for cmd in ai-test ai-test-i; do
      if [ -f "$CLAUDE_COMMANDS_DIR/$cmd.md" ]; then
        rm "$CLAUDE_COMMANDS_DIR/$cmd.md"
        ok "Đã xóa ~/.claude/commands/$cmd.md"
        REMOVED=$((REMOVED + 1))
      else
        warn "Không tìm thấy ~/.claude/commands/$cmd.md — bỏ qua"
      fi
    done
  fi

  for skill in ai-test ai-test-i; do
    if [ -d "$CODEX_SKILLS_DIR/$skill" ]; then
      rm -rf "$CODEX_SKILLS_DIR/$skill"
      ok "Đã xóa ~/.codex/skills/$skill"
      REMOVED=$((REMOVED + 1))
    else
      warn "Không tìm thấy ~/.codex/skills/$skill — bỏ qua"
    fi
  done

  if [ -f "$CODEX_HOOKS_FILE" ] && command -v node &>/dev/null; then
    backup="$CODEX_HOOKS_FILE.bak.$(date +%Y%m%d%H%M%S)"
    cp "$CODEX_HOOKS_FILE" "$backup"
    node - "$CODEX_HOOKS_FILE" "$APP_ROOT/codex/hooks/ai-test-guard.sh" "$APP_ROOT/.claude/hooks/ai-test-guard.sh" <<'NODE'
const fs = require('fs');
const [file, ...commands] = process.argv.slice(2);
let data = {};
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  process.exit(0);
}
const groups = data.hooks?.UserPromptSubmit;
if (!Array.isArray(groups)) process.exit(0);
for (const group of groups) {
  if (!Array.isArray(group.hooks)) continue;
  group.hooks = group.hooks.filter((hook) => !commands.includes(hook.command));
}
data.hooks.UserPromptSubmit = groups.filter((group) => Array.isArray(group.hooks) && group.hooks.length > 0);
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
NODE
    ok "Đã gỡ Codex hook ai-test-guard.sh khỏi ~/.codex/hooks.json (backup: $backup)"
  fi

  echo ""
  if [ "$REMOVED" -gt 0 ]; then
    echo "  ✅ Đã gỡ $REMOVED mục setup. Reload AI tool để áp dụng:"
    echo "     Claude Code: Ctrl+Shift+P → Developer: Reload Window"
    echo "     Codex: mở phiên mới"
  else
    echo "  ℹ️  Không có gì để gỡ."
  fi
  echo "  (Repo và Docker image giữ nguyên — chỉ xóa slash commands/skills/hooks đã cài)"
  echo ""
  exit 0
fi

echo ""
if [ "$CODEX_ONLY" -eq 1 ]; then
  echo "╔══════════════════════════════════════════╗"
  echo "║   AI Automation Test — Codex Setup       ║"
  echo "╚══════════════════════════════════════════╝"
else
  echo "╔══════════════════════════════════════════╗"
  echo "║   AI Automation Test — Setup             ║"
  echo "╚══════════════════════════════════════════╝"
fi
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

# ─── 4. Cài slash command /ai-test + /ai-test-i ───────────────────────────────

echo ""
echo "► Bước 4: Đăng ký slash command /ai-test, /ai-test-i"

if [ "$CODEX_ONLY" -eq 1 ]; then
  warn "Bỏ qua Claude slash commands vì đang chạy --codex-only"
else
  mkdir -p "$CLAUDE_COMMANDS_DIR"

  for cmd in ai-test ai-test-i; do
    if [ -f "$CLAUDE_COMMANDS_DIR/$cmd.md" ]; then
      warn "~/.claude/commands/$cmd.md đã tồn tại — overwrite"
    fi
    # Inject APP_ROOT thật của máy này vào placeholder {{APP_ROOT}}.
    # Nhờ vậy mỗi dev / mỗi máy (kể cả macOS, clone ở path khác) đều trỏ đúng đường dẫn.
    sed "s|{{APP_ROOT}}|$APP_ROOT|g" "$APP_ROOT/commands/$cmd.md" > "$CLAUDE_COMMANDS_DIR/$cmd.md"
    ok "Slash command /$cmd đã đăng ký tại ~/.claude/commands/$cmd.md (APP_ROOT=$APP_ROOT)"
  done
fi

# ─── 4a. Ghi marker automation root cho Codex / tool khác ─────────────────────

echo ""
echo "► Bước 4a: Ghi automation root marker"

printf '%s\n' "$APP_ROOT" > "$ROOT_MARKER"
ok "Đã ghi $ROOT_MARKER (dùng cho Codex khi đang ở project khác)"

# ─── 4b. Cài Codex skills global ──────────────────────────────────────────────

echo ""
echo "► Bước 4b: Cài Codex skills global"

mkdir -p "$CODEX_SKILLS_DIR"

for skill in ai-test ai-test-i; do
  if [ -d "$APP_ROOT/skills/$skill" ]; then
    mkdir -p "$CODEX_SKILLS_DIR/$skill"
    cp -R "$APP_ROOT/skills/$skill/." "$CODEX_SKILLS_DIR/$skill/"
    ok "Codex skill $skill đã cài tại ~/.codex/skills/$skill"
  else
    err "MISSING skill: $APP_ROOT/skills/$skill"
  fi
done

if [ "$(cat "$ROOT_MARKER" 2>/dev/null || true)" != "$APP_ROOT" ]; then
  err "Marker $ROOT_MARKER không trỏ về repo hiện tại ($APP_ROOT)"
  exit 1
fi
if [ ! -d "$(cat "$ROOT_MARKER")/automation" ]; then
  err "Marker $ROOT_MARKER không trỏ tới automation hub hợp lệ"
  exit 1
fi
if [ ! -d "$APP_ROOT/automation" ]; then
  err "APP_ROOT không hợp lệ: thiếu $APP_ROOT/automation"
  exit 1
fi
if ! grep -q 'ai-automation-test-root' "$CODEX_SKILLS_DIR/ai-test/SKILL.md"; then
  err "Codex skill ai-test thiếu rule đọc marker root; cài đặt không an toàn"
  exit 1
fi
if ! grep -q 'ai-automation-test-root' "$CODEX_SKILLS_DIR/ai-test-i/SKILL.md"; then
  err "Codex skill ai-test-i thiếu rule đọc marker root; cài đặt không an toàn"
  exit 1
fi
if ! grep -q 'KHÔNG tự dò sang repo khác' "$CODEX_SKILLS_DIR/ai-test/SKILL.md"; then
  err "Codex skill ai-test thiếu guard chống tự dò nhầm automation repo"
  exit 1
fi
if ! grep -q 'KHÔNG tự dò sang repo khác' "$CODEX_SKILLS_DIR/ai-test-i/SKILL.md"; then
  err "Codex skill ai-test-i thiếu guard chống tự dò nhầm automation repo"
  exit 1
fi
ok "Codex APP_ROOT guard OK: marker → $APP_ROOT, không tự dò repo khác"

# ─── 4c. Hook validate /ai-test (Validate & chặn) ─────────────────────────────

echo ""
echo "► Bước 4c: Hook validate cho /ai-test"

if [ "$CODEX_ONLY" -eq 0 ]; then
  CLAUDE_HOOK="$APP_ROOT/.claude/hooks/ai-test-guard.sh"
  if [ -f "$CLAUDE_HOOK" ]; then
    chmod +x "$CLAUDE_HOOK"
    ok "Claude hook ai-test-guard.sh đã +x"
  else
    err "MISSING: $CLAUDE_HOOK"
  fi
fi

HOOK="$APP_ROOT/codex/hooks/ai-test-guard.sh"
if [ -f "$HOOK" ]; then
  chmod +x "$HOOK"
  ok "Codex hook ai-test-guard.sh đã +x"
else
  err "MISSING: $HOOK"
fi

if command -v node &>/dev/null; then
  mkdir -p "$(dirname "$CODEX_HOOKS_FILE")"
  if [ -f "$CODEX_HOOKS_FILE" ]; then
    CODEX_HOOKS_BACKUP="$CODEX_HOOKS_FILE.bak.$(date +%Y%m%d%H%M%S)"
    cp "$CODEX_HOOKS_FILE" "$CODEX_HOOKS_BACKUP"
  else
    CODEX_HOOKS_BACKUP=""
    printf '{"hooks":{}}\n' > "$CODEX_HOOKS_FILE"
  fi
  node - "$CODEX_HOOKS_FILE" "$HOOK" <<'NODE'
const fs = require('fs');
const [file, command] = process.argv.slice(2);
let data = {};
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  data = {};
}
data.hooks = data.hooks && typeof data.hooks === 'object' ? data.hooks : {};
data.hooks.UserPromptSubmit = Array.isArray(data.hooks.UserPromptSubmit)
  ? data.hooks.UserPromptSubmit
  : [];
const exists = data.hooks.UserPromptSubmit.some((group) =>
  Array.isArray(group.hooks) && group.hooks.some((hook) => hook.command === command)
);
if (!exists) {
  data.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command, timeout: 10 }],
  });
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
NODE
  if [ -n "$CODEX_HOOKS_BACKUP" ]; then
    ok "Codex hook đã đăng ký trong ~/.codex/hooks.json (backup: $CODEX_HOOKS_BACKUP)"
  else
    ok "Codex hook đã đăng ký trong ~/.codex/hooks.json"
  fi
else
  warn "Node.js không có trong PATH → bỏ qua bước merge ~/.codex/hooks.json"
fi

if command -v jq &>/dev/null; then
  ok "jq $(jq --version) — hook validate dùng được"
else
  warn "jq chưa cài → hook validate tự bỏ qua (fail open). Cài: sudo apt install jq"
fi

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
echo "     (cần reload để nạp hook validate trong .claude/settings.json)"
echo "  2. Thử lệnh trong Claude Code chat:"
echo ""
echo '     /ai-test "Test trang example.com — verify title" --project=demo --target=https://example.com'
echo ""
echo "     # Hoặc chế độ tương tác — không cần nhớ flag, AI hỏi qua picker:"
echo "     /ai-test-i"
echo ""
echo "     # Codex hoặc AI tool khác, kể cả khi đang mở project khác:"
echo "     # Skill đã cài vào ~/.codex/skills/ai-test, nên có thể gọi bằng tên skill:"
echo "     Dùng skill ai-test để chạy pipeline cho:"
echo '     "Test trang example.com — verify title" --project=demo --target=https://example.com'
echo ""
echo "     # Nếu Codex chưa nạp skill mới, mở phiên mới hoặc dùng fallback:"
echo "     Chạy cat ~/.ai-automation-test-root để lấy APP_ROOT."
echo "     Sau đó đọc <APP_ROOT>/skills/ai-test/SKILL.md và chạy pipeline cho input ở trên."
echo ""
echo "  Thư mục test sẽ được tạo tự động tại:"
echo "  $APP_ROOT/automation/projects/<tên-project>/"
echo ""
