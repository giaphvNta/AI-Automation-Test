---
name: ai-test
description: "Auto-pilot E2E test. Một lệnh slash → AI tự plan, generate, run headless (Docker), auto-repair, sinh báo cáo + video."
argument-hint: "<url|file|sheet|description> --project=<name> [--target=<url>] [--max-heal=3] [--interactive]"
---

# AI Automation Test — SKILL

> ⚠️ **ĐỌC TOÀN BỘ FILE NÀY TRONG 1 LẦN TRƯỚC KHI THỰC HIỆN.**
> File ~908 dòng — đọc 1 Read duy nhất (offset=1, limit=2000). KHÔNG đọc theo chunk/nhảy cóc.
> Đọc thiếu dòng = bỏ sót Bước 1b (hash skip/rerun), Bước 3b (seed), luật env (confirm+restore) → test SAI.

Skill này là auto-pilot orchestrator cho E2E testing dùng Playwright + Docker.

## Paths cố định

```
APP_ROOT  = /home/user/ai-automation-test
HUB       = /home/user/ai-automation-test/automation
PROJECTS  = /home/user/ai-automation-test/automation/projects
SERVICE_AUTH = /home/user/ai-automation-test/service-auth.json  (Google Sheets - optional)
```

## Dashboard status (real-time) — BẮT BUỘC

Script helper: `scripts/update-status.sh <step_num> <step_key> <project> <message> [heal_count] [mode] [status]`

Lệnh này **BẮT BUỘC** được gọi tại đầu mỗi bước — đã nhúng trực tiếp vào từng bước bên dưới. Dashboard: `http://localhost:8765`.

---

## Nguyên tắc bất biến

1. **Auto mode default** — không hỏi giữa các bước. Làm từ đầu đến cuối.
0. **AI_REPORT.md phải nằm trong run directory** — Path bắt buộc: `projects/<name>/test-results/runs/<run-id>/AI_REPORT.md`. **TUYỆT ĐỐI KHÔNG** ghi vào `projects/<name>/AI_REPORT.md` hay bất kỳ đường dẫn nào khác ngoài run directory.
2. **`--interactive`** — bật confirm trước khi chạy test thật.
3. **CWD bắt buộc `/home/user/ai-automation-test/automation/`** — Playwright + Docker config ở đây.
4. **`--project=<name>` BẮT BUỘC** — không tự đoán, hỏi nếu thiếu.
5. **Headless only** — KHÔNG mở browser, KHÔNG screenshot màn hình host (rule nta-no-screen-capture.md).
6. **Output: in path file** — dev tự mở video/report, KHÔNG mở visual trong VSCode.
7. **Thiếu data → tự động xử lý, không hỏi** — tự viết seed script hoặc fake data và tiếp tục. KHÔNG dừng lại chờ confirm.
8. **`--fast`** — chạy nhanh, tiết kiệm token: tắt video/trace, 4 workers, bỏ HTML report, bỏ heal loop, report 3 dòng.
9. **Thay đổi env container để test → BẮT BUỘC confirm trước** — xem mục "Xử lý env thay đổi" bên dưới.
10. **KHÔNG dừng giữa test để hỏi** — Khi đang trong Bước 6 (execute), KHÔNG hỏi user dù phát hiện bug, anomaly, hay code issue. Ghi nhận vào report và chạy tiếp đến hết. Chỉ hỏi TRƯỚC khi bắt đầu chạy (Bước 1–5) hoặc SAU khi xong (Bước 7). Lãng phí token hỏi giữa chừng là lỗi nghiêm trọng.
11. **KHÔNG tra git history khi test** — Không chạy `git log`, `git diff`, `git blame`, `git show` trong quá trình test. Test dựa trên source code hiện tại as-is. Tiết kiệm token và tránh làm chậm pipeline.
12. **Bước 6b là BẮT BUỘC sau mọi lần test** — Dù test pass 100% hay fail, dù heal thành công hay không, Bước 6b (convert video) PHẢI chạy trước Bước 7. KHÔNG nhảy từ Bước 6 thẳng sang Bước 7. Vi phạm = mất toàn bộ video recording.
13. **Bước 7 + 7e là BẮT BUỘC, không bao giờ skip** — Sau khi heal loop kết thúc (pass hoặc max_heal), PHẢI thực hiện ngay Bước 6b → Bước 7 → Bước 7e (save source-meta). Không có bất kỳ lý do nào để bỏ qua. Context dài hay output nhiều KHÔNG phải lý do hợp lệ để skip report.
14. **Source-meta PHẢI được lưu sau mỗi run** (Bước 7e) — Nếu không lưu, mỗi lần chạy lại đều phải generate lại spec+test từ đầu, gây lãng phí. Source-meta là cơ chế "nhớ" của skill.

---

## Quy trình 7 bước

### Bước 1: Parse arguments

> 📊 **Dashboard:** `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 1 s1 "<name>" "Parsing arguments..." 0 normal`

Flags:
- `--project=<name>` — BẮT BUỘC
- `--target=<base_url>` — URL app cần test
- `--max-heal=<n>` — default 3
- `--interactive` — default OFF
- `--rerun` — chạy lại test cũ, không sinh mới
- `--only=<test>` — chạy 1 test
- `--fast` — **BẮT BUỘC set `TEST_FAST=1`** khi gọi run-test.sh. Nghĩa cụ thể: tắt video/trace, 4 workers, skip heal, compact report 3 dòng. KHÔNG có nghĩa "skip regeneration" hay "bỏ qua sinh test".
- `--live` — **BẮT BUỘC set `TEST_LIVE=1`** khi gọi run-test.sh. Nghĩa cụ thể: headed mode + VNC tại http://localhost:6080/vnc.html. KHÔNG có nghĩa "dùng live env" hay "chạy với env hiện tại".
- `--sheet=<url>` — Ghi kết quả vào Google Sheet sau khi test (Bước 7d). **Phải truyền flag này mới ghi** — input là Google Sheet không tự động ghi ngược. Cần `service-auth.json`.
- `--sheet-tab=<name>` — Tên tab cụ thể khi ghi kết quả (ví dụ: `--sheet-tab="Test Cases"`) — auto-detect nếu bỏ qua.
- `--doc=<url>` — Ghi kết quả vào Google Doc sau khi test (Bước 7d). **Phải truyền flag này mới ghi**. Cần `service-auth.json`.

