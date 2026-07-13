#!/bin/bash
# Khởi động dashboard server để xem quy trình test real-time
# Truy cập: http://localhost:8765/dashboard.html

cd "$(dirname "$0")/.."

# Tạo status file nếu chưa có — KHÔNG xóa nếu đã có (tránh mất data đang chạy)
if [ ! -f .test-status.json ]; then
  echo '{"step":-1,"step_key":"prep","status":"idle","project":"","message":"Waiting...","timestamp":""}' \
    > .test-status.json
fi

echo "🚀 Dashboard đang chạy tại: http://localhost:8765"
echo "   Mở URL trên Windows browser để xem real-time"
echo "   Ctrl+C để dừng"
echo ""

python3 -m http.server 8765 --bind 0.0.0.0 2>/dev/null \
  || python -m SimpleHTTPServer 8765
