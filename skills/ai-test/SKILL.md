---
name: ai-test
description: "Auto-pilot E2E test. Một lệnh slash → AI tự plan, generate, run headless (Docker), auto-repair, sinh báo cáo + video."
argument-hint: "<url|file|sheet|description> --project=<name> [--target=<url>] [--max-heal=3] [--interactive]"
---

# AI Automation Test — SKILL

> ⚠️ **ĐỌC 2 FILE NÀY TRƯỚC KHI LÀM BẤT CỨ ĐIỀU GÌ:**
> 1. File này (1 Read duy nhất, offset=1 limit=2000)
> 2. `Read skills/ai-test/rules/RULES.md` (Bước 0 — bắt buộc)
>
> Sau khi đọc RULES.md, xuất ngay: `✅ RULES đã đọc | Nắm: #1 #2 ... #17`
> Không xuất dòng này = chưa đọc rules = vi phạm INC-04.

## Paths — TỰ SUY RA, KHÔNG hardcode

> ⚠️ Tool có thể được clone ở path bất kỳ, trên máy bất kỳ (Linux/WSL/macOS).
> **APP_ROOT = đường dẫn bạn vừa Read file SKILL.md này, bỏ đuôi `/skills/ai-test/SKILL.md`.**
> Ví dụ đọc `/Users/an/ai-automation-test/skills/ai-test/SKILL.md` → `APP_ROOT=/Users/an/ai-automation-test`.
> Đặt biến 1 lần ở Bước 2 rồi dùng xuyên suốt:

```
APP_ROOT     = <thư mục chứa repo — tự suy từ path đọc SKILL.md>
HUB          = $APP_ROOT/automation
PROJECTS     = $APP_ROOT/automation/projects
SERVICE_AUTH = $APP_ROOT/service-auth.json   (Google Sheets - optional)
```

Mọi lệnh bash chạy sau `cd "$APP_ROOT/automation"` → dùng path **tương đối** (`scripts/...`, `projects/...`).
Script (.sh/.mjs) đều tự định vị nên gọi bằng path tương đối luôn đúng.

## Dashboard status (BẮT BUỘC gọi đầu mỗi bước)

```bash
# Chạy sau khi đã cd "$APP_ROOT/automation"
bash scripts/update-status.sh <step> <key> "<project>" "<msg>" [heal] [mode] [status]
```
Dashboard: `http://localhost:8765`

---

## Bước 0: Đọc RULES.md — BẮT BUỘC

RULES.md nằm CÙNG thư mục skills với file này — `$APP_ROOT/skills/ai-test/rules/RULES.md`:
```
Read <APP_ROOT>/skills/ai-test/rules/RULES.md
```

Sau khi đọc, xuất ngay dòng self-check trước khi tiếp tục:
```
✅ RULES đã đọc | Nắm: #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17
```

---

## Bước 1: Parse arguments

> 📊 `bash scripts/update-status.sh 1 s1 "<name>" "Parsing arguments..." 0 normal`