Input types:
| Dạng | Nhận diện | Loader |
|---|---|---|
| Google Sheet | `docs.google.com/spreadsheets` | `scripts/load-google-sheet.mjs` + `service-auth.json` |
| Google Doc | `docs.google.com/document` | `scripts/load-google-doc.mjs` + `service-auth.json` ⚠️ chưa test |
| Confluence | `*.atlassian.net/wiki` hoặc `confluence.*/display` | `scripts/load-confluence.mjs` + `CONFLUENCE_EMAIL/TOKEN` ⚠️ chưa test |
| URL khác | `http(s)://` | WebFetch |
| File | Có `/` hoặc đuôi `.pdf/.md/.xlsx/.csv` | Read |
| Mô tả | Còn lại | Trực tiếp |

Validate: thiếu `--project` → HỎI, không đoán.

### Bước 1b: Kiểm tra thay đổi nội dung spec / test case so với lần test trước

> 📊 **Dashboard:** `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 1 s1b "<name>" "Detecting spec changes..." 0 normal`

> **Áp dụng với mọi project và mọi mode** (normal, `--fast`, `--live`, kết hợp). Mode chỉ ảnh hưởng Bước 6 trở đi, không ảnh hưởng bước check này. Ngoại lệ duy nhất: `--rerun` → bỏ qua toàn bộ bước 1b.

Trước khi chạy, so sánh **nội dung test case / spec / mô tả tự nhiên** mà user truyền vào với lần test trước. Không phải check file metadata, mà check **nội dung thực tế** đã thay đổi gì không.

Input có thể là:
- File spec (`.md`, `.pdf`, `.xlsx`, `.csv`) → đọc nội dung file
- Google Sheet → load toàn bộ nội dung sheet
- Google Doc / Confluence / URL → fetch nội dung
- Mô tả tự nhiên (text) → hash chính chuỗi text đó

**Metadata lưu tại:** `projects/<name>/specs/.source-meta/<slug>.json`

```json
{
  "input": "text mô tả / path / URL gốc mà user truyền vào",
  "content_hash": "sha256:<hash-của-nội-dung-đã-đọc>",
  "last_tested": "2026-06-03T10:00:00Z",
  "run_id": "03_06_2026_10_00_00_000",
  "spec_file": "projects/<name>/specs/<slug>.md",
  "test_file": "projects/<name>/tests/<slug>.spec.ts",
  "sheet_tab": "Test Cases"
}
```

**Quy trình kiểm tra:**

```bash
# 1. Đọc nội dung test case / spec hiện tại
#    - File:         cat <path>
#    - Google Sheet: node scripts/load-google-sheet.mjs <url> --sheet=<tab> --format=markdown --strip-result-cols
#      ⚠️ BẮT BUỘC --strip-result-cols khi hash: loại các cột kết quả (Chrome/Safari/Tester/Date/Status/Notes)
#         mà chính tool ghi ngược ở Bước 7d. Nếu không, mỗi lần ghi kết quả → hash đổi → false positive
#         "spec changed" dù test case không đổi.
#    - Google Doc:   node scripts/load-google-doc.mjs <url>
#    - Confluence:   node scripts/load-confluence.mjs <url>
#    - URL:          curl -s <url>
#    - Text tự nhiên: dùng chính chuỗi text user gõ

# 2. Hash nội dung vừa đọc
CURRENT_HASH=$(echo "<nội-dung>" | sha256sum | cut -d' ' -f1)

# 3. Lấy hash lần trước
STORED_HASH=$(python3 -c "
import json,sys
try:
  d=json.load(open('projects/<name>/specs/.source-meta/<slug>.json'))
  print(d.get('content_hash',''))
except: print('')
" 2>/dev/null)
```

**Kết quả so sánh:**

| Tình huống | Hành động |
|---|---|
| Chưa có metadata (lần đầu) | Chạy đầy đủ Bước 3 → 7 |
| Hash **giống** (test case không đổi) | Bỏ qua Bước 3–5, chạy thẳng Bước 6 với test file cũ |
| Hash **khác** (test case đã thay đổi) | **Cập nhật ngay**, không hỏi → chạy lại Bước 3–5 → Bước 6 |
| `--rerun` flag | Bỏ qua check, chạy thẳng test file cũ |

Khi phát hiện thay đổi, thông báo ngắn rồi tự cập nhật luôn:
```
⚠️ Test case đã thay đổi (run cũ: <run-id>). Đang cập nhật test plan + code...
```

**⚠️ Quy tắc quan trọng — Sheet/spec luôn là source of truth:**

Khi nội dung sheet/spec thay đổi, **BẤT KỲ quyết định nào được lưu trong memory về TC cụ thể đều bị override**. Ví dụ:
- Memory ghi "TC-14 FAIL có chủ đích, KHÔNG heal" → nếu sheet đã sửa → **BỎ QUA quyết định đó**, update test theo nội dung mới
- Memory ghi "KHÔNG đổi assertion của TC-X" → nếu sheet thay đổi expected result của TC-X → **cập nhật test**

Logic: memory lưu quyết định tại một thời điểm, sheet là nguồn thật hiện tại. Khi hai cái mâu thuẫn sau khi sheet thay đổi → **sheet thắng, memory cũ bị vô hiệu với TC đó**.

**Sau khi test xong (Bước 7):** Lưu/cập nhật metadata:
```bash
mkdir -p projects/<name>/specs/.source-meta
python3 -c "
import json, hashlib, sys
content = sys.stdin.read()
h = 'sha256:' + hashlib.sha256(content.encode()).hexdigest()
meta = {
  'input': '<original-input-từ-user>',
  'content_hash': h,
  'last_tested': '<ISO-timestamp>',
  'run_id': '<run-id>',
  'spec_file': 'projects/<name>/specs/<slug>.md',
  'test_file': 'projects/<name>/tests/<slug>.spec.ts',
  'sheet_tab': '<tab-name-nếu-input-là-google-sheet, hoặc-bỏ-trống>',
  'input_slug': '<slug>'
}
json.dump(meta, open('projects/<name>/specs/.source-meta/<slug>.json','w'), ensure_ascii=False, indent=2)
print('[meta] Saved content hash')
" <<< "<nội-dung-spec>"
```

