# RULES — Nguyên tắc bất biến (16 rules)

> **Bước 0 — BẮT BUỘC:** Đọc file này NGAY SAU SKILL.md. Sau khi đọc xong, xuất dòng self-check:
> ```
> ✅ RULES đã đọc | Nắm: #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16
> ```
> Nếu không có dòng self-check này → coi như chưa đọc rules → vi phạm INC-04.

---

1. **Auto mode default** — không hỏi giữa các bước. Làm từ đầu đến cuối.
0. **AI_REPORT.md nằm trong run directory** — `projects/<name>/test-results/runs/<run-id>/AI_REPORT.md`. TUYỆT ĐỐI KHÔNG ghi vào path nào khác.
2. **`--interactive`** — bật confirm trước khi chạy test thật.
3. **CWD bắt buộc** `/home/user/ai-automation-test/automation/`.
4. **`--project=<name>` BẮT BUỘC** — không tự đoán, hỏi nếu thiếu.
5. **Headless only** — KHÔNG mở browser, KHÔNG screenshot màn hình host (nta-no-screen-capture.md).
6. **Output: in path file** — dev tự mở, KHÔNG mở visual trong VSCode.
7. **Thiếu data → tự xử lý** — fake data hoặc seed tự động, KHÔNG hỏi user (trừ Rule #15).
8. **`--fast`** = `TEST_FAST=1`. Nghĩa: tắt video/trace, 4 workers, skip heal, compact report 3 dòng. KHÔNG có nghĩa "skip regeneration".
9. **Đổi env container → BẮT BUỘC confirm trước** — in rõ VAR=old→new, chờ "Yes", restore sau test.
10. **KHÔNG dừng giữa test để hỏi** — Bước 6 không hỏi, không dừng dù phát hiện bug. Ghi nhận vào report, chạy tiếp.
11. **KHÔNG git history khi test** — không `git log/diff/blame/show` trong quá trình test.
12. **Bước 6b BẮT BUỘC** — convert video webm→mp4 sau MỌI lần test. Không skip dù 100% pass.
13. **Bước 7 + 7e BẮT BUỘC** — sinh AI_REPORT.md và lưu source-meta. Context dài/token nhiều KHÔNG phải lý do skip.
14. **Source-meta BẮT BUỘC lưu** sau mỗi run (Bước 7e) — không lưu = lần sau phải generate lại từ đầu.
15. **TC bị chặn bởi plugin bên thứ ba → HỎI trước, KHÔNG fake-pass** — TUYỆT ĐỐI KHÔNG dùng:
    - `expect(true).toBe(true)` — assertion giả
    - `|| true` trong điều kiện kiểm tra
    - `expect(1).toBe(1)` hoặc bất kỳ assertion luôn đúng bất kể app làm gì
    - Comment "verified manually" thay cho assertion thật

    Khi TC bị block bởi hCaptcha/reCAPTCHA/OTP/payment SDK: dừng ở Bước 3b–5, hỏi user qua AskUserQuestion với 2 option: **(1) Cung cấp key/credential test** hoặc **(2) Mock lớp chặn**. User không chọn → đánh dấu **BLOCKED** trong report.

16. **KHÔNG tự đọc `.env`/credential** — Trước khi đọc `.env`, `*.key`, `*secret*`, `service-auth.json`, hoặc file config chứa key/token của project, PHẢI hỏi user: mục đích + tên file. Chờ đồng ý. Vi phạm 1 lần = lỗi nghiêm trọng.

---

## Quy tắc seed data bổ sung (áp dụng ở Bước 3b)

**Seed #0:** Seed theo spec, không theo app config — Số lượng records lấy từ spec/sheet (vd: "lần thứ 6 → 403" = seed đúng 5 records). TUYỆT ĐỐI KHÔNG đọc app config (`tinker`, `grep config/`, `.env app`) để lấy threshold — làm vậy che giấu bug: app config sai vs spec → test vẫn xanh.

**Seed AI_KEY:** Mọi record seed phải có marker phân biệt — dùng field có thể nhận diện (vd: `mailaddress LIKE 'e2e-ai-tc%'` hoặc field note/memo chứa `E2E_AI_<TC_ID>`). Cleanup chỉ xóa records có marker này, KHÔNG xóa data không có marker.

**KHÔNG xóa data không có marker** — `DELETE FROM table WHERE ip=...` mà không lọc theo AI_KEY = xóa data production. Vi phạm nghiêm trọng.
