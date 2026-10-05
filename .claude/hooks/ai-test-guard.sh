#!/usr/bin/env bash
# ai-test-guard.sh — UserPromptSubmit hook (Validate & chặn)
#
# Chặn lệnh /ai-test khi thiếu --project hoặc thiếu input, in hướng dẫn rồi dừng.
# /ai-test-i (interactive) KHÔNG bị chặn vì nó tự hỏi qua picker (command file không có marker).
#
# Cơ chế:
#   - commands/ai-test.md nhúng marker: <!-- AITEST_GUARD ARGS_BEGIN>>>$ARGUMENTS<<<ARGS_END -->
#   - UserPromptSubmit nhận prompt ĐÃ expand (xác nhận từ docs Claude Code), nên đọc được
#     chuỗi arguments thật trong marker.
#   - Block bằng JSON stdout {"decision":"block","reason":"..."} (exit 0).
#
# Triết lý: FAIL OPEN. Mọi tình huống bất định (không có jq, parse lỗi, không phải lệnh ai-test)
# đều exit 0 (cho qua) — không bao giờ chặn nhầm prompt thường.

# Không có jq → bỏ qua validate (graceful).
command -v jq >/dev/null 2>&1 || exit 0

payload="$(cat)"
prompt="$(printf '%s' "$payload" | jq -r '.prompt // empty' 2>/dev/null)"
[ -z "$prompt" ] && exit 0

# Chỉ xử lý prompt mang marker của lệnh /ai-test (non-interactive).
marker_line="$(printf '%s\n' "$prompt" | grep -m1 'AITEST_GUARD ARGS_BEGIN>>>')"
[ -z "$marker_line" ] && exit 0

# Trích chuỗi arguments giữa ARGS_BEGIN>>> và <<<ARGS_END.
args="$(printf '%s' "$marker_line" | sed -E 's/.*ARGS_BEGIN>>>(.*)<<<ARGS_END.*/\1/')"

# --project= hoặc --project <value> có chưa?
has_project=0
if printf '%s' "$args" | grep -Eq -- '--project([= ])[^ ]'; then has_project=1; fi

# Input: bỏ hết token --xxx, phần còn lại trống = không có input.
stripped="$(printf '%s' "$args" | sed -E 's/--[^ ]+//g' | xargs 2>/dev/null)"
has_input=0
[ -n "$stripped" ] && has_input=1

# --rerun chạy lại test cũ → chỉ cần --project, input có thể trống.
if printf '%s' "$args" | grep -Eq -- '(^| )--rerun( |$)'; then has_input=1; fi

problems=""
[ "$has_project" -eq 0 ] && problems="${problems}\n• Thiếu --project=<tên-project>"
[ "$has_input" -eq 0 ] && problems="${problems}\n• Thiếu input (Google Sheet URL / URL web / file spec / mô tả)"

# Đủ tham số → cho qua.
[ -z "$problems" ] && exit 0

reason="$(printf '🚫 Lệnh /ai-test thiếu tham số bắt buộc:%b\n\n→ Bổ sung flag, ví dụ:\n   /ai-test "mô tả test" --project=demo\n→ Hoặc gõ /ai-test-i để nhập tương tác (picker chọn input + project + cờ mode).' "$problems")"

jq -nc --arg r "$reason" '{decision:"block", reason:$r}'
exit 0