Flags:
- `--project=<name>` — BẮT BUỘC. Thiếu → HỎI, không đoán.
- `--target=<base_url>` — URL app cần test
- `--max-heal=<n>` — default 3
- `--interactive` — default OFF
- `--rerun` — chạy lại test cũ, bỏ qua Bước 1b
- `--only=<test>` — chạy 1 test
- `--fast` — **set `TEST_FAST=1`** (tắt video/trace, 4 workers, skip heal, report 3 dòng)
- `--live` — **set `TEST_LIVE=1`** (headed mode + VNC tại http://localhost:6080/vnc.html). **CHỈ dùng khi user yêu cầu xem trực tiếp** — live có slowMo 600ms + countdown 12s → chậm hơn nhiều. Autonomous run mặc định headless normal.
- `--sheet=<url>` — ghi kết quả vào Google Sheet sau test (Bước 7d). Cần `service-auth.json`.
- `--sheet-tab=<name>` — tên tab (vd: `--sheet-tab="Test Cases"`). Auto-detect nếu bỏ qua.
- `--doc=<url>` — ghi kết quả vào Google Doc sau test (Bước 7d). Cần `service-auth.json`.
- `--screens` — **bật cơ chế SCREENS.md** (knowledge map màn hình): tái dùng URL/selector/flow + data recipe đã lưu để viết test nhanh hơn, chính xác hơn, ít heal hơn. Lần đầu chưa có file → crawl 1 lần sinh ra. → **Đọc `skills/ai-test/steps/STEP-screens.md`**. Không có flag → bỏ qua, giữ hành vi cũ.

Input types:
| Dạng | Nhận diện | Loader |
|---|---|---|
| Google Sheet | `docs.google.com/spreadsheets` | `scripts/load-google-sheet.mjs` + `service-auth.json` |
| Google Doc | `docs.google.com/document` | `scripts/load-google-doc.mjs` + `service-auth.json` |
| Confluence | `*.atlassian.net/wiki` | `scripts/load-confluence.mjs` + `CONFLUENCE_EMAIL/TOKEN` |
| URL khác | `http(s)://` | WebFetch |
| File | Có `/` hoặc đuôi `.pdf/.md/.xlsx/.csv` | Read |
| Mô tả | Còn lại | Trực tiếp |

### Bước 1b: Kiểm tra thay đổi spec so với lần trước

> 📊 `bash scripts/update-status.sh 1 s1b "<name>" "Detecting spec changes..." 0 normal`

> Áp dụng mọi project và mọi mode. Ngoại lệ: `--rerun` → bỏ qua toàn bộ bước 1b.

Metadata: `projects/<name>/specs/.source-meta/<slug>.json`

```bash
# Hash nội dung spec hiện tại
# Google Sheet: BẮT BUỘC --strip-result-cols khi hash
CONTENT=$(node scripts/load-google-sheet.mjs "<url>" --sheet="<tab>" --format=markdown --strip-result-cols 2>/dev/null)
CURRENT_HASH=$(echo "$CONTENT" | sha256sum | cut -d' ' -f1)

# Lấy hash lần trước
STORED_HASH=$(python3 -c "
import json,sys
try:
  d=json.load(open('projects/<name>/specs/.source-meta/<slug>.json'))
  print(d.get('content_hash',''))
except: print('')
" 2>/dev/null)
```

| Tình huống | Hành động |
|---|---|
| Lần đầu (chưa có meta) | Chạy đầy đủ Bước 3–7 |
| Hash **giống** | Bỏ qua Bước 3–5, chạy thẳng Bước 6 với test file cũ |
| Hash **khác** | Cập nhật ngay, chạy lại Bước 3–5 → 6 |
| `--rerun` | Bỏ qua check, chạy thẳng test file cũ |

Khi phát hiện thay đổi → báo ngắn rồi tự cập nhật:
```
⚠️ Test case đã thay đổi (run cũ: <run-id>). Đang cập nhật test plan + code...
```

**Sheet là source of truth:** Khi sheet thay đổi, mọi quyết định trong memory về TC cụ thể bị override — sheet thắng.

---

## Bước 2: Switch context

> 📊 `bash scripts/update-status.sh 2 s2 "<name>" "Switching context..." 0 normal`

```bash
cd $APP_ROOT/automation
export TEST_PROJECT=<name>
```

Check nhanh: Docker daemon, `automation/.claude/agents/playwright-test-*.md` có đủ 3 file? Thiếu → hướng dẫn chạy `./setup.sh`.

---

## Bước 3: Đọc input + trích scenarios

> 📊 `bash scripts/update-status.sh 3 s3 "<name>" "Loading input + extracting scenarios..." 0 normal`

### Quy tắc sinh slug

| Input | Slug |
|---|---|
| File local | Tên file không extension: `login-spec.md` → `login-spec` |
| Google Sheet (không tab) | `sheet_<8-ký-tự-đầu-id>`: `sheet_1SopqsJc` |
| Google Sheet + tab | `sheet_<8-ký-tự-đầu-id>_<tab-slug>`: `sheet_1SopqsJc_tng-30` |
| Google Doc | `doc_<8-ký-tự-đầu-docId>` |
| Confluence | `confluence_<pageId>` |
| URL khác | Slug hóa domain+path cuối, cắt 40 ký tự |
| Mô tả text | 4-5 từ đầu slug hóa |

Tab slug: lowercase, space/special → `-`, bỏ dấu tiếng Việt.

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
SHEET_ID=$(echo '<url>' | grep -oP '(?<=/d/)[^/]+')
SLUG="sheet_${SHEET_ID:0:8}${TAB_SLUG:+_$TAB_SLUG}"
node scripts/load-google-sheet.mjs "<url>" --sheet="<tab>" --format=markdown 2>/dev/null \
  > "projects/<name>/specs/${SLUG}.md"
```

> ⚠️ Spec file tạo bằng shell redirect. Nếu Bước 4 dùng Write tool → PHẢI Read file trước.

**Google Doc:**
```bash
node scripts/load-google-doc.mjs "<url>" --out="projects/<name>/specs/${SLUG}.md"
# ⚠️ Dùng --out=<path> (có dấu =), không dùng dạng space
```

**File local / URL:** đọc trực tiếp, slug từ tên file hoặc domain.

Nếu `<slug>.md` đã tồn tại → lần chạy lại, chỉ update nội dung nếu hash thay đổi.

---

## Bước 3b: Kiểm tra data thiếu → tự động xử lý

> 📊 `bash scripts/update-status.sh 3 s3b "<name>" "Checking and seeding test data..." 0 normal`

→ **Đọc `skills/ai-test/steps/STEP-3b-seed.md`** để biết quy trình đầy đủ.

**Tóm tắt:** Rà từng scenario, xác định data thiếu. Tự seed hoặc fake — KHÔNG hỏi user (trừ case bị block bởi third-party plugin → Rule #15 trong RULES.md). Kiểm tra schema trước khi INSERT. Dùng AI_KEY marker cho mọi seed record. Ghi 1 dòng log vào report nếu có tạo data. Đi thẳng Bước 4.

**Nếu có `--screens`:** ưu tiên "data recipe" trong `projects/<name>/SCREENS.md` (thứ tự API > UI flow > DB-chỉ-local). DB trực tiếp chỉ dùng khi reachable (local); dev/stg không expose DB → tạo data qua API/UI theo recipe. Chưa có recipe → tạo rồi ghi ngược vào SCREENS.md.

---

## Bước 4: Sinh test plan

> 📊 `bash scripts/update-status.sh 4 s4 "<name>" "Generating test plan..." 0 normal`

**Chọn cách plan theo input (tiết kiệm thời gian):**
- **Sheet/spec đã có TC chi tiết** (steps + expected result từng row) → sheet CHÍNH LÀ plan. Map thẳng rows → plan format, KHÔNG gọi planner agent (agent browse app từng bước = chậm và thừa).
- **Input là mô tả tự do / URL cần khám phá** → dùng Agent `playwright-test-planner`.
- Fallback (không có agent): tự sinh `projects/<name>/specs/<slug>.md` với format: scenario title, pre-conditions, steps, expected outcomes, selector hints.

**Nếu có `--screens`:** SCREENS.md chưa có → đây là lúc crawl 1 lần (planner duyệt các màn trong scope) sinh `projects/<name>/SCREENS.md`. Đã có → đọc để lấy selector/flow, chỉ browse màn còn thiếu. Xem STEP-screens.md.

Auto mode → Bước 5. Interactive mode → hiển thị plan, chờ OK.

---

## Bước 5: Sinh test code

> 📊 `bash scripts/update-status.sh 5 s5 "<name>" "Generating test code..." 0 normal`

**Chọn cách generate theo loại TC (tiết kiệm thời gian):**
- **TC dạng API/HTTP/DB** (assert status code, response body, DB count — không thao tác UI phức tạp) → tự viết thẳng vào `projects/<name>/tests/<slug>.spec.ts`, KHÔNG cần generator agent chạy từng bước browser.
- **TC dạng UI** (form, navigation, modal, selector phức tạp) → dùng Agent `playwright-test-generator` (khám phá DOM thật trước khi viết → ít lỗi selector, ít vòng heal).
- 1 spec có cả 2 loại → agent lo phần UI, tự viết phần API — vẫn gộp chung 1 file.
- Fallback (không có agent): tự viết toàn bộ.

**TC ID phải khớp 1-1 với sheet/spec:**
- Sheet ID `31` → test tên `TC-31: ...`. TUYỆT ĐỐI KHÔNG đánh số lại, không thêm suffix chữ cái mới.
- Suffix chữ cái CHỈ dùng khi 1 TC trong sheet tách nhiều test con (cùng map 1 row).
- Sau generate: đếm số TC spec = số TC ID duy nhất trong test file. Thiếu/thừa → sửa ngay.

**Đọc HTML/view trước khi viết test** — xác nhận: submit button text, flash message selector, nav link text, form field names.
Nếu có `--screens` và SCREENS.md đã có selector/flow màn cần dùng → lấy thẳng từ đó, KHỎI browse lại (nhanh hơn, ít heal hơn).

Quy tắc viết test:
- Selector: `getByRole` > `getByLabel` > `getByText` > CSS
- Wait: dùng auto-wait của Playwright, KHÔNG `waitForTimeout`
- Credentials: `process.env.TEST_USER`, `process.env.TEST_PASS`
- **Spec-first:** expected value trong assertion lấy NGUYÊN VĂN từ spec/sheet — KHÔNG lấy từ app source/config/behavior quan sát được. Mỗi TC có comment traceability trước assertion chính.
- **Login lặp lại → dùng `storageState`:** nếu nhiều TC cùng cần login, login 1 lần qua setup project (`login.setup.ts` + `storageState` trong config), KHÔNG `beforeEach` login UI từng test — nhanh hơn và ít flaky hơn.
- **Screenshot evidence BẮT BUỘC** mỗi TC — chụp SAU assertion chính:

```typescript
test('TC-X: <title>', async ({ page }, testInfo: TestInfo) => {
  // ... Arrange + Act ...
  // SPEC: row 15 — "403 Hourly registration limit exceeded"
  await expect(locator).toBeVisible(); // assertion chính
  await page.screenshot({ path: testInfo.outputPath('evidence.png') });
});
```

**Mock env (feature flag):**
```typescript
const mockVal = process.env.TEST_MOCK_<TÊN_BIẾN>;
if (mockVal === 'true' || mockVal === 'false') {
  featureEnabled = mockVal === 'true';
} else {
  featureEnabled = await detectFromPage(page);
}
```

Auto mode → Bước 6. Interactive mode → hiển thị code, chờ confirm.

---

## Bước 6: Execute + auto-heal

> 📊 `bash scripts/update-status.sh 6 s6 "<name>" "Running tests in Docker..." 0 normal`

```bash
cd $APP_ROOT/automation
SPEC_FILE="projects/<name>/tests/<slug>.spec.ts" ./scripts/run-test.sh <name>
# --fast: TEST_FAST=1 SPEC_FILE=... ./scripts/run-test.sh <name>
# --live: TEST_LIVE=1 SPEC_FILE=... ./scripts/run-test.sh <name>
# --rerun: ./scripts/run-test.sh <name>  (không có SPEC_FILE)
# --only: ... --grep "<test>"
# Heal rerun: TEST_RUN_ID="${RUN_ID}_h1" SPEC_FILE=... ./scripts/run-test.sh <name>  (Rule #17 — KHÔNG dùng RUN_ID gốc)
```

Đọc `Run ID:` từ output wrapper. KHÔNG tự đoán.

> 🔒 run-test.sh tự chạy 2 guard trước khi test: (1) chặn RUN_ID đã có artifacts (Rule #17), (2) `lint-test.sh` chặn fake assertion / `test.skip` che bug (Rule #15). Bị chặn → sửa test code theo spec, KHÔNG bypass guard.

**`--fast` mode:** bỏ qua heal → thẳng Bước 7 compact (3 dòng, không sinh file).

**Normal mode, có fail — heal loop:**
```
heal_count = 0
while heal_count < max_heal AND có fail:
  📊 bash scripts/update-status.sh 6 s6 "<name>" "Healing attempt <heal_count+1>: <TC đang fail>" <heal_count+1> normal
  0. Đọc spec → xác định expected behavior của TC đang fail
  1. Extract lỗi từ results.json — KHÔNG Read raw JSON (file lớn tốn token/chậm):
       python3 -c "
       import json
       d=json.load(open('projects/<name>/test-results/runs/<run-id>/results.json'))
       def walk(suites):
           for s in suites:
               for sp in s.get('specs',[]):
                   for t in sp.get('tests',[]):
                       for r in t.get('results',[]):
                           if r.get('status') not in ('passed','skipped'):
                               errs=' | '.join(e.get('message','')[:300] for e in r.get('errors',[]))
                               print(f\"{sp['title']} :: {r.get('status')} :: {errs}\")
               walk(s.get('suites',[]))
       walk(d.get('suites',[]))"
  2. Phân loại TỪNG TC fail:
     ĐƯỢC sửa: selector không match, timing, locator fragile
     KHÔNG sửa: expected value, assertion text, count, flow logic
       → App bug → để fail, ghi vào report
     (Nếu có `--screens` và fix là selector do UI đổi → ghi selector mới NGƯỢC vào
      projects/<name>/SCREENS.md + cập nhật content_hash. Xem STEP-screens.md.)
  3. Patch test code — GỘP các TC fail cùng root cause vào 1 lần patch
     (vd cùng 1 helper/selector dùng chung → sửa 1 chỗ, heal N TC trong 1 vòng)
  4. [CRITICAL] Heal rerun PHẢI dùng HEAL_RUN_ID riêng — KHÔNG ĐƯỢC dùng RUN_ID gốc:
       HEAL_RUN_ID="${RUN_ID}_h${heal_count}"
       TEST_RUN_ID="$HEAL_RUN_ID" SPEC_FILE=... ./scripts/run-test.sh <name> --grep "TC-14:|TC-20:"
     (--grep gộp TẤT CẢ TC vừa patch trong vòng này — dùng prefix "TC-<n>:", 1 lần rerun cho cả batch)
     ⚠️ run-test.sh sẽ tự động EXIT 1 nếu phát hiện artifacts đã tồn tại trong RUN_ID.
        Nếu gặp lỗi này → đang dùng sai RUN_ID → phải dùng HEAL_RUN_ID.
  5. Merge kết quả heal vào run gốc:
     a. Copy artifacts của TC vừa pass từ heal dir → original artifacts dir:
          cp -r "projects/<name>/test-results/runs/${HEAL_RUN_ID}/artifacts/." \
                "projects/<name>/test-results/runs/${RUN_ID}/artifacts/"
     b. Cập nhật results.json gốc (chỉ update TC healed, giữ nguyên phần còn lại):
          python3 << 'PY'
          import json
          orig = json.load(open(f'projects/<name>/test-results/runs/{RUN_ID}/results.json'))
          heal = json.load(open(f'projects/<name>/test-results/runs/{HEAL_RUN_ID}/results.json'))
          heal_map = {}
          def extract(suites):
              for s in suites:
                  for spec in s.get('specs', []):
                      for t in spec.get('tests', []):
                          for r in t.get('results', []):
                              heal_map[spec['title']] = r.get('status', 'unknown')
                  extract(s.get('suites', []))
          for suite in heal.get('suites', []): extract(suite)
          def update(suites):
              for s in suites:
                  for spec in s.get('specs', []):
                      if spec['title'] in heal_map and heal_map[spec['title']] == 'passed':
                          for t in spec.get('tests', []):
                              for r in t.get('results', []): r['status'] = 'passed'
                  update(s.get('suites', []))
          for suite in orig.get('suites', []): update(suite)
          json.dump(orig, open(f'projects/<name>/test-results/runs/{RUN_ID}/results.json','w'), ensure_ascii=False, indent=2)
          print('[heal-merge] results.json updated')
          PY
     c. Xóa heal dir để tiết kiệm disk:
          rm -rf "projects/<name>/test-results/runs/${HEAL_RUN_ID}"
  heal_count += 1
```

> ⚠️ **Lý do KHÔNG dùng `TEST_RUN_ID=<original>` cho heal rerun:**
> `run-test.sh` có guard tự động kiểm tra: nếu `artifacts/` đã tồn tại và có data → **exit 1** ngay lập tức.
> Đây là bảo vệ cứng ở script level — không thể bypass. Heal PHẢI dùng HEAL_RUN_ID riêng.

**TUYỆT ĐỐI KHÔNG** thêm `test.fail()`, `test.skip()`, `test.fixme()` để che bug (trừ khi spec yêu cầu rõ hoặc TC BLOCKED per Rule #15).

Sau max_heal hoặc xác định app bug → ghi nhận ngắn gọn → **TIẾP TỤC NGAY sang Bước 6b.**

---

## Bước 6b: Convert video webm → mp4

> ⚠️ **BẮT BUỘC — KHÔNG SKIP.** Phải chạy sau MỌI lần test, kể cả 100% pass.

> 📊 `bash scripts/update-status.sh 6 s6b "<name>" "Converting videos..." 0 normal`

```bash
cd $APP_ROOT/automation
./scripts/convert-videos.sh <name> <run-id>
```

Script tự lo: convert webm→mp4 song song 4 luồng + ghép `full-session.mp4` theo **đúng thứ tự chạy test** (mtime). KHÔNG tự viết lệnh ffmpeg inline thay script.

Lần đầu chưa build image: `docker compose build playwright` trước.

---

## Bước 7: Tổng hợp report

> ⚠️ **BẮT BUỘC — KHÔNG SKIP DÙ TEST FAIL HAY HEAL HẾT.**

> 📊 `bash scripts/update-status.sh 7 s7 "<name>" "Generating report..." 0 normal`
> Xong hết: `bash scripts/update-status.sh 7 s7 "<name>" "Done" 0 normal done`

**`--fast` mode — compact, không sinh file:**
```
⚡ Fast run — project `<name>` | Run ID: <run-id>
📊 Total: N | ✅ Pass: x | ❌ Fail: y
📄 JSON: file://$APP_ROOT/automation/projects/<name>/test-results/runs/<run-id>/results.json
```

**Normal mode:** → **Đọc `skills/ai-test/steps/STEP-report.md`** để biết format đầy đủ.

**Xác nhận path trước khi viết:**
```bash
ls "projects/<name>/test-results/runs/<run-id>/results.json" && echo "✅ OK" || echo "❌ SAI PATH"
```

---

## Bước 7c: Di chuyển seed file

```bash
SEEDS_DIR="$APP_ROOT/automation/seeds/<name>"
mkdir -p "$SEEDS_DIR"
find projects/<name>/tests/ -name "seed*.spec.ts" | while read f; do
  mv "$f" "$SEEDS_DIR/"
done
```

Ghi note vào report: `📦 Seed files đã move về: automation/seeds/<name>/`

---

## Bước 7d: Ghi kết quả vào Google Sheet / Doc (chỉ khi có flag)

Chỉ ghi khi có `--sheet=<url>` hoặc `--doc=<url>`. Không có flag → bỏ qua.

→ **Đọc `skills/ai-test/steps/STEP-7d-sheet.md`** để biết chi tiết.

---

## Bước 7e: Lưu source-meta — BẮT BUỘC sau mỗi run

> ⚠️ Phải chạy sau mỗi run. Thiếu → lần sau phải generate lại từ đầu.

```bash
cd $APP_ROOT/automation
# ⚠️ Dùng --strip-result-cols giống hệt Bước 1b
CONTENT=$(node scripts/load-google-sheet.mjs "<url>" --sheet="<tab>" --format=markdown --strip-result-cols 2>/dev/null) && \
mkdir -p projects/<name>/specs/.source-meta && \
python3 -c "
import json, hashlib, datetime, sys
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

In ra chat: `💾 Source-meta saved: projects/<name>/specs/.source-meta/<slug>.json`

---

## Xử lý env thay đổi khi test

### Phương án 1: Mock (không đổi env thật)
```bash
TEST_MOCK_<BIẾN>=true SPEC_FILE=... ./scripts/run-test.sh <name>
```

### Phương án 2: Đổi env thật trong container (BẮT BUỘC confirm)

1. In rõ: `Để test <TC-list> cần đổi <VAR>=<old>→<new> trong <container>. Restore sau. Đồng ý?`
2. Chờ "Yes" — KHÔNG tự đổi
3. Đổi: `docker exec <container> sed -i 's/<old>/<new>/' <env_file>`
4. Chạy test
5. Restore BẮT BUỘC dù fail: `docker exec <container> sed -i 's/<new>/<old>/' <env_file>`
6. Ghi vào report: env đã thay đổi và đã restore

User từ chối → đánh dấu TC là BLOCKED.

---

## Bảo mật

- `.env` project gitignore (`automation/projects/*/.env`)
- `service-auth.json` ở `APP_ROOT/service-auth.json` (gitignore)
- Không log credentials vào report

## Liên quan

- `skills/ai-test/rules/RULES.md` — 16 nguyên tắc bất biến (BẮT BUỘC đọc ở Bước 0)
- `skills/ai-test/steps/STEP-3b-seed.md` — quy tắc seed data chi tiết
- `skills/ai-test/steps/STEP-report.md` — template AI_REPORT.md đầy đủ
- `skills/ai-test/steps/STEP-7d-sheet.md` — ghi kết quả vào Google Sheet/Doc
- `skills/ai-test/steps/STEP-screens.md` — cơ chế SCREENS.md (knowledge map màn hình, opt-in `--screens`)
- Rule `nta-no-screen-capture.md` — headless only
- Setup: `$APP_ROOT/setup.sh`
