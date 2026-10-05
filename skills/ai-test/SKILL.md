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
> Sau khi đọc RULES.md, xuất ngay: `✅ RULES đã đọc | Nắm: #0 #1 #2 ... #17`
> Không xuất dòng này = chưa đọc rules = vi phạm INC-04.

## Paths — TỰ SUY RA, KHÔNG hardcode

> ⚠️ Tool có thể được clone ở path bất kỳ, trên máy bất kỳ (Linux/WSL/macOS).
> **Nếu đang đọc skill từ `~/.codex/skills/...` thì KHÔNG suy APP_ROOT từ path đó.**
> Trước tiên chạy `cat ~/.ai-automation-test-root`; nếu file tồn tại và path có thư mục `automation/`
> thì **APP_ROOT = nội dung file marker này**.
> Chỉ khi không có marker, **APP_ROOT = đường dẫn bạn vừa Read file SKILL.md này, bỏ đuôi `/skills/ai-test/SKILL.md`.**
> Ví dụ đọc `/Users/an/ai-automation-test/skills/ai-test/SKILL.md` → `APP_ROOT=/Users/an/ai-automation-test`.
> Đặt biến 1 lần trước Pha 1 rồi dùng xuyên suốt:

```
APP_ROOT     = <cat ~/.ai-automation-test-root nếu có; fallback suy từ path đọc SKILL.md>
HUB          = $APP_ROOT/automation
PROJECTS     = $APP_ROOT/automation/projects
SERVICE_AUTH = $APP_ROOT/service-auth.json   (Google Sheets - optional)
```

Nếu `$APP_ROOT/automation` không tồn tại, DỪNG và kiểm tra marker/setup; KHÔNG tự dò sang repo
automation khác hoặc project app hiện tại vì sẽ chạy nhầm hub.

Mọi lệnh bash chạy sau `cd "$APP_ROOT/automation"` → dùng path **tương đối** (`scripts/...`, `projects/...`).
Script (.sh/.mjs) đều tự định vị nên gọi bằng path tương đối luôn đúng.

## Dashboard status (BẮT BUỘC gọi đầu mỗi bước)

```bash
# Chạy sau khi đã cd "$APP_ROOT/automation"
bash scripts/update-status.sh <step> <key> "<project>" "<msg>" [heal] [mode] [status] [--run-id=<id>] [--note=<text>]
```
Dashboard: `http://localhost:8765`

`update-status.sh` cũng tự update `.run-checklist.md/.json` theo pha tương ứng (best-effort). Vì vậy khi kết thúc AUTHOR/RUN+HEAL, ưu tiên gọi `update-status.sh ... done --note=...` thay vì gọi riêng `checklist.mjs mark`. Riêng `finalize done` do `finalize-run.mjs` mark run-level rồi reset project-level về `idle`, nên lệnh status cuối chỉ dùng để đóng dashboard.

---

## Bước 0: Đọc RULES.md — BẮT BUỘC

RULES.md nằm CÙNG thư mục skills với file này — `$APP_ROOT/skills/ai-test/rules/RULES.md`:
```
Read <APP_ROOT>/skills/ai-test/rules/RULES.md
```

Sau khi đọc, xuất ngay dòng self-check trước khi tiếp tục:
```
✅ RULES đã đọc | Nắm: #0 #1 #2 #3 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 #15 #16 #17
```

---

## Pipeline 4 Pha

> Mục tiêu: main context mỏng. Script xử lý việc deterministic; AI/agent chỉ làm AUTHOR, HEAL, và phân tích lỗi cần suy luận.
> Sau mỗi pha `done` hoặc `skipped`, trạng thái nằm trong `projects/<name>/.run-checklist.md` + `.run-state.json`; không giữ reasoning/log dài trong context. Nếu phiên đã dài, dùng `/clear` hoặc mở phiên mới rồi resume bằng 2 file này.
> Với DEV/người dùng, vẫn chỉ có **một entrypoint**: Claude Code dùng `/ai-test ...` hoặc `/ai-test-i`; Codex ưu tiên `/ai-test ...` khi đã có đủ input/project/flags (nếu thiếu thì hỏi chat trước). Các lệnh `prep-run/finalize-run/checklist` là nội bộ pipeline, KHÔNG yêu cầu dev chạy tay.

### Pha 1: PREP

Gom các bước cũ 1 + 1b + 2 + 3 + phân loại độ khó.

```bash
cd "$APP_ROOT/automation"
bash scripts/update-status.sh 1 prep "<name>" "Preparing run..." 0 normal
node scripts/pipeline/prep-run.mjs "<input>" --project="<name>" --target="<base_url>" [flags...]
```

