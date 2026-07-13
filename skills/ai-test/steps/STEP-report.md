# Pha 4 FINALIZE — Chi tiết: Tổng hợp report (Normal mode)

> ⚠️ **BẮT BUỘC — KHÔNG SKIP.** Context dài, token nhiều, heal exhausted đều KHÔNG phải lý do skip. Luôn sinh AI_REPORT.md và lưu source-meta.
> Trong pipeline 4 pha, mặc định gọi `node scripts/pipeline/finalize-run.mjs ...`; file này chỉ là chi tiết format/fallback khi cần sửa report thủ công.

> ⚠️ **CẬP NHẬT DASHBOARD (BẮT BUỘC — hay bị sót):**
> - Ngay khi vào finalize: `bash scripts/update-status.sh 4 finalize "<name>" "Finalizing report..." 0 <mode>`
> - Sau khi xong HẾT: `bash scripts/update-status.sh 4 finalize "<name>" "Done" 0 <mode> done`
> Thiếu lệnh `done` cuối → dashboard kẹt ở "Converting videos..." dù đã chạy xong. `<mode>` = `live` nếu `--live`, else `normal`.
> `finalize-run.mjs` tự mark checklist run-level và reset project-level về `idle`; lệnh `update-status.sh ... done` cuối chỉ đóng trạng thái dashboard, không ghi đè checklist idle.

## Sinh khung report bằng SCRIPT (KHÔNG tự ráp bằng tay)

> ⚠️ **BẮT BUỘC dùng script này thay vì tự viết 📊/💰/📂/🎬 bằng tay.** Script đọc trực tiếp
> `results.json` (path ảnh/video THẬT — không đoán tên thư mục) + đo token — 0 token AI cho phần này.
> AI chỉ cần viết phần phân tích lỗi (7b tiếp theo).

```bash
cd $APP_ROOT/automation
node scripts/report/gen-report.mjs <name> <run-id> --mode=<normal|live> --from="$RUN_STARTED_AT" > /tmp/report-skeleton.md
```
`RUN_STARTED_AT` lấy ở Pha 3 ngay trước `run-test.sh`. Nếu chạy report thủ công mà không có biến này,
có thể bỏ `--from`, nhưng token có thể bị lẫn toàn bộ phiên Claude hiện tại.
Script tự đọc `<run-dir>/.run-state.json` (do `merge-heal.mjs` ghi) để biết TC nào đã heal — KHÔNG
cần AI tự nhớ/truyền `--healed-tc`. Không có heal loop (chạy tay ngoài pipeline) mới cần flag đó.
Script tự detect OS (wsl2/macos/linux) cho path.

**Xác nhận path đúng trước khi dùng kết quả:**
```bash
ls "projects/<name>/test-results/runs/<run-id>/results.json" && echo "✅ Path OK" || echo "❌ SAI PATH — dừng lại"
```

Ghi `/tmp/report-skeleton.md` vào đầu `AI_REPORT.md` (thêm header Run ID/Date/Mode/Spec ở trên), rồi **APPEND** các section phân tích lỗi/flaky/blocked ở dưới (xem template đầy đủ bên dưới để biết cấu trúc các section này).

> Script lỗi/không chạy được (hiếm) → fallback thủ công: xem README cũ trong git history của file này, hoặc tự ráp theo template dưới — nhưng ưu tiên sửa script hơn là bỏ qua nó.

### Template AI_REPORT.md — PHẢI theo đúng format này (📊/💰/📂/🎬 do script sinh, còn lại AI viết)

