# Bước SCREENS — Knowledge map màn hình + cách tương tác (opt-in qua `--screens`)

> Mục tiêu: viết test **nhanh hơn, chính xác hơn, ít heal hơn** bằng cách tái dùng
> knowledge về UI (URL, selector, flow, cách tạo data) thay vì để agent khám phá lại từ đầu mỗi lần.

> ⚠️ **RANH GIỚI BẤT BIẾN:** SCREENS.md CHỈ chứa **cách TƯƠNG TÁC** (URL, selector, flow thao tác,
> cách tạo/xóa data). **TUYỆT ĐỐI KHÔNG chứa expected value** (text kỳ vọng, status code, count...).
> Expected value LUÔN lấy từ spec/sheet (spec-first). Vi phạm = che giấu bug.

## Kích hoạt

Chỉ chạy cơ chế này khi có flag `--screens`. Không có flag → bỏ qua hoàn toàn, giữ hành vi cũ.

File: `projects/<name>/SCREENS.md` (1 file/project).

> ⚠️ `automation/projects/*` bị **gitignore** (trừ `demo/`) vì chứa data khách hàng → SCREENS.md
> của project khách hàng là **local per-clone**, KHÔNG commit. Lần đầu mỗi máy chạy `--screens` sẽ
> tự crawl sinh lại (chi phí 1 lần). Nếu team muốn chia sẻ, tự quyết cơ chế riêng (vd lưu nơi trackable).

## Luồng khi có `--screens`

```
1. File SCREENS.md CHƯA có
   → Crawl 1 lần: dùng Agent playwright-test-planner duyệt các màn trong scope spec,
     browser_snapshot lấy selector + flow → sinh SCREENS.md theo template dưới.
   → Chi phí = 1 lần browse (bằng chi phí planner hiện tại). Hòa vốn từ lần generate thứ 2.

2. File SCREENS.md ĐÃ có
   → Bước 4/5: đọc SCREENS.md, viết test THẲNG từ selector/flow đã có — KHÔNG browse lại.
   → Chỉ browse màn nào SCREENS.md chưa có (bổ sung ngược vào file).

3. Phát hiện UI đổi (xem mục "Khi UI thay đổi")
   → màn stale → re-crawl riêng màn đó → cập nhật SCREENS.md.
```

## Template SCREENS.md

```markdown
# SCREENS — <project>
# ⚠️ CHỈ chứa cách tương tác. KHÔNG chứa expected value (lấy từ spec).

## Meta
- base_url_hint: http://localhost:8081   # placeholder, môi trường thật lấy từ .env
- last_crawled: <ISO-8601>
- content_hash: sha256:<hash DOM các màn chính — dùng phát hiện UI đổi>

## Auth
- login_url: /mgt/login
- cách login: fill input[name="mailaddress"] + input[name="admin_password"] → submit
- storageState: .auth/admin.json   # login 1 lần, tái dùng — KHÔNG login lại mỗi TC

## Môi trường & công cụ (TÙY PROJECT — điền cái nào project này có, bỏ cái nào không)
# ⚠️ KHÔNG cố định và KHÔNG giới hạn ở mail/DB: mỗi project khác nhau (khác port, khác công cụ,
# có/không có). Liệt kê BẤT KỲ công cụ/URL/hướng dẫn phụ nào project này cần để tương tác/verify.
# CHỈ ghi cách tương tác/verify — KHÔNG ghi giá trị kỳ vọng (expected lấy từ spec), KHÔNG ghi password/token.
# AI truy cập các URL này qua container/HTTP/dbQuery, KHÔNG mở browser trên host (Rule #5).
- <Tên công cụ/service>: <URL + dùng để làm gì>   # vd (không bắt buộc): mail-catcher, DB admin, queue viewer, log viewer...
- Account test: <role → tài khoản; KHÔNG ghi password thật>
- Quirk môi trường: <vd màn X dùng iframe / captcha bật ở local / rate-limit / thứ tự chạy — nếu có>
- Hướng dẫn khác: <bất kỳ lưu ý nào đặc thù project>

## Màn hình
### <Tên màn> — <url path>
- role cần: admin | user | guest
- selectors:
  - <field/nút>: <selector semantic ưu tiên getByRole/getByLabel>
- flow đặc biệt: <vd modal mở thế nào, submit ra sao>
- ghi chú: <captcha? rate-limit? redirect?>

## Data recipes (cách tạo/xóa data — theo thứ tự ưu tiên môi trường)
### <entity, vd: blacklist>
- Ưu tiên 1 — API:   POST <endpoint> body {...}       (chạy được mọi môi trường)
- Ưu tiên 2 — UI:    <màn> → <các bước tạo>            (khi không có API)
- Ưu tiên 3 — DB:    INSERT ... (CHỈ local, khi DB reachable qua host.docker.internal)
- Cleanup: <cách xóa>, marker AI_KEY: <vd mailaddress LIKE 'e2e-ai-tc%'>

## Không chạy trên stg/prod (test phá hoại / phụ thuộc third-party thật)
- <TC-id>: <lý do — vd blacklist IP thật, spam rate-limit, captcha thật>
```

## Khi UI thay đổi — cơ chế tự bảo trì

1. **Phát hiện:** mỗi run `--screens`, hash DOM các màn chính so với `content_hash` trong Meta.
   Khác → màn đó "stale".
2. **Tự cập nhật ngược khi heal:** khi healer sửa 1 selector vì UI đổi (fail loại "selector không match"),
   BẮT BUỘC ghi selector mới ngược vào SCREENS.md + cập nhật `content_hash`. Lần sau khỏi sai lại.
3. **An toàn:** SCREENS.md không chứa expected value → UI đổi cùng lắm làm test đỏ vì selector (heal được),
   KHÔNG bao giờ làm test xanh giả.

## Dev / Staging / Prod

- `base_url` + credentials: lấy từ `projects/<name>/.env` (hoặc `.env.dev`/`.env.stg`), KHÔNG hardcode trong SCREENS.md.
- **Data recipes theo thứ tự ưu tiên:** API > UI flow > DB (DB chỉ khi local reachable). Trên stg/prod thường chỉ API/UI.
- **TC phá hoại** (spam rate-limit, blacklist IP thật, xóa data thật): liệt kê ở mục "Không chạy trên stg/prod".
  Khi chạy môi trường ngoài → đánh dấu SKIP-ENV trong report kèm lý do, KHÔNG chạy.
- **Captcha/OTP/payment thật** trên stg: theo Rule #15 → BLOCKED, hỏi user test key hoặc mock.
