---
description: "AI Automation Test — Auto-pilot E2E test: AI tự plan, generate, chạy headless, auto-repair, sinh báo cáo + video"
argument-hint: "<url|file|sheet|description> --project=<name> [--target=<url>] [--max-heal=3] [--interactive]"
---

<!-- AITEST_GUARD ARGS_BEGIN>>>$ARGUMENTS<<<ARGS_END -->
<!-- Marker dòng trên dùng cho hook validate (.claude/hooks/ai-test-guard.sh). KHÔNG xóa. -->

Gọi skill `ai-test` theo instructions trong file /home/user/ai-automation-test/skills/ai-test/SKILL.md với arguments: $ARGUMENTS

⚠️ BẮT BUỘC — đọc theo thứ tự sau trước khi làm bất cứ điều gì:
1. Đọc **TOÀN BỘ** `/home/user/ai-automation-test/skills/ai-test/SKILL.md` trong **MỘT lần Read** (offset=1, limit=2000 — file ~422 dòng).
2. Đọc `/home/user/ai-automation-test/skills/ai-test/rules/RULES.md` (Bước 0 — 16 rules bắt buộc).
3. Xuất self-check: `✅ RULES đã đọc | Nắm: #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16`

TUYỆT ĐỐI KHÔNG đọc theo chunk/nhảy cóc — bỏ sót = test SAI.