### Bước 2: Switch context

> 📊 **Dashboard:** `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 2 s2 "<name>" "Switching context..." 0 normal`

```bash
cd /home/user/ai-automation-test/automation
export TEST_PROJECT=<name>
```

Check nhanh:
- Docker dependency volume có `@playwright/test` hoặc wrapper `scripts/run-test.sh` có thể bootstrap bằng `npm ci`
- `automation/.claude/agents/playwright-test-*.md` có đủ 3 file?
- Docker daemon running?

Nếu thiếu → báo lỗi rõ và hướng dẫn chạy `./setup.sh` ở app root.

### Bước 3: Đọc input + trích scenarios

> 📊 **Dashboard:** `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 3 s3 "<name>" "Loading input + extracting scenarios..." 0 normal`

Từ nội dung, trích:
- Target URL
- Test scenarios (ID, tên, precondition, steps, expected)
- Test data cần thiết

#### Quy tắc sinh slug — QUAN TRỌNG

`<slug>` là tên định danh duy nhất cho mỗi cặp (spec + test + source-meta). Phải sinh slug **trước** khi load content.

| Input | Cách sinh slug |
|---|---|
| File local | Tên file không có extension: `login-spec.md` → `login-spec` |
| Google Sheet (không có tab) | `sheet_<8-ký-tự-đầu-spreadsheetId>`: ví dụ `sheet_1SopqsJc` |
| Google Sheet + tab | `sheet_<8-ký-tự-đầu-id>_<tab-slug>`: ví dụ `sheet_1SopqsJc_test-case-2` |
| Google Doc | `doc_<8-ký-tự-đầu-docId>` |
| Confluence | `confluence_<pageId>` |
| URL khác | Slug hóa domain + path cuối: `backlog-example-wiki-login` |
| Mô tả text | 4-5 từ đầu, slug hóa: `test-login-nhat-vao-dashboard` |

**Tab slug**: lowercase, thay space/special chars bằng `-`, bỏ dấu tiếng Việt.
Ví dụ: `"Test Case 2"` → `test-case-2`, `"Đăng nhập"` → `dang-nhap`

Slug dùng cho:
- `projects/<name>/specs/<slug>.md` — spec file
- `projects/<name>/tests/<slug>.spec.ts` — test file
- `projects/<name>/specs/.source-meta/<slug>.json` — hash metadata

Nếu `<slug>.md` **đã tồn tại** → đây là lần chạy lại, không đổi tên file, chỉ update nội dung nếu hash thay đổi.

#### Load theo từng loại input

**Hàm sinh slug (dùng chung):**
```bash
slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' \
    | sed 's/[àáạảãâầấậẩẫăằắặẳẵ]/a/g;s/[èéẹẻẽêềếệểễ]/e/g' \
    | sed 's/[ìíịỉĩ]/i/g;s/[òóọỏõôồốộổỗơờớợởỡ]/o/g' \
    | sed 's/[ùúụủũưừứựửữ]/u/g;s/[ỳýỵỷỹ]/y/g;s/đ/d/g' \
    | sed 's/[^a-z0-9]/-/g;s/-\+/-/g;s/^-\|-$//g'
}
```

**Google Sheet:**
```bash
SHEET_ID=$(echo '<sheet-url>' | grep -oP '(?<=/d/)[^/]+')
TAB_SLUG=$(slugify '<tab-name>')          # bỏ qua nếu không có tab
SLUG="sheet_${SHEET_ID:0:8}${TAB_SLUG:+_$TAB_SLUG}"
# Ví dụ: sheet_1SopqsJc_test-case-2

node scripts/load-google-sheet.mjs "<sheet-url>" \
  --sheet="<tab-name-nếu-có>" \
  --format=markdown 2>/dev/null > "projects/<name>/specs/${SLUG}.md"
```

> ⚠️ **Write tool sau Bash:** Spec file được tạo bằng shell redirect (Bash). Nếu Bước 4 cần ghi plan vào cùng file đó bằng Write tool, **PHẢI Read file trước**. Hoặc dùng Bash heredoc thay Write tool để tránh bị block.

**Google Doc:**
```bash
DOC_ID=$(echo '<doc-url>' | grep -oP '(?<=/d/)[^/]+')
SLUG="doc_${DOC_ID:0:8}"
# Ví dụ: doc_1BxKmNpQ

node scripts/load-google-doc.mjs "<doc-url>" \
  --out="projects/<name>/specs/${SLUG}.md"
# ⚠️ Phải dùng --out=<path> (có dấu =). Dạng --out <path> (space) → "Unknown argument: --out"
```

**Confluence:**
```bash
PAGE_ID=$(echo '<confluence-url>' | grep -oP '/pages/\K[0-9]+')
SLUG="confluence_${PAGE_ID}"
# Ví dụ: confluence_123456789

node scripts/load-confluence.mjs "<confluence-url>" \
  --out="projects/<name>/specs/${SLUG}.md"
# ⚠️ Phải dùng --out=<path> (có dấu =), không dùng dạng space
```

**File local (.md / .pdf / .xlsx / .csv):**
```bash
SLUG=$(basename '<file-path>' | sed 's/\.[^.]*$//')
# login-spec.md → login-spec
# TEST_CASES_FB.md → TEST_CASES_FB  (giữ nguyên tên file)
# Nếu trùng với slug đã có → thêm suffix: login-spec-2

# File .md/.txt: đọc trực tiếp
# File .pdf/.xlsx/.csv: Read tool tự parse
```

**URL khác:**
```bash
SLUG=$(echo '<url>' | sed 's|https\?://||;s|/|-|g;s|[^a-z0-9-]||g' | cut -c1-40)
# https://backlog.example.com/wiki/login → backlog-example-com-wiki-login
```

**Mô tả text:**
```bash
SLUG=$(slugify '<4-5 từ đầu của mô tả>')
# "Test login: nhập đúng → dashboard" → test-login-nhap-dung-dashboard
```

Sau đó dùng `projects/<name>/specs/${SLUG}.md` làm input spec.

### Bước 3b: Kiểm tra data thiếu → tự động xử lý

> 📊 **Dashboard:** `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 3 s3b "<name>" "Checking and seeding test data..." 0 normal`

