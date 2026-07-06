#!/usr/bin/env bash
# Chạy BÊN TRONG container (gọi qua convert-videos.sh, không gọi trực tiếp).
# Convert webm→mp4 song song, rồi ghép full-session.mp4 theo thứ tự chạy test (mtime).

set -uo pipefail

RESULTS="${1:?missing artifacts path}"
cd /work

# Thứ tự chạy test = mtime của webm. KHÔNG sort theo tên thư mục — tên chứa hash, sort tên = thứ tự lộn xộn.
ORDER="$(find "$RESULTS" -name 'video.webm' -printf '%T@ %p\n' | sort -n | cut -d' ' -f2-)"
if [ -z "$ORDER" ]; then
  echo "[convert-videos] Không có video.webm — bỏ qua (fast mode hoặc đã convert trước đó)"
  exit 0
fi

# Convert song song 4 luồng
printf '%s\n' "$ORDER" | xargs -P4 -I{} bash -c \
  'ffmpeg -i "$1" -c:v libx264 -preset fast -movflags +faststart "${1%.webm}.mp4" -y 2>/dev/null && rm "$1"' _ {}

# Ghép theo thứ tự đã capture TRƯỚC khi convert (mtime mp4 là giờ convert, không dùng được)
CONCAT_LIST="$(mktemp)"
printf '%s\n' "$ORDER" | while read -r f; do
  mp4="${f%.webm}.mp4"
  [ -f "$mp4" ] && echo "file '/work/$mp4'"
done > "$CONCAT_LIST"

if [ -s "$CONCAT_LIST" ]; then
  ffmpeg -f concat -safe 0 -i "$CONCAT_LIST" \
    -c:v libx264 -preset fast -movflags +faststart \
    "$RESULTS/full-session.mp4" -y 2>/dev/null && echo "[convert-videos] full-session.mp4 OK"
fi
rm -f "$CONCAT_LIST"
