---
description: "AI Automation Test (Interactive) — gõ /ai-test-i, chọn input + project + cờ qua picker rồi AI tự chạy E2E test"
argument-hint: "[không cần flag — thiếu gì sẽ hỏi qua picker]"
---

Gọi skill `ai-test-i` theo instructions trong file {{APP_ROOT}}/skills/ai-test-i/SKILL.md với arguments: $ARGUMENTS

⚠️ BẮT BUỘC:
1. Đọc **TOÀN BỘ** `{{APP_ROOT}}/skills/ai-test-i/SKILL.md` trong **MỘT lần Read** trước khi làm.
2. Skill này thu thập input / `--project` / cờ mode còn thiếu qua **AskUserQuestion (picker)**, KHÔNG báo lỗi "thiếu argument".
3. Sau khi đủ tham số, đọc **TOÀN BỘ** `{{APP_ROOT}}/skills/ai-test/SKILL.md` (1 Read), rồi đọc `{{APP_ROOT}}/skills/ai-test/rules/RULES.md`, xuất self-check, và thực thi đúng quy trình 7 bước.