Trước khi sinh plan/code, rà từng scenario xác định data có đủ không:
- Account/role/permission cần dùng
- Entity cần tồn tại sẵn: product, order, customer, user, search keyword, date range
- Master data/dropdown option cần có
- Trạng thái nghiệp vụ cần setup trước: draft/approved/cancelled/paid
- Layout cần data để render danh sách, bảng, card, empty state, pagination

**Khi phát hiện thiếu data — KHÔNG hỏi, tự xử lý ngay:**

| Loại thiếu | Cách xử lý tự động |
|---|---|
| Thiếu record DB (product, order, user...) | **Kiểm tra data đã có chưa** trước khi seed (xem quy tắc seed bên dưới) |
| Cần state cụ thể (approved, paid...) | Viết helper function setup state qua API hoặc DB trong test |
| Cần account/credential | Dùng account đã có trong `.env`, hoặc fake account phù hợp spec |
| Cần giá trị dropdown/master data | Hard-code giá trị hợp lệ lấy từ source code hoặc spec |
| Cần search keyword trả kết quả | Dùng keyword generic (`%`, `a`, hoặc từ khóa phổ biến trong domain) |
| Thiếu date range | Dùng ngày hiện tại ± 7 ngày |
| Layout cần có items | Fake ≥ 1 item tối thiểu để render, ghi rõ là fake trong comment test |

**Quy tắc seed data (BẮT BUỘC tuân theo):**

1. **Kiểm tra trước khi seed** — KHÔNG chạy seed blindly. Luôn query DB để xác nhận data đã có hay chưa:
   ```bash
   # Ví dụ kiểm tra scenario=no73
   docker exec <fpm_container> php artisan tinker --execute="
     echo DB::table('auction_informations')->where('auction_count','NO73-TEST')->count();
   "
   ```
   - Nếu count > 0 → **bỏ qua seed, dùng data hiện có**
   - Nếu count = 0 → chạy seed

2. **Seed file (seed.spec.ts) — lưu trữ sau khi test xong:**
   - Sau khi test hoàn thành, **move** seed file lên thư mục seeds dùng chung:
     ```
     /home/user/ai-automation-test/automation/seeds/<project-name>/
     ```
   - **Xóa** seed file khỏi `projects/<name>/tests/` sau khi move
   - Lý do: seed là shared utility, không phải test của riêng project

   ```bash
   mkdir -p /home/user/ai-automation-test/automation/seeds/<project-name>
   mv projects/<name>/tests/seed*.spec.ts \
      /home/user/ai-automation-test/automation/seeds/<project-name>/
   ```

Sau khi tự xử lý, ghi 1 dòng log ngắn trong report:
```
⚠️ Data tự sinh: <mô tả ngắn> (fake — không dùng trên production)
```
Nếu dùng data có sẵn (không seed): không cần log gì thêm.

Auto mode và interactive mode: đều đi thẳng Bước 4, không dừng chờ confirm.

Chỉ dừng lại hỏi user khi: data thiếu **không thể fake được** và bắt buộc phải có data thật (ví dụ: account có permission đặc biệt, 3rd-party credential).

### Bước 4: Sinh test plan

> 📊 **Dashboard:** `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 4 s4 "<name>" "Generating test plan..." 0 normal`

Nếu Playwright Test Agent `playwright-test-planner` có thể invoke (khi mở automation/ trực tiếp):
→ Dùng Agent tool với subagent_type=playwright-test-planner

Fallback (khi chạy từ parent conversation):
→ Tự sinh file plan markdown tại `automation/projects/<name>/specs/<slug>.md`

Format plan: scenario title, pre-conditions, steps, expected outcomes, selector hints.

Auto mode: đi thẳng Bước 5.
Interactive mode: hiển thị plan, chờ OK.

### Bước 5: Sinh test code

> 📊 **Dashboard:** `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 5 s5 "<name>" "Generating test code..." 0 normal`

Nếu Agent `playwright-test-generator` available:
→ Dùng Agent tool với subagent_type=playwright-test-generator

Fallback:
→ Tự viết `automation/projects/<name>/tests/<slug>.spec.ts`

**BẮT BUỘC — TC ID trong test phải khớp 1-1 với ID trong sheet/spec:**
- Sheet có ID `31` → test đặt tên `TC-31: ...`. TUYỆT ĐỐI KHÔNG đánh số lại, KHÔNG thêm suffix chữ cái (`TC-30b`, `TC-30c`) cho TC mới.
- Lý do: write-results-to-sheet.mjs match dòng theo TC-number — `TC-30b` bị trích số thành `30` → kết quả ghi nhầm vào row 30, row 31/32 bị bỏ trống. Incident đã xảy ra với Staff-Manager.
- Suffix chữ cái CHỈ dùng khi 1 TC trong sheet cần tách nhiều test con (cùng map về 1 row).
- Sau khi generate, **đếm**: số TC trong spec = số TC ID duy nhất trong test file. Thiếu/thừa → sửa ngay.

**BẮT BUỘC trước khi viết test code — kiểm tra source app:**
Đọc HTML/view template để xác định chính xác:
- Submit button: `<input type="submit">` (Rails `f.submit`) ≠ `<button>` — cả hai được `getByRole('button')` cover, nhưng text match phải chính xác với `value=` attribute
- Flash message selector: xem layout template để lấy đúng `id` attribute (vd: `id="flash-notice"` không phải `class="flash"`)
- Navigation/sidebar: kiểm tra thực tế các link text trong sidebar (không đoán là "Home" nếu sidebar có "Dashboard")
- Form field names: Rails `f.email_field :email` → `name="model_name[email]"` — xác nhận từ HTML

Quy tắc viết test:
- Selector: ưu tiên `getByRole` > `getByLabel` > `getByText` > CSS
- Wait: dùng auto-wait của Playwright, KHÔNG `waitForTimeout`
- Credentials: `process.env.TEST_USER`, `process.env.TEST_PASS`
- Fake data: chỉ dùng data đã được user confirm ở Bước 3b; không hard-code credential thật vào spec/test/report
- Mỗi test: Arrange → Act → Assert

**Quy tắc mock env cho feature flag / config:**

