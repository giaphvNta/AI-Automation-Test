# AI Automation Test

> **1 lệnh `/ai-test` → AI tự plan, generate, chạy headless, auto-repair, sinh báo cáo + video.**  
> Dev không cần làm gì ngoài gõ lệnh và xem kết quả.

---

## Mục lục

1. [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
2. [Cài đặt / Gỡ cài đặt](#cài-đặt-lần-đầu)
3. [Cách dùng](#cách-dùng)
4. [Chế độ chạy](#chế-độ-chạy)
5. [Xem kết quả](#xem-kết-quả)
6. [Dashboard real-time](#dashboard-real-time)
7. [Flags tham chiếu](#flags-tham-chiếu)
8. [Thêm project mới](#thêm-project-mới)
9. [Setup Google Sheets / Docs](#setup-google-sheets--docs)
10. [Cấu trúc thư mục](#cấu-trúc-thư-mục)
11. [Troubleshooting](#troubleshooting)

---

## Yêu cầu hệ thống

| Thành phần | Yêu cầu | Ghi chú |
|---|---|---|
| OS | Windows + WSL2 hoặc macOS | Windows đã verify trên Ubuntu 22/24; macOS chạy trực tiếp bằng Terminal |
| Docker Desktop | >= 24.0 | **BẮT BUỘC** — chạy Chromium trong container |
| VS Code | >= 1.105 | Để dùng Claude Code extension |
| Claude Code extension | Bất kỳ | Để dùng slash command |
| Node.js (WSL/macOS) | >= 18 | Thường đã có sẵn |

---

## Cài đặt lần đầu

> Chạy **1 lần duy nhất** trên mỗi máy. Sau khi cài, `/ai-test` và `/ai-test-i` dùng được từ **bất kỳ project nào** — không cần cấu hình thêm ở từng project.

### Bước 1: Chuẩn bị Docker Desktop

**Windows (WSL2):**
1. Mở **Docker Desktop** trên Windows
2. Settings → Resources → **WSL Integration**
3. Bật toggle cho distro Ubuntu → **Apply & Restart**

Verify trong WSL terminal:
```bash
docker --version
# Docker version 28.x.x
```

**macOS:**
1. Cài và mở **Docker Desktop**
2. Chờ Docker Desktop chạy ổn định

Verify trong Terminal:
```bash
docker --version
# Docker version 28.x.x
```

### Bước 2: Chạy setup script

```bash
cd ~/ai-automation-test   # thay bằng nơi bạn clone repo
./setup.sh
```

Script tự động:
- ✅ Kiểm tra Docker
- ✅ Verify automation hub (agents, config)
- ✅ Đăng ký slash command `/ai-test` + `/ai-test-i` vào `~/.claude/commands/` (global — dùng được mọi project)
- ✅ Tạo `.gitignore`

**Gỡ cài đặt** (xóa slash commands, giữ nguyên repo + Docker image):
```bash
cd ~/ai-automation-test   # thay bằng nơi bạn clone repo
./setup.sh --uninstall
```
Reload VSCode sau khi gỡ: `Ctrl+Shift+P` → **Developer: Reload Window**

### Bước 3: Build Docker image

Image được build local (bao gồm ffmpeg + VNC tools — dùng cho video + live view):

```bash
cd ~/ai-automation-test/automation   # thay bằng nơi bạn clone repo
docker compose build playwright
```

> Lần đầu mất ~3–5 phút (download base image ~1.5GB). Các lần sau nhanh hơn vì được cache.

### Bước 4: Reload VSCode

`Ctrl+Shift+P` → **Developer: Reload Window**

### Bước 5: Verify

Gõ trong Claude Code chat:
```
/ai-test
```
→ Hook validate **chặn** và nhắc thiếu `--project`/input — đó chính là dấu hiệu hook + command đã nạp đúng. Muốn vào chế độ tương tác (AI hỏi qua picker), gõ `/ai-test-i`.

---

## Cách dùng

### Cú pháp

```
/ai-test <input> --project=<tên-project> [options]
```

### Dạng input được hỗ trợ

| Dạng | Ví dụ | Ghi chú |
|---|---|---|
| Mô tả tự nhiên | `"Test login: nhập đúng → vào dashboard"` | |
| File spec | `./docs/login-spec.md` hoặc `.pdf`, `.xlsx`, `.csv` | |
| URL spec | `https://backlog.example.com/wiki/...` | |
| Google Sheet | `https://docs.google.com/spreadsheets/d/<ID>/edit` | cần `service-auth.json`; dùng `--sheet-tab=<tên>` để chỉ tab cụ thể |
| Google Doc | `https://docs.google.com/document/d/<ID>/edit` | cần `service-auth.json` — 🔧 chưa test |
| Confluence | `https://<domain>.atlassian.net/wiki/...` | cần `CONFLUENCE_EMAIL/TOKEN` — 🔧 chưa test |

### Ví dụ

**Test từ mô tả:**
```
/ai-test "Test login: nhập đúng → vào dashboard; nhập sai → hiện lỗi" --project=customer-a --target=https://staging.app.com
```

**Test từ file spec:**
```
/ai-test ./docs/login-spec.md --project=customer-a
```

**Test từ Google Sheet:**
```
/ai-test https://docs.google.com/spreadsheets/d/<ID>/edit --project=customer-a

# Chỉ định tab cụ thể (nếu sheet có nhiều tabs)
/ai-test https://docs.google.com/spreadsheets/d/<ID>/edit --project=customer-a --sheet-tab="Test Cases"
```
> Cần file `service-auth.json` — xem [Setup Google Sheets / Docs](#setup-google-sheets--docs). Nếu bỏ `--sheet-tab`, script sẽ dùng tab đầu tiên.

**Test từ Google Doc** 🔧:
```
/ai-test https://docs.google.com/document/d/<ID>/edit --project=customer-a
```
> Cần `service-auth.json` và Google Docs API được enable — xem [Setup Google Docs](#google-docs-input).

**Test từ Confluence** 🔧 (chưa test):
```
/ai-test https://<domain>.atlassian.net/wiki/spaces/<SPACE>/pages/<id> --project=customer-a
```
> Cần `CONFLUENCE_EMAIL` + `CONFLUENCE_TOKEN` — xem [Setup Confluence](#confluence-input).

**Chạy lại test đã có (không sinh code mới):**
```
/ai-test --rerun --project=customer-a
```

**Chỉ chạy 1 test cụ thể:**
```
/ai-test --only=login-success --project=customer-a
```

**Chế độ interactive (confirm từng bước trước khi chạy):**
```
/ai-test ./spec.md --project=customer-a --interactive
```

### Chế độ tương tác `/ai-test-i` (không cần nhớ flag)

Không muốn nhớ cú pháp flag? Gõ `/ai-test-i` — AI sẽ **hỏi qua picker** những gì còn thiếu:

```
/ai-test-i
```

→ AI lần lượt hiện picker để bạn chọn:
1. **Nguồn test** — dán Google Sheet URL / URL web / file spec, hoặc gõ mô tả.
2. **`--project`** — chọn từ danh sách project có sẵn (hoặc nhập project mới).
3. **Chế độ** — tick nhiều: `--fast`, `--live`, `--interactive`, `--rerun` (bỏ trống = Normal).

Sau khi đủ tham số, `/ai-test-i` chạy **đúng pipeline 7 bước của `/ai-test`** — mọi quy tắc (seed, heal, report, video) giống hệt. Bạn cũng có thể truyền sẵn một phần flag, AI chỉ hỏi phần còn thiếu:
```
/ai-test-i --project=customer-a          # chỉ còn hỏi nguồn test + chế độ
```

> **Hook validate:** Khi gõ `/ai-test` mà **thiếu `--project` hoặc input**, một hook (`UserPromptSubmit`) sẽ chặn lệnh và in hướng dẫn, tránh chạy nhầm với tham số không đầy đủ. `/ai-test-i` không bị chặn vì nó tự hỏi. Hook tự bỏ qua (fail open) nếu máy chưa cài `jq`.

### Điều gì xảy ra sau khi gõ lệnh?

```
Bạn gõ /ai-test ...
    ↓
AI đọc input → trích test scenarios
    ↓
🔍 Kiểm tra data — thiếu? → tự viết seed script hoặc fake data, KHÔNG hỏi
    ↓
🎭 Planner sinh kế hoạch test (plan.md)
    ↓
🎭 Generator viết test code (.spec.ts)
    ↓
Docker headless Chromium chạy test (1 worker tuần tự — tránh xung đột app state; override bằng TEST_WORKERS)
    ↓
Fail? → 🎭 Healer phân tích lỗi + tự fix + chạy lại (≤ 3 lần)
    ↓
📹 Convert video → mp4 + ghép full-session.mp4
    ↓
AI_REPORT.md + video.mp4 + HTML report
```

### Xử lý data thiếu tự động

AI tự động xử lý khi thiếu data — không cần báo trước:

| Thiếu gì | AI làm gì |
|---|---|
| Record DB (product, order, user) | Tự viết `seed.spec.ts` tạo data trước khi test |
| Trạng thái (approved, paid...) | Tự dùng API/DB helper setup trong test |
| Date range | Dùng ngày hiện tại ± 7 ngày |
| Search keyword | Dùng keyword generic (`%`, `a`) |
| Dropdown value | Lấy giá trị hợp lệ từ source code |

Fake data được ghi rõ trong report: `⚠️ Data tự sinh: ...` để phân biệt với data thật.

> AI chỉ dừng hỏi khi data **bắt buộc phải thật** và không thể fake được (ví dụ: 3rd-party credential, account có permission đặc biệt từ server).

**Dev không làm gì trong quá trình này.** Chỉ đợi kết quả cuối.

---

## Chế độ chạy

Có 3 chế độ phù hợp với nhu cầu khác nhau:

### Normal (mặc định) — Đầy đủ nhất

```
/ai-test <input> --project=<name>
```

- ✅ Ghi video toàn bộ (mỗi test 1 file + 1 full-session)
- ✅ Ghi trace để debug
- ✅ Auto-heal tối đa 3 lần
- ✅ HTML report đầy đủ
- 1 worker tuần tự (project có tests độc lập → set `TEST_WORKERS` trong `projects/<name>/.env`)

### Fast — Nhanh + tiết kiệm token

```
/ai-test <input> --project=<name> --fast
```

- ⚡ Tắt video + trace (chạy nhanh hơn đáng kể)
- ⚡ 4 workers song song
- ⚡ Bỏ qua heal loop
- ⚡ Báo cáo compact 3 dòng
- **Dùng khi**: muốn biết nhanh pass/fail, không cần debug

### Live — Xem test chạy trực tiếp

```
/ai-test <input> --project=<name> --live
```

- 🖥️ Browser hiển thị trên màn hình ảo bên trong Docker
- 🖥️ Mở `http://localhost:6080/vnc.html` trên trình duyệt máy host để xem
- 🖥️ Chạy chậm lại 600ms/action để dễ quan sát
- ✅ Vẫn ghi video + tạo report bình thường
- **Dùng khi**: muốn xem AI test làm gì step-by-step

> **Live mode trên WSL2/macOS:** Khi chạy, terminal sẽ đếm ngược 12 giây — mở `http://localhost:6080/vnc.html` trong lúc đếm, nhấn **Connect** để xem trực tiếp.

---

## Xem kết quả

Sau khi xong, AI in ra các đường dẫn file. Tất cả nằm trong:

```
automation/projects/<tên>/test-results/runs/<run-id>/
```

> **Format run-id:** `dd_mm_yyyy_HH_MM_SS_ms` — ví dụ `02_06_2026_09_15_30_412`

### Báo cáo AI (markdown)

```
automation/projects/<tên>/test-results/runs/<run-id>/AI_REPORT.md
```

Mở từ Windows Explorer (copy vào address bar):
```
\\wsl.localhost\Ubuntu\home\user\ai-automation-test\automation\projects\<tên>\test-results\runs\<run-id>\AI_REPORT.md
```

### Video từng test + video toàn session

| File | Mô tả |
|---|---|
| `artifacts/<test-name>/video.mp4` | Video từng test case |
| `artifacts/full-session.mp4` | Ghép toàn bộ test từ đầu đến cuối |

**Cách mở video theo OS:**

**Windows (WSL2)** — Copy path dạng UNC vào Windows Explorer hoặc VLC:
```
\\wsl.localhost\Ubuntu\home\user\ai-automation-test\automation\projects\<tên>\test-results\runs\<run-id>\artifacts\full-session.mp4
```

**macOS** — Mở Terminal và chạy:
```bash
open ~/ai-automation-test/automation/projects/<tên>/test-results/runs/<run-id>/artifacts/full-session.mp4
```

**Linux** — Mở bằng VLC hoặc file manager:
```bash
xdg-open ~/ai-automation-test/automation/projects/<tên>/test-results/runs/<run-id>/artifacts/full-session.mp4
```

> AI tự detect OS và in đúng format path trong report sau mỗi lần chạy.

### HTML Report (chi tiết nhất)

```bash
cd ~/ai-automation-test/automation

# Run mới nhất (tự chọn)
./scripts/show-report.sh <tên>

# Run cụ thể
./scripts/show-report.sh <tên> <run-id>
```

→ Script tự mở server, truy cập `http://localhost:9323` trên trình duyệt máy host.

> HTML Report chỉ có ở **Normal mode** (không có ở Fast mode).

### Trace (debug test fail)

```bash
cd ~/ai-automation-test/automation
docker compose run --rm playwright \
  npx playwright show-trace \
  projects/<tên>/test-results/runs/<run-id>/artifacts/<test-name>/trace.zip
```

---

## Dashboard real-time

Theo dõi trực tiếp pipeline đang chạy đến bước nào — hữu ích khi demo hoặc chạy test dài.

### Khởi động

```bash
cd ~/ai-automation-test/automation
bash scripts/start-dashboard.sh
```

Sau đó mở trên **trình duyệt máy host**:
```
http://localhost:8765/dashboard.html
```

> **Lưu ý:** Phải mở qua `http://localhost:8765` — KHÔNG mở trực tiếp file HTML (Live mode dùng `fetch()` bị CORS block qua `file://`).

### Hai chế độ

| Chế độ | Mô tả |
|---|---|
| **Demo** | Playback tự động 7 bước — dùng để thuyết trình. Có nút Play / Pause / Reset / Speed |
| **Live** | Poll `.test-status.json` mỗi 1.5s — hiển thị bước đang chạy thực tế |

Chuyển chế độ bằng nút **Demo / Live** góc trên phải.

### Hoạt động như thế nào (Live mode)

Mỗi khi AI chạy 1 bước trong pipeline, nó ghi trạng thái vào file `.test-status.json`. Dashboard poll file này liên tục và cập nhật UI. File được ghi tự động — không cần cấu hình thêm.

---

## Flags tham chiếu

| Flag | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `--project=<name>` | ✅ | — | Tên folder trong `projects/` |
| `--target=<url>` | Tùy | auto detect | Base URL của app cần test |
| `--max-heal=<n>` | Không | `3` | Số lần auto-repair tối đa |
| `--interactive` | Không | false | Confirm từng bước trước khi chạy |
| `--rerun` | Không | false | Chạy lại test cũ, không sinh code mới |
| `--only=<test>` | Không | — | Chỉ chạy 1 test theo tên |
| `--fast` | Không | false | Nhanh + ít token: tắt video/trace, 4 workers, bỏ heal |
| `--live` | Không | false | Xem live qua `http://localhost:6080/vnc.html` |
| `--screens` | Không | false | Dùng knowledge map màn hình `projects/<name>/SCREENS.md` (URL/selector/flow + data recipe) → viết test nhanh hơn, chính xác hơn, ít heal hơn. Lần đầu crawl 1 lần sinh file; UI đổi thì tự cập nhật ngược khi heal. Chỉ chứa cách tương tác, **không** chứa expected value |
| `--sheet=<url>` | Không | — | Ghi kết quả vào Google Sheet sau khi test xong. **Phải truyền flag này mới ghi** |
| `--sheet-tab=<name>` | Không | auto-detect | Tab cụ thể để ghi kết quả |
| `--doc=<url>` | Không | — | Append kết quả vào Google Doc sau khi test xong. **Phải truyền flag này mới ghi** |

> **Ghi ngược chỉ khi có flag:** Input là Google Sheet/Doc **không tự động ghi ngược** — phải truyền `--sheet=<url>` hoặc `--doc=<url>` tường minh. Xem chi tiết tại [Ghi kết quả ngược về Sheet](#ghi-kết-quả-test-ngược-về-google-sheet).

---

## Thêm project mới

Mỗi customer/dự án là 1 folder trong `automation/projects/`.

**Tự động (khuyến nghị):** Gõ lệnh với `--project=<tên-mới>`, AI tự tạo folder.

**Thủ công:**

```bash
cd ~/ai-automation-test/automation
mkdir -p projects/<tên>/{tests,specs,test-results}

cat > projects/<tên>/.env << 'EOF'
TEST_BASE_URL=https://app.example.com
TEST_USER=
TEST_PASS=

# Không còn dùng RESULTS_SHEET_URL / RESULTS_DOC_URL trong .env
# Để ghi kết quả vào Sheet/Doc, truyền flag --sheet=<url> hoặc --doc=<url> khi chạy lệnh
EOF
```

> `.env` tự động gitignore — **KHÔNG commit credentials**.

**Ghi kết quả về Sheet/Doc — chỉ khi có flag:**

```
--sheet=<url>  → ghi vào Sheet URL đó
--doc=<url>    → ghi vào Doc URL đó
(không có flag) → không ghi, bỏ qua hoàn toàn
```

---

## Setup Google Sheets / Docs

### Google Sheets / Docs — Service Account (dùng chung)

Cần setup 1 lần cho cả Google Sheet input, Google Doc input, và ghi kết quả về Sheet:

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project
2. Enable các API cần dùng:
   - **Google Sheets API** — đọc/ghi Sheet
   - **Google Docs API** — đọc Doc (cho v1.4a)
   - **Google Drive API** — truy cập file chung
3. Tạo **Service Account** → download JSON key
4. Lưu file tại:
   ```
   ~/ai-automation-test/service-auth.json
   ```
5. Share sheet/doc với email service account (quyền **Editor** nếu ghi kết quả, **Viewer** nếu chỉ đọc)

> `service-auth.json` đã gitignore tự động — không bao giờ commit file này.

---

### Google Docs input

> ⚠️ Script viết xong, **chưa test** — verify trước khi dùng production.

Dùng Google Doc làm spec input:

```
/ai-test https://docs.google.com/document/d/<ID>/edit --project=customer-a
```

Script tự chuyển đổi cấu trúc Google Doc (heading, bảng, list) → markdown để AI đọc.

**Chạy thủ công** (để xem output trước khi dùng với `/ai-test`):

```bash
cd ~/ai-automation-test/automation

# In ra stdout
node scripts/load-google-doc.mjs "https://docs.google.com/document/d/<ID>/edit"

# Lưu ra file
node scripts/load-google-doc.mjs "https://docs.google.com/document/d/<ID>/edit" --out=specs/input.md
```

**Flags:**

| Flag | Mặc định | Mô tả |
|---|---|---|
| `--out=<path>` | stdout | Lưu output ra file thay vì in ra terminal |
| `--auth=<path>` | `~/ai-automation-test/service-auth.json` | Đường dẫn tới service account JSON |

---

### Confluence input

> ⚠️ Script viết xong, **chưa test** — verify trước khi dùng production.

**Bước 1: Lấy API token**

Vào [id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens) → Create API token.

**Bước 2: Set env vars** (thêm vào `~/.bashrc` hoặc `~/.zshrc` để dùng lâu dài):

```bash
export CONFLUENCE_EMAIL="you@company.com"
export CONFLUENCE_TOKEN="<api-token>"
```

**Bước 3: Dùng Confluence URL làm input:**

```
/ai-test https://<domain>.atlassian.net/wiki/spaces/<SPACE>/pages/<id> --project=customer-a
```

**Định dạng URL được hỗ trợ:**

| Loại | Ví dụ |
|---|---|
| Atlassian Cloud | `https://<domain>.atlassian.net/wiki/spaces/<SPACE>/pages/<id>/<title>` |
| Atlassian Cloud (rút gọn) | `https://<domain>.atlassian.net/wiki/spaces/<SPACE>/pages/<id>` |
| Confluence Server/DC | `https://confluence.example.com/display/<SPACE>/<title>?pageId=<id>` |

**Chạy thủ công** (để xem output trước):

```bash
cd ~/ai-automation-test/automation

# Dùng env vars
node scripts/load-confluence.mjs "https://<domain>.atlassian.net/wiki/spaces/<SPACE>/pages/<id>"

# Dùng flags trực tiếp
node scripts/load-confluence.mjs "https://..." \
  --email="you@company.com" \
  --token="<api-token>" \
  --out=specs/input.md
```

**Flags:**

| Flag | Mặc định | Mô tả |
|---|---|---|
| `--email=<email>` | `$CONFLUENCE_EMAIL` | Email Atlassian account |
| `--token=<token>` | `$CONFLUENCE_TOKEN` | API token từ id.atlassian.com |
| `--out=<path>` | stdout | Lưu output ra file |

---

### Ghi kết quả test ngược về Google Sheet

> ⚠️ Script viết xong, **chưa test** — verify trước khi dùng production.

**Mục đích:** Sau khi chạy test, AI tự động điền kết quả vào đúng dòng test case trong sheet — những cột mà trước giờ dev phải điền tay (Chrome, Safari, Tester, Test date, Status...).

#### Cách hoạt động

Script tự phân tích header của sheet, nhận diện từng cột theo tên, rồi ghi đúng giá trị vào đó:

| Tên cột (ví dụ) | Script nhận ra vì... | Ghi gì vào |
|---|---|---|
| `Chrome`, `Chromium` | chứa keyword browser | `✅ PASS` hoặc `❌ FAIL` (kết quả chạy trên Chromium) |
| `Safari`, `WebKit` | chứa keyword browser | kết quả chạy trên WebKit (nếu có) |
| `Firefox` | chứa keyword browser | kết quả chạy trên Firefox (nếu có) |
| `Status`, `Result`, `Kết quả` | keyword status | `✅ PASS` / `❌ FAIL` tổng hợp |
| `Tester`, `Tested by`, `QA` | keyword tester | `Claude AI` (hoặc giá trị `--tester`) |
| `Test date`, `Date`, `Ngày` | keyword date | ngày giờ chạy (`2026-06-05 09:15`) |
| `Notes`, `Error`, `Ghi chú` | keyword note | error message nếu fail |

Script **không cần biết trước sheet có bao nhiêu cột hay cột nào** — tự detect tất cả từ header row 1. Khi detect không chắc, bạn có thể chỉ định thủ công.

#### Khi nào ghi ngược?

| Tình huống | Hành vi |
|---|---|
| Có `--sheet=<url>` | Ghi vào Sheet URL đó sau khi test xong |
| Có `--doc=<url>` | Ghi vào Doc URL đó sau khi test xong |
| Input là Google Sheet nhưng **không có** `--sheet` | **Không ghi** — chỉ dùng để đọc test case |
| Không có flag nào | Bỏ qua, không báo lỗi |

#### Thêm vào lệnh `/ai-test`

```
# Đọc test case từ Sheet nhưng KHÔNG ghi ngược
/ai-test https://docs.google.com/spreadsheets/d/<ID>/edit --project=customer-a

# Đọc từ Sheet VÀ ghi ngược vào chính sheet đó
/ai-test https://docs.google.com/spreadsheets/d/<ID>/edit --project=customer-a \
  --sheet="https://docs.google.com/spreadsheets/d/<ID>/edit" --sheet-tab="Test Cases"

# Đọc từ file, ghi kết quả vào Sheet riêng
/ai-test ./docs/login.md --project=customer-a --sheet="https://docs.google.com/spreadsheets/d/<ID>/edit"
```

Hoặc chạy thủ công sau khi có run-id:

```bash
cd ~/ai-automation-test/automation

# Đơn giản nhất — để script tự detect tất cả cột
node scripts/write-results-to-sheet.mjs \
  --sheet="https://docs.google.com/spreadsheets/d/<ID>/edit" \
  --sheet-tab="Test Cases" \
  --project=customer-a \
  --run-id=05_06_2026_09_15_30_412

# Chỉ định thủ công khi auto-detect sai
node scripts/write-results-to-sheet.mjs \
  --sheet="https://docs.google.com/spreadsheets/d/<ID>/edit" \
  --sheet-tab="Test Cases" \
  --project=customer-a \
  --run-id=05_06_2026_09_15_30_412 \
  --match-col="Test Case" \
  --result-col="Status" \
  --date-col="Test date" \
  --tester-col="Tester" \
  --tester="Claude AI" \
  --note-col="Notes"
```

| Flag | Bắt buộc | Mô tả |
|---|---|---|
| `--sheet=<url>` | ✅ | URL Google Sheet |
| `--project=<name>` | ✅ | Tên project |
| `--run-id=<id>` | ✅ | Run ID |
| `--sheet-tab=<name>` | Không | Tên tab cụ thể — auto-detect nếu bỏ qua |
| `--match-col=<col>` | Không | Cột chứa tên test case để match — auto-detect |
| `--result-col=<col>` | Không | Cột Status/Result tổng hợp — auto-detect |
| `--date-col=<col>` | Không | Cột ghi ngày chạy — auto-detect |
| `--tester-col=<col>` | Không | Cột Tester — auto-detect |
| `--tester=<name>` | Không | Giá trị điền vào cột Tester (mặc định: `Claude AI`) |
| `--note-col=<col>` | Không | Cột ghi error message khi fail — auto-detect |
| `--result-col=<col>` | Không | Cột kết quả — **BẮT BUỘC chỉ định khi sheet tiếng Nhật hoặc có nhiều cột kết quả** |
| `--start-row=<n>` | Không | Dòng data đầu tiên (mặc định: `2`) |
| `--auth=<path>` | Không | Đường dẫn service-auth.json |

> `<col>` có thể là tên header (`"Test date"`), letter (`F`), hoặc số thứ tự (`6`).

> ⚠️ **Sheet tiếng Nhật hoặc có nhiều cột kết quả (`結果1`, `結果2`...):** Auto-detect có thể nhầm cột `期待結果` (Expected Results) thay vì cột kết quả test (`結果2`). Phải chỉ định tường minh: `--result-col="結果2"`. Không để auto-detect quyết định.

#### Theo dõi lịch sử run (tracking mode)

Nếu bạn muốn **sheet riêng ghi lịch sử** thay vì update sheet gốc:

```bash
node scripts/write-results-to-sheet.mjs \
  --mode=tracking \
  --sheet="https://docs.google.com/spreadsheets/d/<TRACKING_SHEET_ID>/edit" \
  --project=customer-a \
  --run-id=05_06_2026_09_15_30_412
```

Mỗi run append 1 dòng: `Date | Project | Run ID | Total | Pass | Fail | Skip | Healed | Status | Duration | Report | Video | Notes`. Sheet trống tự tạo header.

---

### Ghi kết quả test ngược về Google Docs

> ⚠️ Script viết xong, **chưa test** — verify trước khi dùng production.

**Mục đích:** Append kết quả mỗi run vào cuối 1 Google Doc có sẵn — ví dụ Doc theo dõi sprint, Doc báo cáo tuần, hoặc bất kỳ Doc nào bạn muốn tổng hợp kết quả.

Mỗi run thêm 1 section mới vào cuối Doc:

```
──────────────────────────────────────────
Test Run: 2026-06-05 09:15:30
Project: customer-a  |  Run ID: 05_06_2026_09_15_30_412
Status: ✅ PASS  |  Total: 8  |  Pass: 8  |  Fail: 0  |  Skip: 0  |  Healed: 2  |  Duration: 143s
Report : \\wsl.localhost\Ubuntu\home\user\...\AI_REPORT.md
Video  : \\wsl.localhost\Ubuntu\home\user\...\artifacts\full-session.mp4
Notes  : Regression run sau deploy
```

**Chạy thủ công** (sau khi đã có run-id):

```bash
cd ~/ai-automation-test/automation
node scripts/write-results-to-doc.mjs \
  --doc="https://docs.google.com/document/d/<ID>/edit" \
  --project=customer-a \
  --run-id=05_06_2026_09_15_30_412 \
  --healed=2 \
  --notes="Regression run sau deploy"
```

| Flag | Bắt buộc | Mô tả |
|---|---|---|
| `--doc=<url>` | ✅ | URL Google Doc nhận kết quả |
| `--project=<name>` | ✅ | Tên project (folder trong `projects/`) |
| `--run-id=<id>` | ✅ | Run ID (format `dd_mm_yyyy_HH_MM_SS_ms`) |
| `--healed=<n>` | Không | Số lần auto-heal đã thực hiện |
| `--notes="..."` | Không | Ghi chú thêm vào section |
| `--auth=<path>` | Không | Đường dẫn service-auth.json (mặc định: `~/ai-automation-test/service-auth.json`) |

> **Yêu cầu:** Share Doc với email service account quyền **Editor**. Google Docs API phải được enable trong Google Cloud Console.

---

## Cấu trúc thư mục

```
~/ai-automation-test/
│
├── setup.sh                          ← Chạy 1 lần khi onboard máy mới
├── service-auth.json                 ← Google credentials (gitignore, tạo thủ công)
│
├── .claude/
│   ├── settings.json                ← Đăng ký hook validate (UserPromptSubmit)
│   └── hooks/
│       └── ai-test-guard.sh         ← Chặn /ai-test khi thiếu --project/input
│
├── commands/
│   ├── ai-test.md                   ← Slash command /ai-test (setup.sh copy → ~/.claude/commands/)
│   └── ai-test-i.md                 ← Slash command /ai-test-i (tương tác qua picker)
│
├── skills/
│   ├── ai-test/
│   │   ├── SKILL.md                 ← File chính (422 dòng) — AI luôn đọc toàn bộ
│   │   ├── rules/
│   │   │   └── RULES.md             ← 16 nguyên tắc bất biến (Bước 0 — AI luôn đọc)
│   │   └── steps/
│   │       ├── STEP-3b-seed.md      ← Quy tắc seed data chi tiết
│   │       ├── STEP-7d-sheet.md     ← Ghi kết quả vào Sheet/Doc
│   │       └── STEP-report.md       ← Template AI_REPORT.md đầy đủ
│   └── ai-test-i/
│       └── SKILL.md                 ← Front-end picker: thu thập flag rồi gọi lại ai-test
│
└── automation/                      ← Playwright Hub (KHÔNG edit thường xuyên)
    ├── Dockerfile                   ← Image = playwright + ffmpeg + VNC tools
    ├── docker-compose.yml           ← Build + run config
    ├── playwright.config.ts         ← Video, trace, workers, run-id routing
    ├── package.json                 ← @playwright/test v1.60
    │
    ├── dashboard.html               ← Dashboard real-time (mở qua http://localhost:8765)
    │
    ├── scripts/
    │   ├── run-test.sh              ← Wrapper chạy test (normal / fast / live)
    │   ├── live-entrypoint.sh       ← Khởi VNC bên trong container (dùng khi --live)
    │   ├── show-report.sh           ← Mở HTML report (tự chọn run mới nhất theo mtime)
    │   ├── convert-videos.sh        ← Bước 6b: webm→mp4 song song + full-session đúng thứ tự
    │   ├── lint-test.sh             ← Gate chặn fake assertion / test.skip (Rule #15)
    │   ├── start-dashboard.sh       ← Khởi HTTP server cho dashboard
    │   ├── update-status.sh         ← Ghi trạng thái bước hiện tại cho dashboard
    │   ├── load-google-sheet.mjs    ← Đọc Google Sheet
    │   ├── load-google-doc.mjs      ← Đọc Google Doc 
    │   ├── load-confluence.mjs      ← Đọc Confluence page (🔧 chưa test)
    │   ├── write-results-to-sheet.mjs ← Ghi kết quả về Google Sheet 
    │   └── write-results-to-doc.mjs   ← Ghi kết quả vào Google Doc 
    │
    ├── .claude/agents/              ← 3 Test Agents
    │   ├── playwright-test-planner.md
    │   ├── playwright-test-generator.md
    │   └── playwright-test-healer.md
    │
    ├── seeds/                      ← Seed scripts dùng chung (AI move vào đây sau test)
    │   └── <tên-project>/
    │       └── seed*.spec.ts
    │
    └── projects/                   ← DỮ LIỆU TEST (edit ở đây)
        └── <tên-project>/
            ├── .env                ← Credentials + RESULTS_SHEET_URL (gitignore)
            ├── specs/
            │   ├── <slug>.md       ← Plan markdown (AI sinh, slug = tên định danh duy nhất)
            │   └── .source-meta/
            │       └── <slug>.json ← Hash nội dung spec — dùng để detect thay đổi
            ├── tests/
            │   └── <slug>.spec.ts  ← Test code (AI sinh)
            └── test-results/
                └── runs/
                    └── <dd_mm_yyyy_HH_MM_SS_ms>/
                        ├── AI_REPORT.md
                        ├── results.json
                        ├── playwright-report/    ← HTML report (normal mode)
                        └── artifacts/
                            ├── full-session.mp4  ← Video toàn session
                            └── <test-name>/
                                ├── video.mp4
                                └── trace.zip
```

---

## Troubleshooting

### `/ai-test`: Unknown command

→ Reload Window chưa được:  
`Ctrl+Shift+P` → **Developer: Reload Window**

Nếu vẫn lỗi → chạy lại `./setup.sh`.

### Docker: `command not found`

→ Trên Windows: Docker Desktop chưa enable WSL integration:
1. Docker Desktop → Settings → Resources → WSL Integration
2. Bật distro Ubuntu → Apply & Restart
3. Test: `docker --version`

→ Trên macOS: Docker Desktop chưa được cài hoặc Docker CLI chưa nằm trong `PATH`.

### Docker: `Cannot connect to Docker daemon`

→ Docker Desktop chưa chạy. Mở Docker Desktop, chờ trạng thái ổn định rồi thử lại.

### Docker image chưa có

→ Chưa chạy build:
```bash
cd ~/ai-automation-test/automation
docker compose build playwright
```

### Test fail sau max-heal

→ Mở `AI_REPORT.md` mục "Root cause". Thường do:
- **App có bug thật** → báo dev
- **Selector quá generic** → thêm `data-testid` vào component
- **Credentials sai** → kiểm tra `projects/<tên>/.env`

### Live mode: không thấy gì ở `localhost:6080`

→ Mở browser **trong vòng 12 giây đếm ngược** khi terminal hiện `⏳ Bắt đầu test sau...`  
→ Trong trang VNC: nhấn nút **Connect** (góc trên phải) trước khi test bắt đầu.  
→ Nếu vào đúng lúc nhưng màn đen: VNC đang khởi, chờ 1–2s rồi nhấn Connect lại.  
→ Đảm bảo port 6080 không bị firewall Windows chặn.

### Google Sheet: authentication error

→ Kiểm tra `service-auth.json` tồn tại và sheet đã share với email service account.

### Google Sheet: AI ghi nhầm vào cột Expected Results thay vì cột kết quả

→ Xảy ra khi sheet dùng tiếng Nhật hoặc có nhiều cột kết quả (`結果1`, `結果2`...). Script auto-detect nhầm cột `期待結果` (Expected Results) là cột kết quả test. Chỉ định tường minh khi ghi:

```bash
node scripts/write-results-to-sheet.mjs \
  --sheet="<url>" --project=<name> --run-id=<id> \
  --result-col="結果2"
```

Hoặc khi dùng flag `--sheet` trong lệnh `/ai-test`, thêm `--result-col` nếu sheet có pattern tương tự.

---