```markdown
# AI Test Report — <project-name>

**Run ID:** <run-id>
**Date:** YYYY-MM-DD
**Mode:** Headless | Live (VNC)
**Spec:** <tên spec / Google Sheet URL>

---

## 📊 Kết quả tổng hợp

| Metric | Count |
|--------|-------|
| Total | N |
| ✅ Pass | x |
| ❌ Fail | y |
| ⚠️ Flaky (healed by retry) | z |
| 🔧 Healed | h |

---

## 💰 Token tiêu thụ (cả lần chạy)

| Loại | Token |
|------|-------|
| input | <i> |
| output | <o> |
| cache_creation | <cc> |
| cache_read | <cr> |
| **TỔNG (billed)** | **<total>** |

> **Mặc định luôn đo** mỗi lần chạy (không phải cờ, không opt-in) bằng `npm run kg:tokens` (đọc log phiên Claude Code). Nếu chạy `--kg` thì ghi chú thêm để so A/B.
> **Số cuối cùng chính xác** do **Stop hook** (`.claude/hooks/token-stop-hook.sh`) tự ghi vào `<run-dir>/token.json` khi phiên kết thúc — deterministic, đủ cả phần đuôi run + sub-agent. Con số 💰 trong report này là snapshot lúc viết report (có thể thiếu phần sau report) → **dùng `token.json` làm nguồn chuẩn khi so A/B.**

---

## 📂 Đường dẫn

```
📝 Report: <UNC hoặc file:// path đến AI_REPORT.md>
🎬 Full session: <UNC hoặc file:// path đến full-session.mp4>
```

---

## 🎬 Video & ảnh từng test case

| TC | Title | Ảnh (evidence) | Video |
|----|-------|----------------|-------|
| ✅ TC-1 | <title> | `<UNC path>\artifacts\<exact-dir>\evidence.png` | `<UNC path>\artifacts\<exact-dir>\video.mp4` |
| ❌ TC-2 | <title> | `<UNC path>\artifacts\<exact-dir>\test-failed-1.png` | `<UNC path>\artifacts\<exact-dir>\video.mp4` |
| ⚠️ TC-3 flaky | <title> | `<UNC path>\artifacts\<exact-dir>\evidence.png` | `<UNC path>\artifacts\<exact-dir>\video.mp4` |
| ⛔ TC-17 BLOCKED | hCaptcha — bên thứ ba | — | — |
```
(Dùng ✅/❌/⚠️/⛔ trong cột TC. KHÔNG có cột Status riêng. BLOCKED dùng ⛔)
(Cột Ảnh: TC pass → `evidence.png`; TC fail → `test-failed-1.png`; lấy tên thư mục thật từ `ls` như video. Không có ảnh → `—`)
(Video/ảnh path: backtick, KHÔNG dùng markdown link `[text](url)`)

```markdown
---

## ❌ TC-X: <tên test> — Phân tích lỗi
(BẮT BUỘC cho từng TC fail)

**Lỗi:**
```
<error message thực tế>
```

**Root cause:**
- Loại lỗi: [Selector sai | Assertion fail | App bug | Data thiếu | Timeout | Môi trường]
- Giải thích: <nguyên nhân cụ thể bằng tiếng Việt>

**Vị trí code lỗi:**
- Test file: `projects/<name>/tests/<file>.spec.ts` dòng X–Y
- App code (nếu là app bug): `<file>:<line>` — <mô tả>

**Hướng fix:**
- <hành động cụ thể>

---

## ⚠️ Flaky Tests
(Chỉ có nếu có TC flaky)

| TC | Title | Ghi chú |
|----|-------|---------|
| TC-X | <title> | Passed sau retry #N. <lý do> |

---

## ⛔ Blocked Tests
(Chỉ có nếu có TC bị block bởi third-party)

| TC | Lý do | Giải pháp tiếp theo |
|----|-------|---------------------|
| TC-17 | hCaptcha bên thứ ba — không thể tự động | Cung cấp test key hoặc mock |

---

📊 HTML Report: `cd $APP_ROOT/automation && ./scripts/show-report.sh <name> <run-id>`
```

## Quy tắc bắt buộc khi viết report

- **Phần văn bản mô tả viết bằng TIẾNG VIỆT** — summary, phân tích lỗi, root cause, hướng fix, ghi chú. KHÔNG viết bằng tiếng Anh.
- **Giữ nguyên nhãn cố định**: `Run ID`, `Date`, `Mode`, `Total`, `Pass`, `Fail`, tên file, log, code.
- **BẮT BUỘC đủ 4 section chính**: `## 📊 Kết quả tổng hợp`, `## 💰 Token tiêu thụ`, `## 📂 Đường dẫn`, `## 🎬 Video & ảnh từng test case` (bảng phải có cột **Ảnh** + **Video**). Thiếu bất kỳ cái nào = report KHÔNG hợp lệ → phải sinh lại.
- **AI_REPORT.md là báo cáo CHÍNH THỨC** (đã merge heal — status + video/ảnh đúng). Playwright HTML report (`show-report.sh`, localhost:9323) chỉ là ảnh chụp lần chạy gốc, KHÔNG cập nhật sau heal → không dùng làm nguồn kết luận.
- Path video phải là `.mp4` (đã convert ở Bước 6b). Tên thư mục lấy từ `ls`, không tự đặt.
- Mỗi test case một dòng riêng trong bảng video.
- Section headers phải có emoji: `## 📊`, `## 📂`, `## 🎬`, `## ❌`, `## ⚠️`, `## ⛔`.

## In ra chat sau khi lưu file

```
✅ Test xong — project `<name>`
📊 Total: N | ✅ Pass: x | ❌ Fail: y | 🔧 Healed: z
💰 Token: <total> (billed)

📝 Báo cáo: <path theo OS>   ← nguồn CHÍNH THỨC (đã merge heal)
🎬 Full session: <path theo OS>/full-session.mp4
🎬 TC-1 <tên>: <path>/<exact-dir>/video.mp4
   (liệt kê từng test — KHÔNG dùng placeholder)
📊 HTML (chỉ tham khảo, là ảnh trước heal): cd $APP_ROOT/automation && ./scripts/show-report.sh <name> <run-id>
```
