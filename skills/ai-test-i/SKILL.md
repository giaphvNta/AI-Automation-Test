---
name: ai-test-i
description: "AI Automation Test (Interactive). Gõ /ai-test-i → AI hỏi input + project + cờ mode qua picker (AskUserQuestion), rồi chạy đúng pipeline 4 pha của ai-test."
argument-hint: "[không cần flag — thiếu gì sẽ hỏi qua picker]"
---

# AI Automation Test — Interactive Front-end (SKILL)

> Skill này **KHÔNG** lặp lại logic test. Nó chỉ làm 1 việc: **thu thập tham số còn thiếu
> qua picker**, rồi gọi lại **toàn bộ pipeline của `skills/ai-test/SKILL.md`**.
> Mọi quy tắc test (hash skip/rerun, seed, env confirm/restore, heal, report, source-meta)
> đều theo `ai-test`, không sửa đổi.

## Paths — TỰ SUY RA, KHÔNG hardcode

**APP_ROOT = đường dẫn bạn vừa Read file này, bỏ đuôi `/skills/ai-test-i/SKILL.md`.**
Tool có thể clone ở path bất kỳ, máy bất kỳ (Linux/WSL/macOS) — luôn suy APP_ROOT từ path đọc file, không dùng path cứng.

```
AI_TEST_SKILL = $APP_ROOT/skills/ai-test/SKILL.md
PROJECTS      = $APP_ROOT/automation/projects
```

## Nguyên tắc

