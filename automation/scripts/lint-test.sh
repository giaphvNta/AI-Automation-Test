#!/usr/bin/env bash
# Lint gate: chặn fake assertion / skip annotation TRƯỚC khi chạy test (Rule #15).
# Usage: ./scripts/lint-test.sh <project_name>
# Tự động chạy trong run-test.sh — exit 1 nếu có vi phạm → test không được chạy.
#
# Exemption (dùng hạn chế, phải có căn cứ spec):
#   - Dòng chứa "BLOCKED"   → T bị chặn bởi third-party (hCaptcha/OTP/payment) theo Rule #15
#   - Dòng chứa "lint-allow" → spec yêu cầu rõ ràng, ghi lý do: // lint-allow: <lý do + spec ref>

set -euo pipefail

PROJECT_NAME="${1:?Usage: $0 <project_name>}"
AUTOMATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTS_DIR="$AUTOMATION_DIR/projects/$PROJECT_NAME/tests"

# Chưa có tests → không có gì để lint
[ -d "$TESTS_DIR" ] || exit 0

VIOLATIONS=0

check_block() {  # check_block <regex> <mô tả>
  local pattern="$1" desc="$2" hits
  hits="$(grep -rnE "$pattern" "$TESTS_DIR" --include='*.spec.ts' 2>/dev/null | grep -vE 'BLOCKED|lint-allow' || true)"
  if [ -n "$hits" ]; then
    echo "[lint-test] ❌ $desc:"
    printf '%s\n' "$hits" | sed 's/^/    /'
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
}

# ── BLOCK: fake assertion — assertion luôn đúng bất kể app làm gì (Rule #15)
check_block 'expect\(true\)\s*\.toBe\(true\)|expect\(false\)\s*\.toBe\(false\)|expect\(1\)\s*\.toBe\(1\)|expect\(0\)\s*\.toBe\(0\)' \
  "Fake assertion luôn đúng (expect(x).toBe(x))"
check_block 'expect\([^)]*\|\|\s*true' \
  "'|| true' bên trong expect() — assertion không thể fail"
check_block "=[^;'\"]*\|\|\s*true\b" \
  "Gán biến với '|| true' — giá trị luôn truthy trước khi assert"

# ── BLOCK: che giấu kết quả test (Rule #15 — app bug = test đỏ, không che)
check_block 'test\.(skip|fixme|fail)\s*\(' \
  "test.skip/fixme/fail che giấu kết quả (chỉ được dùng khi T BLOCKED bởi third-party hoặc spec yêu cầu — thêm chữ BLOCKED hoặc lint-allow kèm lý do vào dòng đó)"

# ── WARN: không chặn, chỉ nhắc
WARN="$(grep -rnE 'waitForTimeout\(' "$TESTS_DIR" --include='*.spec.ts' 2>/dev/null | grep -v 'lint-allow' || true)"
if [ -n "$WARN" ]; then
  echo "[lint-test] ⚠️  waitForTimeout — nên dùng auto-wait/expect (không chặn):"
  printf '%s\n' "$WARN" | sed 's/^/    /' | head -10
fi

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "[lint-test] ❌ $VIOLATIONS loại vi phạm Rule #15 — test KHÔNG được chạy."
  echo "[lint-test] Sửa test code theo spec. KHÔNG thêm exemption trừ khi T thực sự bị chặn bởi third-party."
  exit 1
fi

echo "[lint-test] ✅ OK — không có fake assertion/skip"