Khi test cần cover nhiều trạng thái của 1 biến môi trường (ví dụ feature flag true/false, config A/B), LUÔN sinh code hỗ trợ mock qua env var `TEST_MOCK_<TÊN_BIẾN>`:

```typescript
// Pattern chuẩn trong beforeAll / setup:
const mockVal = process.env.TEST_MOCK_<TÊN_BIẾN>;  // e.g. TEST_MOCK_FEATURE_X
if (mockVal === 'true' || mockVal === 'false') {
  featureEnabled = mockVal === 'true';
  console.log(`[Flag detect] MOCKED <TÊN_BIẾN> = ${featureEnabled}`);
} else {
  // Real detection từ DOM/API/config
  featureEnabled = await detectFromPage(page);
  console.log(`[Flag detect] <TÊN_BIẾN> = ${featureEnabled}`);
}
```

Cách dùng khi chạy test:
- **Mock true** (không đổi env thật): `TEST_MOCK_FEATURE_X=true ./scripts/run-test.sh <name>`
- **Mock false**: `TEST_MOCK_FEATURE_X=false ./scripts/run-test.sh <name>`
- **Không mock** (đọc env thật): bỏ trống biến

> ⚠️ Mock chỉ bypass logic skip/branch trong test — server vẫn render theo env thật.
> Test server-rendered content (header, sidebar, page HTML) cần đổi env thật để pass.

Auto mode: đi thẳng Bước 6.
Interactive mode: hiển thị code, chờ confirm.

### Bước 6: Execute + auto-heal

> 📊 **Dashboard:** `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 6 s6 "<name>" "Running tests in Docker..." 0 normal`
> Trong heal loop, cập nhật: `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 6 s6 "<name>" "Healing attempt <n>..." <n> normal`

Luôn set `SPEC_FILE` trỏ đúng vào spec file vừa sinh ở Bước 5 — KHÔNG chạy cả thư mục `tests/`:
```bash
cd /home/user/ai-automation-test/automation
SPEC_FILE="projects/<name>/tests/<slug>.spec.ts" ./scripts/run-test.sh <name>
```

`--fast` mode — PHẢI set `TEST_FAST=1`, KHÔNG được bỏ qua:
```bash
TEST_FAST=1 SPEC_FILE="projects/<name>/tests/<slug>.spec.ts" ./scripts/run-test.sh <name>
```

`--live` mode — PHẢI set `TEST_LIVE=1`, KHÔNG được bỏ qua. Script tự khởi VNC bên trong Docker và in link:
```bash
TEST_LIVE=1 SPEC_FILE="projects/<name>/tests/<slug>.spec.ts" ./scripts/run-test.sh <name>
```
Sau khi chạy lệnh trên, wrapper sẽ in ra:
```
🖥️  Live view:  http://localhost:6080/vnc.html
```
Thông báo link này cho user, KHÔNG tự mở browser.

`--fast` + `--live` có thể kết hợp:
```bash
TEST_FAST=1 TEST_LIVE=1 SPEC_FILE="projects/<name>/tests/<slug>.spec.ts" ./scripts/run-test.sh <name>
```

Flag `--rerun` (chạy lại toàn bộ project): bỏ `SPEC_FILE`:
```bash
./scripts/run-test.sh <name>
```

Flag `--only=<test>`:
```bash
SPEC_FILE="projects/<name>/tests/<slug>.spec.ts" ./scripts/run-test.sh <name> --grep "<test>"
```

Rerun healing trên cùng run-id:
```bash
TEST_RUN_ID=<run-id> SPEC_FILE="projects/<name>/tests/<slug>.spec.ts" ./scripts/run-test.sh <name>
```

Sau khi chạy, đọc `Run ID:` và các path do wrapper in ra. Không tự đoán `TEST_RUN_ID`.

Kết quả của mỗi lần chạy nằm trong:
```
projects/<name>/test-results/runs/<run-id>/
├── artifacts/
├── playwright-report/   (chỉ có ở normal mode)
└── results.json
```

Không xóa `projects/<name>/test-results` của các lần chạy trước.

Kết quả:
- **`--fast` mode**: bỏ qua heal, chuyển thẳng Bước 7 compact
- **Normal mode**, tất cả pass → Bước 7
- **Normal mode**, có fail → healing loop:

```
heal_count = 0
while heal_count < max_heal AND có test fail:

    # BƯỚC ĐẦU TIÊN — BẮT BUỘC: đọc spec trước khi xem lỗi
    0. Đọc projects/<name>/specs/<slug>.md → xác định expected behavior của TC đang fail

    # Tiết kiệm token: chỉ đọc đúng phần cần thiết
    1. Đọc results.json → lấy CHỈ field "errors"/"message" của test fail

    2. Phân loại lỗi — chỉ sửa khi **code đúng theo spec mà test vẫn fail vì lý do kỹ thuật**:

       ĐƯỢC sửa (lý do kỹ thuật — "how"):
          - Selector không còn match dù element vẫn tồn tại
          - Timing / race condition → thêm waitFor
          - Locator fragile → đổi sang getByRole / getByLabel / getByTestId

       KHÔNG được sửa (test logic — "what"):
          - Expected value / assertion text / count khác với app output
            → Nếu spec nói 100 mà app trả 50 → APP BUG, để test fail, ghi vào report
          - Test flow, step order, điều kiện kiểm tra
          - Bất kỳ thứ gì không có căn cứ từ spec / test case / ngôn ngữ tự nhiên gốc

    3. Nếu được sửa: patch → rerun bằng cùng TEST_RUN_ID
    heal_count += 1
```

**Quy tắc bất biến:** Chỉ sửa "how" (cách tìm element, cách wait) — không bao giờ sửa "what" (expected value, assertion, logic). Test pass nhờ sửa sai spec còn tệ hơn test fail.

**Tuyệt đối không thêm `test.fail()`, `test.skip()`, `test.fixme()`** vào test case trừ khi spec/test case gốc yêu cầu rõ ràng. App bug thì để test đỏ — đó là thông tin quan trọng cần báo cáo, không phải thứ cần che giấu bằng annotation.

Healer KHÔNG hỏi user — tự loop đến khi pass hoặc đạt max_heal.

