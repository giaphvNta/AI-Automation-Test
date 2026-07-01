#!/usr/bin/env bash
# Chạy bên trong container: khởi Xvfb + VNC + noVNC rồi chạy test headed.
# Không gọi trực tiếp — gọi qua run-test.sh với TEST_LIVE=1

set -euo pipefail

PROJECT_NAME="${1:?missing project name}"
shift || true
SPEC_PATH="${SPEC_FILE:-projects/$PROJECT_NAME/tests/}"

# Khởi virtual display. Default 1280×720 = khớp viewport Desktop Chrome của Playwright
# → browser phủ kín màn hình VNC, không còn khoảng đen bên phải.
# Project nào dùng viewport rộng hơn (vd 1400) → set VNC_GEOMETRY trong projects/<name>/.env.
GEOMETRY="${VNC_GEOMETRY:-1280x720}"
export DISPLAY=:99
Xvfb :99 -screen 0 "${GEOMETRY}x24" -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 0.8

# VNC server (không password, chỉ localhost)
x11vnc -display :99 -forever -nopw -shared -quiet -rfbport 5900 -bg

# noVNC websocket proxy → HTTP tại port 6080
websockify --web=/usr/share/novnc/ --daemon --log-file=/tmp/novnc.log 6080 localhost:5900
sleep 0.5

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🖥️  Live view:  http://localhost:6080/vnc.html       ║"
echo "║     Mở link → nhấn Connect → test sẽ bắt đầu sau   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Countdown 12 giây để user kịp mở browser và nhấn Connect
for i in 12 11 10 9 8 7 6 5 4 3 2 1; do
  printf "\r  ⏳ Bắt đầu test sau %2ds — mở http://localhost:6080/vnc.html ngay" "$i"
  sleep 1
done
echo ""
echo "  ▶  Bắt đầu chạy test..."
echo ""

# Chạy test headed (chậm lại 600ms/action để dễ quan sát)
DISPLAY=:99 npx playwright test "$SPEC_PATH" "$@"
EXIT_CODE=$?

# Cleanup
kill $XVFB_PID 2>/dev/null || true
pkill x11vnc 2>/dev/null || true

exit $EXIT_CODE