`prep-run.mjs` tự:
- parse flag, nhận diện input, sinh slug, load spec vào `projects/<name>/specs/<slug>.md`;
- check hash source-meta, quyết định `should_author`;
- chạy `check-env.mjs`;
- chạy `classify-difficulty.mjs` và ghi `<slug>.difficulty.json`;
- ghi state gọn vào `projects/<name>/.run-state.json`;
- ghi checklist gọn vào `projects/<name>/.run-checklist.md`.

Nếu output có `env_check.ok=false` thì dừng và hướng dẫn chạy `./setup.sh` hoặc bật Docker. Nếu `source_meta_status="same"` và `should_author=false`, bỏ qua AUTHOR và chạy lại test file cũ.

Flags hợp lệ: `--project`, `--target`, `--max-heal`, `--interactive`, `--rerun`, `--only`, `--fast`, `--live`, `--sheet`, `--sheet-tab`, `--doc`, `--screens`, `--kg`, `--kg-rebuild`, `--note`.

### Codex compatibility

Chỉ áp dụng khi AI tool hiện tại là **Codex**. **Claude Code bỏ qua mục này** và chạy như trước.

- Nếu state/arguments có `--live`, lệnh RUN phải được thực thi ngoài network sandbox
  (`sandbox_permissions=require_escalated` trong `exec_command`, sau khi user approve). Lý do: noVNC publish
  `http://localhost:6080/vnc.html` bằng Docker `-p`, nhưng Codex sandbox có thể dùng `--unshare-net`, làm
  `localhost` của browser host không thấy port được publish trong sandbox. Không đổi port để xử lý lỗi này;
  port đúng của repo gốc là `6080`. Nếu user không approve chạy ngoài sandbox, vẫn có thể chạy live để lấy
  video artifact nhưng phải báo trước rằng realtime viewer có thể không mở được từ browser host.
- Nếu cần mở server xem bằng browser host (`scripts/show-report.sh`, `scripts/start-dashboard.sh`) trong
  Codex, cũng chạy ngoài network sandbox vì các lệnh này publish `localhost` port (`9323`, `8765`).
- Nếu input/output dùng URL bên ngoài cần host network từ script Node (`Google Sheet`, `Google Doc`,
  Confluence/Atlassian), Codex có thể cần `sandbox_permissions=require_escalated` khi command bị lỗi DNS/network.
  Nếu command fail vì network sandbox, xin approval và chạy lại cùng command ngoài sandbox.

### Pha 2: AUTHOR

Gom các bước cũ 3b + 4 + 5. Chỉ chạy khi `.run-state.json.should_author=true`.

```bash
bash scripts/update-status.sh 2 author "<name>" "Authoring tests..." 0 normal
```

Nguồn đọc bắt buộc:
- `projects/<name>/.run-state.json`
- `spec_file` trong state
- `difficulty_file` trong state
- `SCREENS.md` hoặc Knowledge Graph chỉ khi flag tương ứng bật