1. **Chỉ hỏi cái còn thiếu** — tham số nào user đã truyền trong `$ARGUMENTS` thì dùng luôn, KHÔNG hỏi lại.
2. **Picker chứ không báo lỗi** — thiếu `--project` hay input thì hiện picker, KHÔNG trả lời "thiếu argument".
3. **Picker chỉ dùng ở Phần A** (thu thập). Từ Phần B trở đi vào pipeline `ai-test` là **auto mode** — không hỏi giữa chừng (theo nguyên tắc bất biến #10 của `ai-test`).
4. **Không tự đoán** — `--project` và input phải do user chọn/nhập, không bịa.

---

## Phần A — Thu thập tham số (qua AskUserQuestion)

### A0. Parse `$ARGUMENTS` đã có

Tách từ `$ARGUMENTS`:
- **input** = token đầu tiên KHÔNG bắt đầu bằng `--` (URL / path / mô tả trong ngoặc kép).
- **project** = giá trị của `--project=...`.
- **mode flags** = các cờ boolean đã có (`--fast`, `--live`, `--screens`, `--kg`, `--kg-rebuild`, `--interactive`, `--rerun`).
- **passthrough** = mọi cờ khác (`--target=`, `--max-heal=`, `--only=`, `--sheet=`, `--sheet-tab=`, `--doc=`) → giữ nguyên, KHÔNG hỏi.

Xác định `MISSING_INPUT` (chưa có input) và `MISSING_PROJECT` (chưa có `--project`).
Nếu **không thiếu gì** → bỏ qua Phần A, sang thẳng Phần B.

### A1. Lấy danh sách project (để dựng options)

```bash
ls -1t $APP_ROOT/automation/projects/ 2>/dev/null
```
Lấy tối đa **4 project mới nhất** làm options cho câu hỏi project. Project khác / project mới → user bấm **"Other"** để nhập tên.

### A2. Gọi AskUserQuestion — chỉ đưa các câu hỏi cho phần còn thiếu

Gộp tất cả câu hỏi cần thiết vào **một** lần gọi AskUserQuestion (tối đa 4 câu):

- **Câu INPUT** (chỉ khi `MISSING_INPUT`):
  - question: `"Bạn muốn test gì? Bấm \"Other\" để dán thẳng URL / path / mô tả ngay bây giờ — nhanh nhất. Hoặc chọn loại nguồn rồi mình hỏi giá trị sau."`
  - header: `"Nguồn test"`, multiSelect: false
  - options: `Google Sheet URL`, `URL trang web`, `File spec (.md/.pdf/.xlsx/.csv)`, `Mô tả tự nhiên`
  - → Nếu user bấm **Other** và dán giá trị → đó CHÍNH là input, dùng luôn.
  - → Nếu user chọn 1 loại nguồn (không kèm giá trị thật) → **VIẾT TEXT THƯỜNG trong chat** (KHÔNG gọi AskUserQuestion thêm lần nào nữa) để hỏi giá trị: `"Dán <loại nguồn> vào đây nhé:"`. Chờ user trả lời trong chat rồi mới sang A2b/A3.

> ⚠️ `AskUserQuestion` CHỈ dùng cho multiple-choice (phải có `options` array ≥ 2 phần tử). TUYỆT ĐỐI KHÔNG gọi `AskUserQuestion` để hỏi URL, path, hoặc bất kỳ giá trị free-text nào — sẽ báo `InputValidationError`. Với free-text: in câu hỏi bằng text thường trong chat rồi chờ user nhập.

- **Câu PROJECT** (chỉ khi `MISSING_PROJECT`):
  - question: `"Chạy test vào --project nào? (Other = nhập project mới)"`
  - header: `"Project"`, multiSelect: false
  - options: 4 project mới nhất từ A1. (Nếu chỉ có <2 project, vẫn đủ vì luôn có "Other".)

- **Câu TỐC ĐỘ/HIỂN THỊ** (luôn hỏi — **radio, chọn 1**):
  - question: `"Chọn chế độ chạy (chỉ 1 — --fast và --live loại trừ nhau)"`
  - header: `"Chế độ"`, multiSelect: **false**
  - options (single-select — TUYỆT ĐỐI không cho chọn cả --fast lẫn --live):
    - `Normal (mặc định)` — desc: `"Headless đầy đủ: video/trace/heal + report chi tiết"`
    - `--fast` — desc: `"Nhanh, tiết kiệm token: tắt video/trace, 4 workers, bỏ heal, report 3 dòng"`
    - `--live` — desc: `"Xem trực tiếp qua VNC (http://localhost:6080/vnc.html), chậm 600ms/action. Browser chạy trong container — KHÔNG đụng host"`
  - Map: chọn `Normal` → không thêm cờ tốc độ nào.

- **Câu TỐI ƯU** (luôn hỏi — **multiSelect, chọn nhiều/bỏ trống**):
  - question: `"Bật tối ưu authoring? (chọn nhiều hoặc bỏ trống)"`
  - header: `"Tối ưu"`, multiSelect: **true**
  - options:
    - `--screens` — desc: `"Dùng knowledge map màn hình (SCREENS.md): tái dùng selector/flow/data recipe → nhanh + chính xác + ít heal. Lần đầu crawl 1 lần"`
    - `--kg` — desc: `"Dùng Knowledge Graph (endpoint/route index từ source bằng Tree-sitter) → giảm token pha authoring. Cần build 1 lần: npm run kg:build"`
  - Ghi chú: `--interactive` (confirm từng bước), `--rerun` (chạy lại test cũ), `--kg-rebuild` (ép build lại KG) — gõ trực tiếp trong `$ARGUMENTS` hoặc qua "Other" nếu cần (đã auto-detect ở A0). `--fast`✕`--live` đã tách radio nên không thể chọn cả hai.

> Lưu ý: nếu user đã truyền sẵn cả input lẫn `--project` trong `$ARGUMENTS` thì A2 chỉ còn 2 câu (TỐC ĐỘ + TỐI ƯU), hoặc bỏ qua câu nào user đã truyền sẵn cờ tương ứng. Nếu `$ARGUMENTS` lỡ có cả `--fast` và `--live` → cảnh báo và yêu cầu chọn 1.

### A2b. Hỏi thêm khi input là Google Sheet (chỉ khi nguồn = Google Sheet)

Chỉ chạy bước này khi input cuối cùng (sau A2) là một **Google Sheet URL** (chứa `docs.google.com/spreadsheets`).
`AskUserQuestion` KHÔNG render được form nhiều field, nên thu thập tab + ghi-ngược qua **options + Other** trong **một** lần gọi (tối đa 2 câu). Câu nào user đã truyền sẵn flag tương ứng trong `$ARGUMENTS` (A0) thì **bỏ qua câu đó**.

- **Câu TAB** (chỉ hỏi khi A0 CHƯA có `--sheet-tab`):
  - question: `"Đọc/ghi ở tab nào của Sheet? Bấm \"Other\" để gõ tên tab cụ thể."`
  - header: `"Tab"`, multiSelect: false
  - options:
    - `Auto-detect` — desc: `"Để script tự dò tab từ header (bỏ trống --sheet-tab)"`
  - → Chọn `Auto-detect` → KHÔNG thêm `--sheet-tab`. Bấm `Other` nhập tên → `--sheet-tab="<tên>"`.

- **Câu GHI NGƯỢC** (chỉ hỏi khi A0 CHƯA có `--sheet`):
  - question: `"Sau khi test xong, ghi kết quả ngược lại chính Google Sheet này?"`
  - header: `"Ghi ngược"`, multiSelect: false
  - options:
    - `Không ghi` — desc: `"Chỉ đọc, không cập nhật Sheet (mặc định an toàn — đúng hành vi opt-in của ai-test)"`
    - `Có, ghi ngược` — desc: `"Thêm --sheet=<chính URL này> để ghi kết quả ở Bước 7d. Cần service-auth.json"`
  - → `Không ghi` → KHÔNG thêm `--sheet`. `Có, ghi ngược` → `--sheet="<input-url>"` (dùng lại đúng URL input).

> Mặc định an toàn: input là Google Sheet **không tự động ghi ngược** (theo `ai-test/SKILL.md`). Chỉ khi user chọn "Có, ghi ngược" mới thêm `--sheet`.

### A3. Ráp chuỗi tham số cuối

Ghép theo thứ tự: `<input> --project=<name> <mode-flags> <sheet-flags> <passthrough>`

- `<input>`: nếu là mô tả tự nhiên có khoảng trắng → bọc trong ngoặc kép.
- `<mode-flags>`: các cờ user chọn ở câu MODE (có thể rỗng).
- `<sheet-flags>`: `--sheet-tab` và/hoặc `--sheet` thu được ở A2b (rỗng nếu input không phải Sheet hoặc user đã truyền sẵn).
- `<passthrough>`: giữ nguyên các cờ khác từ A0.

In ra chat 1 dòng xác nhận (KHÔNG chờ confirm, chạy luôn):
```
▶ Chạy: /ai-test <chuỗi-tham-số-đã-ráp>
```

---

## Phần B — Thực thi pipeline ai-test

1. **Đọc TOÀN BỘ** `$APP_ROOT/skills/ai-test/SKILL.md` trong **MỘT lần Read** (offset=1, limit=2000). Đọc thiếu = bỏ sót Pha 1/Pha 2/luật env → test SAI.
2. Thực hiện **đúng quy trình 4 pha** trong file đó, coi chuỗi tham số đã ráp ở A3 là `$ARGUMENTS` đầu vào của `ai-test`.
3. Từ đây là **auto mode** — không hỏi giữa chừng (trừ trường hợp `ai-test` quy định phải confirm: đổi env thật, hoặc data bắt buộc phải thật không fake được; và `--interactive` nếu user đã chọn).

> Toàn bộ output (report path, video, source-meta, Google Sheet/Doc write-back...) do `ai-test` xử lý. Skill này không in report riêng.
