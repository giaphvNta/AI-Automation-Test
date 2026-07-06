# Bước 7 — Chi tiết: Tổng hợp report (Normal mode)

> ⚠️ **BẮT BUỘC — KHÔNG SKIP.** Context dài, token nhiều, heal exhausted đều KHÔNG phải lý do skip. Luôn sinh AI_REPORT.md và lưu source-meta.

## Bước 7a: Detect OS → chọn format path

```bash
if grep -qi microsoft /proc/version 2>/dev/null; then
  OS_TYPE="wsl2"
elif [[ "$(uname)" == "Darwin" ]]; then
  OS_TYPE="macos"
else
  OS_TYPE="linux"
fi
```

| Môi trường | Detect | Format path trong report |
|---|---|---|
| WSL2 (Windows) | `/proc/version` chứa "microsoft" | `\\wsl.localhost\Ubuntu\home\user\...\video.mp4` |
| macOS | `uname` = `Darwin` | `file:///Users/<user>/.../video.mp4` |
| Linux thuần | còn lại | `file:///home/user/.../video.mp4` |

- **WSL2**: thay `/` → `\`, thêm prefix `\\wsl.localhost\Ubuntu`
- **macOS/Linux**: dùng `file://` URI

## Bước 7b: Sinh AI_REPORT.md

> ⚠️ **Path bắt buộc:**
> `$APP_ROOT/automation/projects/<name>/test-results/runs/<run-id>/AI_REPORT.md`
> Run ID lấy từ output run-test.sh, KHÔNG tự đặt.

**Chạy trước khi viết** để xác nhận path đúng:
```bash
RUN_DIR="projects/<name>/test-results/runs/<run-id>"
ls "$RUN_DIR/results.json" && echo "✅ Path OK" || echo "❌ SAI PATH — dừng lại"
```

**Lấy tên thư mục artifacts thật:**
```bash
ls projects/<name>/test-results/runs/<run-id>/artifacts/
```

### Template AI_REPORT.md — PHẢI theo đúng format này

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

## 📂 Đường dẫn

```
📝 Report: <UNC hoặc file:// path đến AI_REPORT.md>
🎬 Full session: <UNC hoặc file:// path đến full-session.mp4>
```

---

## 🎬 Video từng test case

| TC | Title | Video |
|----|-------|-------|
| ✅ TC-1 | <title> | `<UNC path>\artifacts\<exact-dir>\video.mp4` |
| ❌ TC-2 | <title> | `<UNC path>\artifacts\<exact-dir>\video.mp4` |
| ⚠️ TC-3 flaky | <title> | `<UNC path>\artifacts\<exact-dir>\video.mp4` |
| ⛔ TC-17 BLOCKED | hCaptcha — bên thứ ba | — |
```
(Dùng ✅/❌/⚠️/⛔ trong cột TC. KHÔNG có cột Status riêng. BLOCKED dùng ⛔)
(Video path: backtick, KHÔNG dùng markdown link `[text](url)`)

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
- **BẮT BUỘC đủ 3 section chính**: `## 📊 Kết quả tổng hợp`, `## 📂 Đường dẫn`, `## 🎬 Video từng test case`. Thiếu bất kỳ cái nào = report KHÔNG hợp lệ → phải sinh lại.
- Path video phải là `.mp4` (đã convert ở Bước 6b). Tên thư mục lấy từ `ls`, không tự đặt.
- Mỗi test case một dòng riêng trong bảng video.
- Section headers phải có emoji: `## 📊`, `## 📂`, `## 🎬`, `## ❌`, `## ⚠️`, `## ⛔`.

## In ra chat sau khi lưu file

```
✅ Test xong — project `<name>`
📊 Total: N | ✅ Pass: x | ❌ Fail: y | 🔧 Healed: z

📝 Báo cáo: <path theo OS>
🎬 Full session: <path theo OS>/full-session.mp4
🎬 TC-1 <tên>: <path>/<exact-dir>/video.mp4
   (liệt kê từng test — KHÔNG dùng placeholder)
📊 HTML: cd $APP_ROOT/automation && ./scripts/show-report.sh <name> <run-id>
```