Quy tắc routing:
- Sheet/spec đã có T chi tiết → spec chính là plan, không gọi agent.
- `simple` trong difficulty → tự viết hoặc dùng SCREENS; tránh agent nếu selector rõ.
- `medium` → dùng SCREENS/KG trước, agent chỉ khám phá phần UI thiếu.
- `hard` → cần khám phá DOM thật, dùng Agent `playwright-test-generator` (xem "Cách gọi agent tuỳ
  biến" dưới); hỏi Advisor khi stuck/trước khi kết luận app bug.
- `blocked` captcha/third-party → mock/test key hoặc đánh BLOCKED theo Rule #15; không đốt heal loop.

**Cách gọi agent tuỳ biến (generator/planner/healer/report-writer):**
Nếu tool hỗ trợ custom sub-agent kiểu Claude Code, gọi THẲNG tên agent làm `subagent_type`
(vd `subagent_type: "playwright-test-generator"`). Claude Code tự áp `model`/`tools`/persona từ
frontmatter `.claude/agents/*.md`.

Nếu chạy trên Codex hoặc môi trường không có custom sub-agent registry, dùng cùng persona file nhưng
thực thi inline hoặc bằng agent tổng quát nếu tool có hỗ trợ. Bắt buộc đọc file persona trước khi làm,
ví dụ:
> "Đọc `automation/.claude/agents/playwright-test-generator.md` — đây LÀ vai trò và luật của bạn
> cho task này. Sau khi đọc, thực hiện: <task cụ thể>. Tuân thủ đúng format output đã định nghĩa
> trong file đó."

**Quy tắc delegate (bắt buộc):**
- Trước khi gọi bất kỳ Agent nào, orchestrator phải báo cho user MỘT dòng: "Delegate <task> cho <tên agent> vì <lý do>". Không gọi Agent im lặng.
- Không tự escalate lên model/agent nặng hơn mức difficulty gợi ý. Nếu difficulty là simple/medium mà muốn dùng agent khám phá DOM (playwright-test-generator) hoặc model/effort cao hơn, phải xin phép user trước, nêu rõ mục đích + vì sao cần resource nặng hơn. Chưa được phép thì giữ ở mức nhẹ hoặc hỏi user.

Seed data: đọc `skills/ai-test/steps/STEP-3b-seed.md` chỉ khi T cần data thiếu. Dùng AI_KEY marker; không hỏi user trừ khi bị chặn bởi third-party/plugin.

Khi AUTHOR xong, update status/checklist rồi có thể xóa context dài:
```bash
bash scripts/update-status.sh 2 author "<name>" "Author done" 0 normal done --note="test_file=<path>"
```

Quy tắc test code giữ nguyên:
- T ID khớp 1-1 với spec/sheet (`T-31: ...` không đánh số lại).
- Expected/assertion lấy nguyên văn từ spec/sheet, không lấy từ app/source.
- Selector ưu tiên `getByRole` > `getByLabel` > `getByText` > CSS.
- Không `waitForTimeout`, không fake assertion, không `test.skip/fixme/fail` để che bug.
- Mỗi T phải có screenshot evidence sau assertion chính.

### Pha 3: RUN+HEAL

Gom bước cũ 6. Main chỉ chạy script và gọi healer khi fail.

```bash
cd "$APP_ROOT/automation"
bash scripts/update-status.sh 3 run "<name>" "Running tests..." 0 normal
RUN_STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATE_JSON="projects/<name>/.run-state.json"
SPEC_FILE="$(node -e 'const s=require("./"+process.argv[1]); console.log(s.test_file)' "$STATE_JSON")" \
TEST_LIVE="$(node -e 'const s=require("./"+process.argv[1]); process.stdout.write((s.mode==="live"||s.flags?.live)?"1":"")' "$STATE_JSON")" \
./scripts/run-test.sh "<name>" [--grep "<only>"]
```

Đọc `Run ID:` từ output wrapper, không tự đoán. `run-test.sh` giữ guard Rule #15 và #17.

Nếu fail và không phải `--fast`:
1. `node scripts/heal/extract-failures.mjs <name> <run-id>`
2. Gọi Agent `subagent_type: "playwright-test-healer"` (xem "Cách gọi agent tuỳ biến" ở Pha 2 —
   lỗi `Agent type not found` thì dùng fallback `general-purpose` ở đó). Prompt chỉ gồm: `spec_file`,
   `test_file`, lỗi đã extract, base URL, và note cần thiết — KHÔNG paste toàn bộ spec/DOM.
   Healer kết thúc bằng JSON `{tc_fixed, tc_app_bug, root_cause_summary, patched_files}` — luôn chạy
   trong context RIÊNG của Agent call này, không vào cache của main.
3. Rerun batch `tc_fixed` bằng HEAL_RUN_ID riêng:
   `TEST_RUN_ID="${RUN_ID}_h${heal_count}" SPEC_FILE=... ./scripts/run-test.sh <name> --grep "T-7:|T-14:"`
4. Merge:
   `node scripts/heal/merge-heal.mjs <name> "$RUN_ID" "$HEAL_RUN_ID"`

Không dùng `RUN_ID` gốc cho heal rerun. Không patch expected value để làm test xanh.

Khi RUN+HEAL xong, update status/checklist:
```bash
bash scripts/update-status.sh 3 run "<name>" "Run done" 0 normal done --run-id="$RUN_ID" --note="results.json ready"
```

### Pha 4: FINALIZE

Gom bước cũ 6b + 7 + 7c + 7d + 7e.

```bash
cd "$APP_ROOT/automation"
bash scripts/update-status.sh 4 finalize "<name>" "Finalizing report..." 0 normal
node scripts/pipeline/finalize-run.mjs "<name>" "<run-id>" --slug="<slug>" --mode=<normal|live|fast> --from="$RUN_STARTED_AT"
bash scripts/update-status.sh 4 finalize "<name>" "Done" 0 normal done
```

`finalize-run.mjs` tự:
- convert video bằng `convert-videos.sh` (trừ `--fast` hoặc `--skip-convert`);
- sinh header + report skeleton bằng `report/gen-report.mjs`;
- move seed file về `automation/seeds/<name>/`;
- save source-meta bằng hash đã tính ở PREP;
- ghi kết quả ra Sheet/Doc nếu state có `--sheet`/`--doc`;
- copy checklist vào run dir (`<run-dir>/.run-checklist.md`) và mark finalize done.
- reset project-level `.run-state.json`/`.run-checklist.md` về `idle` để lần chạy sau không resume nhầm state cũ. Run-level state/checklist vẫn giữ trong run dir để audit.

Nếu còn fail/app bug, viết section phân tích lỗi tiếng Việt cho MỖI T fail/BLOCKED rồi append vào
cuối `AI_REPORT.md` (không tự ráp lại bảng token/path/video — script đã làm). Cách viết:
- Trước khi append, đọc `<run-dir>/.run-checklist.md` và `<run-dir>/.run-state.json` để audit:
  mọi pha `prep`, `author`, `run_heal`, `finalize` phải là `done` hoặc `skipped` có lý do. Nếu thiếu,
  append ghi chú `⚠️ Audit pipeline` nêu pha thiếu/chưa done; không được báo "hoàn tất đủ bước" bằng trí nhớ.
- Với MỖI T fail/app bug, bắt buộc lấy facts từ `results.json`/failure extract + spec/test file:
  expected verbatim từ spec, actual/error thực tế, test file + dòng assertion/step liên quan.
- Nếu nghi là app bug, bắt buộc tìm vị trí app/source liên quan bằng source hiện có, Knowledge Graph (`--kg`)
  hoặc `rg` theo route/API/text/field từ lỗi. Report `App code: <file>:<line>` khi tìm được. Nếu chưa tìm
  được sau khi đã tìm, ghi `App code: chưa xác định sau khi rà <nguồn đã rà>` và hướng fix theo module/route gần nhất.
  Không được bỏ trống vị trí bug, và không được đề xuất sửa assertion để khớp app.
- Đã có sẵn dữ liệu quyết định (từ healer's `root_cause_summary`/`tc_app_bug`, hoặc rõ ràng tự thấy)
  → gọi Agent `subagent_type: "report-writer"` (xem "Cách gọi agent tuỳ biến" ở Pha 2 — tự áp
  `model: haiku` từ frontmatter, rẻ vì task chỉ là phrasing, KHÔNG cần suy luận). Prompt đưa CHỈ
  dữ liệu đã quyết định (T id/title, expected verbatim từ spec, lỗi thực tế, category:
  `app_bug|selector_fixed|blocked_third_party|unclear`, test file/line, app file/line hoặc lý do chưa xác định,
  hướng fix cụ thể) — KHÔNG đưa cả transcript/DOM.
  Writer chỉ phrasing, không tự judge lại category.
- Chưa rõ category (case lạ, chưa qua healer) → main tự phân tích trực tiếp, KHÔNG gọi writer.

---

## Xử lý env thay đổi khi test

### Phương án 1: Mock (không đổi env thật)
```bash
TEST_MOCK_<BIẾN>=true SPEC_FILE=... ./scripts/run-test.sh <name>
```

### Phương án 2: Đổi env thật trong container (BẮT BUỘC confirm)

1. In rõ: `Để test <T-list> cần đổi <VAR>=<old>→<new> trong <container>. Restore sau. Đồng ý?`
2. Chờ "Yes" — KHÔNG tự đổi
3. Đổi: `docker exec <container> sed -i 's/<old>/<new>/' <env_file>`
4. Chạy test
5. Restore BẮT BUỘC dù fail: `docker exec <container> sed -i 's/<new>/<old>/' <env_file>`
6. Ghi vào report: env đã thay đổi và đã restore

User từ chối → đánh dấu T là BLOCKED.

---

## Bảo mật

- `.env` project gitignore (`automation/projects/*/.env`)
- `service-auth.json` ở `APP_ROOT/service-auth.json` (gitignore)
- Không log credentials vào report

## Liên quan

- `skills/ai-test/rules/RULES.md` — 18 nguyên tắc bất biến (BẮT BUỘC đọc ở Bước 0)
- `skills/ai-test/steps/STEP-3b-seed.md` — quy tắc seed data chi tiết
- `skills/ai-test/steps/STEP-report.md` — template AI_REPORT.md đầy đủ
- `skills/ai-test/steps/STEP-7d-sheet.md` — ghi kết quả vào Google Sheet/Doc
- `skills/ai-test/steps/STEP-screens.md` — cơ chế SCREENS.md (knowledge map màn hình, opt-in `--screens`)
- `skills/ai-test/steps/STEP-knowledge-graph.md` — Knowledge Graph endpoint/route từ source (Tree-sitter, opt-in `--kg`)
- `skills/ai-test/rules/nta-no-screen-capture.md` — cấm screenshot/mở browser **trên host**; browser trong container (headless / `--live` qua noVNC) được phép. Đi kèm repo cho mọi dev
- Setup: `$APP_ROOT/setup.sh`
