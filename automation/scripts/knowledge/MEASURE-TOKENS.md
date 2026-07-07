# Đo bằng chứng token cho `--kg` (A/B thật)

Token tiêu thụ nằm ở **pha authoring** (agent đọc source/DOM để sinh test), KHÔNG phải lúc chạy test.
Bằng chứng đáng tin = token THẬT từ log phiên Claude Code (`~/.claude/projects/.../*.jsonl`,
có field `usage`), không phải so kích thước file.

Tool: `scripts/measure-tokens.mjs` (alias `npm run kg:tokens`).
Token "billed" = input + output + cache_creation + cache_read.

## Số chuẩn: `<run-dir>/token.json` (tự động, deterministic)

Stop hook `.claude/hooks/token-stop-hook.sh` tự đo token của phiên KHI PHIÊN KẾT THÚC và ghi
`token.json` vào run dir mới nhất (nếu vừa chạy test trong 30'). Đây là **số cuối cùng chính xác**
(đủ cả phần đuôi run + sub-agent opus/sonnet), không phụ thuộc agent nhớ đo.
→ **Khi so A/B, lấy `total_billed` trong `token.json`** thay vì con số 💰 snapshot trong AI_REPORT.md.

Điều kiện đúng: mỗi lần test chạy trong **1 phiên riêng** → token.json = trọn 1 run.

## Quy trình A/B (đo cả 1 lần test từ đầu đến cuối)

Chạy **mỗi biến thể trong 1 phiên Claude Code riêng** để cả file phiên = đúng 1 lần chạy
(tool cộng cả token của sub-agent planner/generator vì chúng ghi chung transcript).

1. **Biến thể ĐỐI CHỨNG (không KG):** mở phiên mới, chạy
   `/ai-test --project=<name> --target=<1 TC cố định>`  → xong đo:
   `npm run kg:tokens -- --latest`
2. **Biến thể KG:** mở phiên mới khác, build graph trước nếu chưa có
   (`npm run kg:build -- <name> --src <app-src>`), rồi chạy
   `/ai-test --project=<name> --target=<đúng TC đó> --kg`  → xong đo:
   `npm run kg:tokens -- --latest`
3. So `TỔNG (billed)` hai lần.

> Nếu lỡ chạy chung 1 phiên: dùng `--from <ISO> --to <ISO>` để bao đúng cửa sổ thời gian 1 run
> (tool in ra khoảng thời gian phiên để đối chiếu). Xem phiên nào: `npm run kg:tokens -- --list`.

## Điều kiện so sánh công bằng
- Cùng project, cùng TC, cùng môi trường/env, cùng model.
- Cùng trạng thái ban đầu (xóa test cũ nếu muốn đo cả pha generate).
- Lặp 2–3 lần mỗi biến thể lấy trung bình (token dao động theo heal/retry).