**Sau max_heal hoặc khi xác định app bug:** ghi nhận ngắn gọn (1 dòng/TC) các lỗi còn lại. **TIẾP TỤC NGAY sang Bước 6b — TUYỆT ĐỐI KHÔNG dừng lại, KHÔNG hỏi, KHÔNG report trước khi làm Bước 6b.**

> ⚠️ **Incident pattern đã xảy ra:** Heal loop kết thúc → AI bỏ qua Bước 6b và 7 → không có video, không có AI_REPORT.md, không có source-meta. Đây là lỗi nghiêm trọng. Bước 6b→7→7e là chuỗi PHẢI CHẠY ngay sau heal loop, không có exception.

### Bước 6b: Convert video webm → mp4 + tạo video tổng

> ⚠️ **BẮT BUỘC — KHÔNG SKIP.** Phải chạy sau MỌI lần test, kể cả khi 100% pass. Nếu bỏ qua, toàn bộ video recording bị mất (chỉ còn .webm không mở được trên Windows).

> 📊 **Dashboard:** `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 6 s6b "<name>" "Converting videos..." 0 normal`

Sau khi test xong (pass hoặc heal xong), chạy lệnh dưới — một lần duy nhất, làm cả 2 việc:
1. Convert từng `video.webm` → `video.mp4`
2. Ghép tất cả thành `full-session.mp4` theo thứ tự thực thi

```bash
cd /home/user/ai-automation-test/automation
docker compose run --rm --entrypoint bash playwright -c "
  RESULTS=projects/<name>/test-results/runs/<run-id>/artifacts

  # 1. Convert từng file webm → mp4
  find \"\$RESULTS\" -name 'video.webm' | sort | while read f; do
    ffmpeg -i \"\$f\" -c:v libx264 -preset fast -movflags +faststart \"\${f%.webm}.mp4\" -y 2>/dev/null \
      && rm \"\$f\"
  done

  # 2. Ghép thành video tổng
  CONCAT_LIST=\$(mktemp)
  find \"\$RESULTS\" -name 'video.mp4' | sort | while read f; do
    echo \"file '/work/\$f'\"
  done > \"\$CONCAT_LIST\"

  if [ -s \"\$CONCAT_LIST\" ]; then
    ffmpeg -f concat -safe 0 -i \"\$CONCAT_LIST\" \
      -c:v libx264 -preset fast -movflags +faststart \
      \"\$RESULTS/full-session.mp4\" -y 2>/dev/null \
      && echo 'full-session.mp4 OK'
  fi
  rm -f \"\$CONCAT_LIST\"
"
```

Nếu docker image chưa build (lần đầu): `docker compose build playwright` trước.

### Bước 7: Tổng hợp report

> ⚠️ **BẮT BUỘC — KHÔNG SKIP DÙ TEST FAIL HAY HEAL HẾT.** Đây là bước cuối bắt buộc. Context dài, token nhiều, heal exhausted đều KHÔNG phải lý do skip. Luôn sinh AI_REPORT.md và luôn lưu source-meta (Bước 7e).

> 📊 **Dashboard:** `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 7 s7 "<name>" "Generating report..." 0 normal`
> Khi xong hết: `bash /home/user/ai-automation-test/automation/scripts/update-status.sh 7 s7 "<name>" "Done" 0 normal done`

#### `--fast` mode — compact, không sinh file:
In ra chat 3 dòng, DỪNG (không sinh AI_REPORT.md, không convert video):
```
⚡ Fast run — project `<name>` | Run ID: <run-id>
📊 Total: N | ✅ Pass: x | ❌ Fail: y
📄 JSON: file:///home/user/ai-automation-test/automation/projects/<name>/test-results/runs/<run-id>/results.json
```

#### Normal mode — đầy đủ:

Bước 6b (convert + ghép video) chạy trước, rồi mới sinh report.

Trước khi viết report:
1. `ls projects/<name>/test-results/runs/<run-id>/artifacts/` để lấy tên thư mục thật
2. Mỗi test case → path tuyệt đối đến `video.mp4`

**Bước 7a: Detect OS để chọn format path**

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
| macOS | `uname` = `Darwin` | `file:///Users/<user>/.../video.mp4` hoặc path tuyệt đối |
| Linux thuần | còn lại | `file:///home/user/.../video.mp4` |

Quy tắc convert đường dẫn theo OS:
- **WSL2**: thay `/` → `\`, thêm prefix `\\wsl.localhost\Ubuntu` → paste vào Windows Explorer hoặc VLC
- **macOS**: dùng `file://` URI — Terminal và Finder đều nhận; hoặc path tuyệt đối `/Users/...`
- **Linux**: dùng `file://` URI — mở được từ file manager hoặc VLC

**Bước 7b: Sinh AI_REPORT.md và in ra chat**

> ⚠️ **Path bắt buộc — không được sai:**
> ```
> /home/user/ai-automation-test/automation/projects/<name>/test-results/runs/<run-id>/AI_REPORT.md
> ```
> KHÔNG ghi vào bất kỳ path nào khác. Run ID lấy từ output của run-test.sh (`Run ID: ...`), **không tự đặt**.

**BẮT BUỘC chạy lệnh này trước khi viết file** để xác nhận đúng run-id và thư mục tồn tại:
```bash
RUN_DIR="projects/<name>/test-results/runs/<run-id>"
ls "$RUN_DIR/results.json" && echo "✅ Path OK" || echo "❌ SAI PATH — dừng lại"
```
Nếu `ls` fail → **DỪNG**, đọc lại output của run-test.sh để lấy đúng run-id.

Sinh `/home/user/ai-automation-test/automation/projects/<name>/test-results/runs/<run-id>/AI_REPORT.md` và in ra chat:
```
✅ Test xong — project `<name>`
📊 Total: N | ✅ Pass: x | ❌ Fail: y | 🔧 Healed: z

📝 Báo cáo: <path theo OS>
🎬 Full session: <path theo OS>/full-session.mp4
🎬 <TC-ID> <tên test>: <path theo OS>/<exact-dir>/video.mp4
   (liệt kê từng test — KHÔNG dùng placeholder)
📊 HTML: cd /home/user/ai-automation-test/automation && ./scripts/show-report.sh <name> <run-id>
```

