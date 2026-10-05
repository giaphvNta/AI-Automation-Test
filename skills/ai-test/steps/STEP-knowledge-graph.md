# Bước KNOWLEDGE-GRAPH — Schema graph language-neutral (Phase 2, opt-in qua `--kg`)

> Mục tiêu: agent **query graph JSON thay vì grep source / browse DOM** khi plan+generate
> → giảm token pha authoring. Đây là bản nâng cấp có cấu trúc của SCREENS.md (xem [STEP-screens.md](STEP-screens.md)).

> ⚠️ **RANH GIỚI BẤT BIẾN (giống SCREENS.md):** Graph CHỈ chứa **cách TƯƠNG TÁC / cấu trúc code**
> (route, selector, endpoint, quan hệ). **TUYỆT ĐỐI KHÔNG chứa expected value**
> (text kỳ vọng, status code kỳ vọng, count...). Expected value LUÔN lấy từ spec/sheet. Vi phạm = che giấu bug.

## Vì sao language-neutral

Stack đa ngôn ngữ, không cố định. Vì vậy graph mô tả node theo **khái niệm** (Screen, Route,
Component, Endpoint, Entity), KHÔNG theo cú pháp ngôn ngữ. Mỗi ngôn ngữ chỉ cần 1 bộ Tree-sitter
query (`.scm`) map AST → node khái niệm. **Thêm ngôn ngữ = thêm 1 file query, không đụng core.**

## Kích hoạt

Chỉ chạy khi có flag `--kg`. Không có flag → bỏ qua, giữ hành vi cũ. `--kg` và `--screens` bổ trợ
nhau: graph cung cấp route/endpoint/dependency từ source; SCREENS.md cung cấp selector/flow đã crawl.

Output: `projects/<name>/knowledge/*.json` (1 bộ/project). **KHÔNG commit** (đã gitignore) —
mỗi dev tự build 1 lần trên máy mình vì cần source app local. Chạy offline, không cần DB.

## Các loại node (language-neutral)

Mỗi node có `id` (ổn định, kebab-case), `type`, `name`, `source` (`file:line` để verify ngược), `lang`.

| type | Ý nghĩa | Trường riêng |
|------|---------|--------------|
| `Screen` | Màn hình / trang người dùng thấy | `route` (path URL nếu có) |
| `Route` | Định tuyến (frontend router hoặc backend URL mapping) | `method` (GET/POST... nếu là API), `path` |
| `Component` | Đơn vị UI tái sử dụng | — |
| `Endpoint` | API endpoint backend | `method`, `path`, `handler` |
| `Entity` | Thực thể dữ liệu / model / table | `fields[]` (chỉ tên field, KHÔNG rule validate expected) |
| `Symbol` | Hàm/class/module (dùng cho call graph khi cần) | `kind` (function/class/...) |

## Các loại edge

`{ "from": "<nodeId>", "to": "<nodeId>", "type": "<edgeType>", "source": "file:line" }`

| edgeType | Nghĩa | Ví dụ |
|----------|-------|-------|
| `renders` | Screen/Component render Component con | CustomerPage → CustomerTable |
| `navigates` | Screen → Screen qua route/link/button | Dashboard → Customer |
| `calls` | UI/handler gọi Endpoint | CustomerForm → POST /customer |
| `handles` | Route → Endpoint handler | POST /customer → CustomerController.create |
| `reads`/`writes` | Endpoint/handler đọc/ghi Entity | CustomerService → Customer |
| `requires` | Entity phụ thuộc Entity khác (FK / tạo trước) | Customer requires Country |

## Bố cục file output (per-project)

```text
projects/<name>/knowledge/
  meta.json     # { generated_at, source_hash, langs[], node_count, edge_count }
  api.json      # nodes: Route + Endpoint;   edges: handles, calls, reads, writes   (M2.3)
  ui.json       # nodes: Screen + Component;  edges: renders, navigates, calls       (M2.4)
  deps.json     # nodes: Entity;              edges: requires                        (M2.5)
```

> Tách theo file để agent nạp đúng phần cần (giảm context). Node `id` dùng chung giữa các file
> để edge nối chéo được (vd `calls` từ ui.json trỏ tới Endpoint trong api.json).

## Ví dụ (minh hoạ, không phải data thật)

```json
// api.json
{
  "nodes": [
    { "id": "ep-post-customer", "type": "Endpoint", "name": "createCustomer",
      "method": "POST", "path": "/customer", "lang": "java", "source": "CustomerController.java:42" }
  ],
  "edges": [
    { "from": "ep-post-customer", "to": "entity-customer", "type": "writes", "source": "CustomerService.java:31" }
  ]
}
```

## Cách agent dùng (pha authoring)

1. Trước khi plan/generate 1 feature → nạp node liên quan qua tên feature
   (vd "Customer" → Screen/Route/Endpoint/Entity + edge).
2. Từ graph, planner biết ngay: màn nào, API nào gọi, entity nào phải tạo trước (edge `requires`).
   → **không grep cả project, không browse DOM để dò route/endpoint.**
3. Chỉ dùng MCP browse khi graph thiếu selector runtime của màn (cold-start), rồi cache vào SCREENS.md.

## Verify & an toàn

- Mọi node/edge **bắt buộc có `source` = file:line** để verify ngược (chống suy đoán).
- Graph KHÔNG chứa expected value → dù stale cũng chỉ làm test đỏ vì selector/route (heal được),
  KHÔNG bao giờ làm test xanh giả.
- `source_hash` trong meta.json để phát hiện source đổi → rebuild (M2.7).
