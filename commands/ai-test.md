---
description: "AI Automation Test — Auto-pilot E2E test: AI tự plan, generate, chạy headless, auto-repair, sinh báo cáo + video"
argument-hint: "<url|file|sheet|description> --project=<name> [--target=<url>] [--max-heal=3] [--interactive]"
---

<!-- AITEST_GUARD ARGS_BEGIN>>>$ARGUMENTS<<<ARGS_END -->
<!-- Marker dòng trên dùng cho hook validate (.claude/hooks/ai-test-guard.sh). KHÔNG xóa. -->

Gọi skill `ai-test` theo instructions trong file /home/user/ai-automation-test/skills/ai-test/SKILL.md với arguments: $ARGUMENTS

⚠️ BẮT BUỘC: Đọc **TOÀN BỘ** SKILL.md trong **MỘT lần Read** (offset=1, limit=2000 — file chỉ ~908 dòng nên thừa sức đọc hết). TUYỆT ĐỐI KHÔNG đọc theo chunk/nhảy cóc: đọc thiếu dòng sẽ bỏ sót Bước 1b (hash skip/rerun), Bước 3b (seed), và luật env (confirm + restore) → thực hiện test SAI.
