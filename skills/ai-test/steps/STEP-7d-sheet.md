# Bước 7d — Chi tiết: Ghi kết quả vào Google Sheet / Google Doc

Áp dụng với **mọi project, mọi mode** (normal, fast, live). Chạy sau khi sinh report.

## Quy tắc kích hoạt

- Chỉ ghi khi user truyền **`--sheet=<url>`** hoặc **`--doc=<url>`** tường minh
- Input là Google Sheet/Doc URL **KHÔNG tự động ghi ngược** — phải có flag mới ghi
- Không có flag → bỏ qua toàn bộ bước này, không báo lỗi

## Xác định Sheet URL để ghi

```bash
# Chỉ lấy từ flag --sheet — không đọc source-meta, không đọc .env
SHEET_URL="<giá trị --sheet nếu user truyền>"
# Không có --sheet → bỏ qua
```

## Ghi về Google Sheet

Tab ghi = giá trị `--sheet-tab` từ Bước 1. Không có `--sheet-tab` → script tự detect từ header.

> ⚠️ **Sheet tiếng Nhật hoặc có nhiều cột kết quả (結果1, 結果2...):** Script auto-detect có thể match nhầm cột spec (`期待結果`) thay vì cột kết quả test (`結果2`). Khi sheet dùng tiếng Nhật hoặc có pattern "結果N", **BẮT BUỘC chỉ định tường minh** `--result-col="結果2"` (hoặc tên cột user yêu cầu). **KHÔNG để auto-detect quyết định.**

```bash
cd $APP_ROOT/automation
node scripts/write-results-to-sheet.mjs \
  --sheet="$SHEET_URL" \
  --project=<name> \
  --run-id=<run-id> \
  --healed=<n> \
  ${SHEET_TAB_FLAG:+--sheet-tab="$SHEET_TAB_FLAG"}
```

### Cột script tự nhận diện và ghi

| Script nhận diện cột | Ghi gì |
|---|---|
| `Chrome`, `Chromium` | Kết quả trên Chromium (`✅ PASS` / `❌ FAIL`) |
| `Safari`, `WebKit` | Kết quả trên WebKit (nếu có) |
| `Firefox` | Kết quả trên Firefox (nếu có) |
| `Status`, `Kết quả`, `結果2`, `結果1` | Kết quả tổng hợp |
| `Tester`, `Tested by`, `QA` | `Claude AI` |
| `Test date`, `Date`, `Ngày` | Ngày giờ chạy |
| `Notes`, `Error`, `Ghi chú` | Error message nếu fail |

Match test case theo TC-number (`TC-01`...) trước, fallback fuzzy text.

Nếu cột không nhận diện được → script in headers và exit. Chỉ định thủ công:
```bash
node scripts/write-results-to-sheet.mjs ... \
  --match-col="Test Case" --result-col="Status" --date-col="Test date" --tester-col="Tester"
```

### Sheet lịch sử (tracking mode)

Dùng khi muốn append dòng mới thay vì update dòng cũ:
```bash
node scripts/write-results-to-sheet.mjs \
  --mode=tracking \
  --sheet="<tracking-sheet-url>" \
  --project=<name> \
  --run-id=<run-id> \
  --healed=<n>
```

## Ghi về Google Doc (`--doc=<url>`)

```bash
cd $APP_ROOT/automation
node scripts/write-results-to-doc.mjs \
  --doc="<doc-url>" \
  --project=<name> \
  --run-id=<run-id> \
  --healed=<n>
```

Append 1 section vào cuối Doc: separator + date + status + đường dẫn report/video.

## Quy tắc chung

- Không báo lỗi nếu `--sheet`/`--doc` không được truyền — bỏ qua hoàn toàn
- Path Report/Video: tự detect OS (WSL2 → UNC path, Linux/macOS → `file://`)
- Cả hai có thể dùng cùng lúc: `--sheet=<url> --doc=<url>`