**Template AI_REPORT.md — PHẢI theo đúng format này (không tự đặt format khác):**

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
🎬 Full session: <UNC hoặc file:// path đến full-session.mp4> (nếu có)
```

---

## 🎬 Video từng test case

| TC | Title | Video |
|----|-------|-------|
| ✅ TC1 | <title> | `<UNC path>\artifacts\<exact-dir>\video.mp4` |
| ❌ TC2 | <title> | `<UNC path>\artifacts\<exact-dir>\video.mp4` |
| ⚠️ TC3 flaky | <title> | `<UNC path>\artifacts\<exact-dir>\video.mp4` |
```
(Dùng ✅/❌/⚠️ trong cột TC — KHÔNG có cột Status riêng)
(Video path: backtick, KHÔNG dùng markdown link [text](url))

```markdown
---

## ❌ TC-X: <tên test> — Phân tích lỗi
(Phần này: BẮT BUỘC cho từng TC fail, hoặc group theo root cause nếu nhiều TC cùng lỗi)

**Lỗi:**
```
<error message thực tế>
```

**Root cause:**
- Loại lỗi: [Selector sai | Assertion fail | App bug | Data thiếu | Timeout | Môi trường]
- Giải thích: <nguyên nhân cụ thể>

**Hướng fix:**
- <hành động cụ thể>

---

## ⚠️ Flaky Tests
(Phần này: chỉ có nếu có TC flaky)

| TC | Title | Ghi chú |
|----|-------|---------|
| TC-X | <title> | Passed sau retry #N. <lý do> |

---

📊 HTML Report: `cd /home/user/ai-automation-test/automation && ./scripts/show-report.sh <name> <run-id>`
```

