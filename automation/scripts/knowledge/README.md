# scripts/knowledge — Knowledge Graph builder (Phase 2)

Sinh Knowledge Graph JSON per-project từ source app bằng Tree-sitter (WASM, grammar-agnostic).
Xem thiết kế schema: [../../../skills/ai-test/steps/STEP-knowledge-graph.md](../../../skills/ai-test/steps/STEP-knowledge-graph.md).

## Chạy

```bash
# trong container hoặc local có node_modules đã cài
npm run kg:build -- <project> --src <đường-dẫn-source-app>
# ví dụ:
npm run kg:build -- aucnet-flowers-web --src /app-src
```

Output: `projects/<project>/knowledge/{meta,api,ui,deps}.json`.

## Thêm ngôn ngữ mới

1. Thêm 1 dòng vào `EXT_TO_GRAMMAR` trong [lang.mjs](lang.mjs) (đuôi file → tên grammar).
2. Đảm bảo `tree-sitter-wasms/out/tree-sitter-<grammar>.wasm` tồn tại (package đã bundle nhiều ngôn ngữ).
3. (Khi làm M2.3–2.5) thêm luật trích xuất cho ngôn ngữ đó trong các hàm `extractApi/Ui/Deps`.

## Trạng thái

- [x] M2.2 — khung: duyệt file, nạp grammar động, ghi JSON, hash source.
- [x] M2.3 — extractor Route + API (tested trên source thật):
  - JS/Express (`extractors/javascript.mjs`)
  - Laravel/PHP (`extractors/php.mjs`)
  - Rails/Ruby (`extractors/ruby.mjs`)
  - FastAPI/Flask/Python (`extractors/python.mjs`)
  - Java/Spring: **bỏ qua tạm** (chưa có app).
- [x] M2.4 — extractor UI + Component: **Vue** (`extractors/vue.mjs`, tested: 116 comp / 223 renders trên aucnet). React (jsx/tsx) còn TODO.
- [x] M2.5 — extractor Dependency: **Laravel Eloquent** (`php.mjs` belongsTo) + **Rails** (`ruby.mjs` belongs_to), tested trên model thật.
- [x] M2.7 — phát hiện source đổi: `kg:build ... --check` so `source_hash` → FRESH (exit 0) / STALE (exit 1).
  Skill KHÔNG tự rebuild: STALE → cảnh báo dev, vẫn dùng graph cũ. Dev chủ động rebuild bằng flag `--kg-rebuild` (hoặc chạy lại `kg:build`).

**Giới hạn đã biết (M2.3):** path là literal khai báo tại chỗ. Prefix từ `Route::group(['prefix'=>...])`
(Laravel), `resources`/namespace (Rails), hay router mount prefix (FastAPI `include_router(prefix=...)`)
**chưa được resolve/ghép**. Đủ dùng để định vị endpoint qua `file:line`; muốn full path tuyệt đối cần bước ghép prefix (bổ sung sau nếu cần).

Thêm framework/ngôn ngữ: tạo `extractors/<grammar>.mjs` export `api/ui/deps`. Xem các file mẫu trong `extractors/`.
