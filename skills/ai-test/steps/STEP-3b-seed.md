# Bước 3b — Chi tiết: Kiểm tra data thiếu → tự động xử lý

> 📊 **Dashboard:** `bash $APP_ROOT/automation/scripts/update-status.sh 3 s3b "<name>" "Checking and seeding test data..." 0 normal`

Trước khi sinh plan/code, rà từng scenario để xác định data có đủ không:
- Account/role/permission cần dùng
- Entity cần tồn tại sẵn: product, order, customer, user, search keyword, date range
- Master data/dropdown option cần có
- Trạng thái nghiệp vụ cần setup trước: draft/approved/cancelled/paid
- Layout cần data để render danh sách, bảng, card, empty state, pagination

## Khi phát hiện thiếu data — KHÔNG hỏi, tự xử lý ngay

| Loại thiếu | Cách xử lý tự động |
|---|---|
| Thiếu record DB (product, order, user...) | Kiểm tra data đã có chưa → seed nếu chưa có |
| Cần state cụ thể (approved, paid...) | Viết helper setup state qua API hoặc DB trong test |
| Cần account/credential | Dùng account từ `.env` (sau khi xin phép per Rule #16), hoặc fake account phù hợp spec |
| Cần giá trị dropdown/master data | Hard-code giá trị hợp lệ từ source code hoặc spec |
| Cần search keyword trả kết quả | Dùng `%`, `a`, hoặc từ khóa phổ biến trong domain |
| Thiếu date range | Dùng ngày hiện tại ± 7 ngày |
| Layout cần có items | Fake ≥ 1 item tối thiểu, ghi rõ là fake trong comment test |

**Ngoại lệ duy nhất** (Rule #15): TC bị block bởi plugin bên thứ ba (hCaptcha, payment SDK...) → không fake-pass, hỏi user qua AskUserQuestion.

## Quy tắc seed data BẮT BUỘC

### Seed #0 — Seed theo spec, không theo app config

Số records và điều kiện phải lấy từ spec/sheet. Ví dụ: TC ghi "lần thứ 6 → 403" → seed đúng **5 records**. TUYỆT ĐỐI KHÔNG chạy lệnh đọc config app để lấy threshold:
```bash
# ❌ CẤM — che giấu bug nếu app config sai so với spec:
docker exec <fpm> php artisan tinker --execute "echo config('behavior.hourly_limit');"
grep -n "hourly_limit" /path/to/config/behavior.php
```

### Seed #1 — Kiểm tra trước khi seed

KHÔNG seed blindly. Luôn query DB trước:
```bash
docker exec <fpm_container> php artisan tinker --execute="
  echo DB::table('potential_users')
    ->where('mailaddress', 'LIKE', 'e2e-ai-tc%')
    ->count();
"
```
- Count > 0 → bỏ qua seed, dùng data hiện có
- Count = 0 → chạy seed

### Seed AI_KEY — Marker bắt buộc

Mọi record do AI tạo phải có marker để phân biệt với data thật. Cách implement:

```typescript
// Pattern: dùng field email/mailaddress với prefix e2e-ai-tc<ID>
const seedEmail = `e2e-ai-tc15-${Date.now()}@test.local`;

// Hoặc dùng field memo/note:
// note: 'E2E_AI_TC-15'

await dbQuery(`INSERT INTO potential_users (mailaddress, ip_address, created_at)
  VALUES ('${seedEmail}', '${seedIp}', NOW())`);
```

**Cleanup chỉ xóa records có marker:**
```typescript
// ✅ ĐÚNG — chỉ xóa seed data của AI:
await dbQuery(`DELETE FROM potential_users WHERE mailaddress LIKE 'e2e-ai-tc%'`);

// ❌ SAI — xóa toàn bộ kể cả production data:
await dbQuery(`DELETE FROM potential_users WHERE ip_address='${seedIp}'`);
```

### Seed #2 — Kiểm tra schema trước khi INSERT

Trước khi viết seed INSERT, xác nhận column thực tế trong bảng:
```bash
docker exec <fpm_container> php artisan tinker --execute="
  \$cols = DB::getSchemaBuilder()->getColumnListing('potential_users');
  echo implode(', ', \$cols);
"
```
Chỉ INSERT vào column thực sự tồn tại. Column không tồn tại → INSERT fail silently → seed không hoạt động → flaky pass.

### Seed #3 — Lưu trữ seed file

Sau khi test hoàn thành, move seed file về thư mục dùng chung:
```bash
mkdir -p $APP_ROOT/automation/seeds/<project-name>
mv projects/<name>/tests/seed*.spec.ts \
   $APP_ROOT/automation/seeds/<project-name>/
```
Xóa khỏi `projects/<name>/tests/` sau khi move.

## Sau khi xử lý data

Ghi 1 dòng log ngắn trong report:
```
⚠️ Data tự sinh: <mô tả ngắn> (fake — không dùng trên production)
```
Nếu dùng data có sẵn: không cần log thêm.

Auto mode và interactive mode: đều đi thẳng Bước 4, không dừng confirm.