Quy tắc bắt buộc:
- Path video phải là `.mp4` (đã convert ở Bước 6b)
- Tên thư mục phải lấy từ `ls`, không tự đặt
- Mỗi test case một dòng riêng
- Path trong file AI_REPORT.md dùng format đúng theo OS (WSL2 → UNC, Linux → file://)
- Trong bảng video: dùng backtick `` ` `` bao path, KHÔNG dùng `[text](url)` markdown link
- KHÔNG có cột "Status" riêng trong bảng video — trạng thái ghi inline vào cột TC (✅/❌/⚠️)
- Section headers phải có emoji: `## 📊`, `## 📂`, `## 🎬`, `## ❌`, `## ⚠️`

**Mục "Phân tích lỗi & Hướng fix" — BẮT BUỘC có nếu có TC fail:**

Với mỗi TC fail (sau heal hoặc không heal được), viết phần phân tích theo format:

```markdown
## ❌ TC-X: <tên test> — Phân tích lỗi

**Lỗi:**
```
<error message thực tế>
```

**Root cause:**
- Loại lỗi: [Selector sai | Assertion fail | App bug | Data thiếu | Timeout]
- Giải thích: <nguyên nhân cụ thể>

**Vị trí code lỗi:**
- Test file: `projects/<name>/tests/<file>.spec.ts` dòng X–Y
  ```typescript
  // đoạn code test đang sai
  await expect(locator).toHaveText('...');
  ```
- App code (nếu là app bug): `<file>:<line>` — <mô tả>

**Hướng fix:**
- Nếu lỗi test: sửa `<selector/assertion>` thành `<cái đúng>`
- Nếu lỗi app:
  - File: `<path>`
  - Thay đổi: <mô tả cụ thể cần sửa>
  - Ví dụ:
    ```<lang>
    // Before:
    <code cũ>
    // After:
    <code mới>
    ```
```

Phân loại lỗi:
- **Selector sai** → sửa trong test file, tiếp tục
- **Assertion fail (expected vs actual)** → kiểm tra xem app đúng hay test sai → sửa tương ứng
- **App bug** → KHÔNG sửa test, ghi rõ vào report + hướng fix app code
- **Data thiếu** → tạo seed data hoặc fake data
- **Timeout** → tăng timeout hoặc điều tra app latency
```

### Bước 7c: Di chuyển seed file về thư mục dùng chung

Sau khi sinh report, nếu có seed file trong `projects/<name>/tests/`:

```bash
SEEDS_DIR="/home/user/ai-automation-test/automation/seeds/<name>"
mkdir -p "$SEEDS_DIR"
# Move tất cả seed*.spec.ts về seeds/
find projects/<name>/tests/ -name "seed*.spec.ts" | while read f; do
  mv "$f" "$SEEDS_DIR/"
  echo "Moved: $f → $SEEDS_DIR/"
done
```

Sau đó ghi note vào report:
```
📦 Seed files đã move về: automation/seeds/<name>/
```

### Bước 7d: Ghi kết quả vào Google Sheet / Google Doc (chỉ khi có flag)

Áp dụng với **mọi project, mọi mode** (normal, fast, live). Chạy sau khi sinh report.

**Quy tắc kích hoạt:**
- Chỉ ghi khi user truyền **`--sheet=<url>`** hoặc **`--doc=<url>`** tường minh
- Input là Google Sheet/Doc URL **KHÔNG tự động ghi ngược** — phải có flag mới ghi
- Không có flag → bỏ qua toàn bộ bước này, không báo lỗi

#### Xác định Sheet URL để ghi

```bash
# Chỉ lấy từ flag --sheet — không đọc source-meta, không đọc .env
SHEET_URL="<giá trị --sheet nếu user truyền>"

# Không có --sheet → bỏ qua, không ghi sheet
```

#### Ghi về Google Sheet

Tab ghi = giá trị `--sheet-tab` từ Bước 1 (cùng flag dùng cho cả đọc lẫn ghi). Không có `--sheet-tab` → script tự detect từ header.

```bash
cd /home/user/ai-automation-test/automation
node scripts/write-results-to-sheet.mjs \
  --sheet="$SHEET_URL" \
  --project=<name> \
  --run-id=<run-id> \
  --healed=<n> \
  ${SHEET_TAB_FLAG:+--sheet-tab="$SHEET_TAB_FLAG"}
# SHEET_TAB_FLAG = giá trị --sheet-tab user truyền (rỗng nếu không truyền)
```

Script tự phân tích header → tìm và điền vào các cột:

| Script nhận diện cột | Ghi gì |
|---|---|
| `Chrome`, `Chromium` | Kết quả trên Chromium (`✅ PASS` / `❌ FAIL`) |
| `Safari`, `WebKit` | Kết quả trên WebKit (nếu có) |
| `Firefox` | Kết quả trên Firefox (nếu có) |
| `Status`, `Kết quả` | Kết quả tổng hợp (KHÔNG match `Expected Results` — xem RC5) |
| `Tester`, `Tested by`, `QA` | `Claude AI` |
| `Test date`, `Date`, `Ngày` | Ngày giờ chạy |
| `Notes`, `Error`, `Ghi chú` | Error message nếu fail |

Match test case theo TC-number (`TC-01`...) trước, fallback fuzzy text. Nếu cột không nhận diện được → script in headers và exit, chỉ định thủ công:
```bash
node scripts/write-results-to-sheet.mjs ... \
  --match-col="Test Case" --result-col="Status" --date-col="Test date" --tester-col="Tester"
```

Nếu muốn dùng **sheet lịch sử riêng** (append dòng mới thay vì update dòng cũ):
```bash
node scripts/write-results-to-sheet.mjs \
  --mode=tracking \
  --sheet="<tracking-sheet-url>" \
  --project=<name> \
  --run-id=<run-id> \
  --healed=<n>
```

#### Xác định Doc URL để ghi

```bash
# Chỉ lấy từ flag --doc — không đọc source-meta, không đọc .env
DOC_URL="<giá trị --doc nếu user truyền>"

# Không có --doc → bỏ qua, không ghi doc
```

#### Ghi về Google Doc (`--doc=<url>`)

Nếu `DOC_URL` xác định được từ logic trên:

```bash
cd /home/user/ai-automation-test/automation
node scripts/write-results-to-doc.mjs \
  --doc="<doc-url>" \
  --project=<name> \
  --run-id=<run-id> \
  --healed=<n>
```

Append 1 section vào cuối Doc: separator + date + status + đường dẫn report/video.

#### Quy tắc chung

- Không báo lỗi nếu `--sheet`/`--doc` không được truyền — bỏ qua bước này hoàn toàn
- Path Report/Video: tự detect OS (WSL2 → UNC path, Linux/macOS → `file://`)
- Cả hai có thể dùng cùng lúc: `--sheet=<url> --doc=<url>`

### Bước 7e: Lưu source-meta — BẮT BUỘC sau mỗi run

> ⚠️ **Bước này PHẢI chạy sau mỗi run, dù test pass hay fail.** Nếu bỏ qua, lần chạy tiếp theo luôn bị coi là "lần đầu" → generate lại spec+test không cần thiết → lãng phí token và thời gian.

```bash
cd /home/user/ai-automation-test/automation
# ⚠️ PHẢI dùng --strip-result-cols — giống hệt lệnh hash ở Bước 1b.
# Nếu hash ở 1b và 7e tính trên nội dung khác nhau → so sánh vô nghĩa.
CONTENT=$(node scripts/load-google-sheet.mjs "<sheet-url>" --sheet="<tab>" --format=markdown --strip-result-cols 2>/dev/null) && \
mkdir -p projects/<name>/specs/.source-meta && \
python3 -c "
import json, hashlib, sys, datetime
content = sys.stdin.read()
h = 'sha256:' + hashlib.sha256(content.encode()).hexdigest()
meta = {
  'input': '<original-url-hoặc-path>',
  'content_hash': h,
  'last_tested': datetime.datetime.utcnow().isoformat() + 'Z',
  'run_id': '<run-id>',
  'spec_file': 'projects/<name>/specs/<slug>.md',
  'test_file': 'projects/<name>/tests/<slug>.spec.ts',
  'sheet_tab': '<tab-name-hoặc-rỗng>',
  'input_slug': '<slug>'
}
json.dump(meta, open('projects/<name>/specs/.source-meta/<slug>.json','w'), ensure_ascii=False, indent=2)
print('[meta] Saved')
" <<< "\$CONTENT"
```

Sau khi lưu xong, in ra chat:
```
💾 Source-meta saved: projects/<name>/specs/.source-meta/<slug>.json
```

---

## Xử lý env thay đổi khi test

Khi test cần cover trạng thái mà env hiện tại không thỏa (ví dụ feature flag cần flip), có 2 phương án:

### Phương án 1: Mock (không cần đổi env thật)

Dùng `TEST_MOCK_<TÊN_BIẾN>` — nhanh, không rủi ro, nhưng chỉ bypass logic skip:
```bash
TEST_MOCK_CATALOGUE_ENABLED=true SPEC_FILE=... ./scripts/run-test.sh <name>
```
Áp dụng: test nhanh branch logic, TC không phụ thuộc server-rendered HTML.

### Phương án 2: Đổi env thật trong container (BẮT BUỘC confirm trước)

Khi test cần server render đúng với flag mới (header, sidebar, page content...), phải đổi env thật.

**Quy trình bắt buộc:**

1. **Confirm với user trước** — in rõ:
   ```
   Để test <TC-list> cần đổi <VAR>=<old> → <VAR>=<new> trong container <container_name>.
   Sẽ restore về <old> sau khi test xong.
   Bạn đồng ý không? (Yes/No)
   ```
2. **Chờ user xác nhận** — KHÔNG tự đổi nếu chưa có "Yes" rõ ràng
3. **Đổi env** sau khi được confirm:
   ```bash
   docker exec <container> sed -i 's/<VAR>=<old>/<VAR>=<new>/' <env_file>
   ```
4. **Chạy test**
5. **Restore về giá trị gốc — BẮT BUỘC, kể cả khi test fail**:
   ```bash
   docker exec <container> sed -i 's/<VAR>=<new>/<VAR>=<old>/' <env_file>
   ```
6. **Ghi vào report**: env đã được thay đổi trong quá trình test và đã restore

> ❗ Nếu user từ chối confirm → đánh dấu TC là BLOCKED trong report, giải thích lý do.

## Bảo mật

- `.env` của project luôn gitignore (`automation/projects/*/.env`)
- `service-auth.json` ở `APP_ROOT/service-auth.json` (gitignore)
- Không log credentials vào report

## Liên quan

- Rule `nta-no-screen-capture.md` — headless only
- Rule `nta-no-speculation.md` — không đoán khi spec mơ hồ
- Setup: `/home/user/ai-automation-test/setup.sh`
