#!/usr/bin/env node
// Sinh SKELETON projects/<name>/SCREENS.md từ Knowledge Graph (deterministic, 0 token LLM).
// Chỉ seed phần chính xác-từ-source (data recipe API từ endpoint POST/PUT/DELETE).
// Selector/màn hình để trống → dev điền khi crawl (--screens). KG đã lo route/endpoint.
//
// Usage: node scripts/knowledge/gen-screens.mjs <project>
//   (cần đã chạy kg:build cho project trước)
//
// ⚠️ SCREENS.md CHỈ chứa cách tương tác. KHÔNG expected value. Xem STEP-screens.md.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOMATION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function readJson(p) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

function dataRecipeSection(api) {
  if (!api?.nodes?.length) return '### (chưa có endpoint từ KG)\n- Điền khi crawl.\n';
  const writes = api.nodes.filter((n) => WRITE_METHODS.has(n.method));
  if (!writes.length) return '### (KG chưa thấy endpoint tạo data — chỉ có GET)\n';
  const lines = ['> Seed từ Knowledge Graph (endpoint tạo/sửa data). Kiểm tra body/param thực tế khi dùng.', ''];
  for (const n of writes.slice(0, 40)) {
    lines.push(`### ${n.method} ${n.path}`);
    lines.push(`- Ưu tiên 1 — API: \`${n.method} ${n.path}\`   (nguồn: ${n.source})`);
    lines.push('- Cleanup: <điền>, marker AI_KEY: <điền>');
    lines.push('');
  }
  if (writes.length > 40) lines.push(`> … và ${writes.length - 40} endpoint nữa (xem knowledge/api.json).`);
  return lines.join('\n');
}

async function main() {
  const project = process.argv[2];
  if (!project) { console.error('Usage: gen-screens.mjs <project>'); process.exit(1); }
  const projectDir = join(AUTOMATION_DIR, 'projects', project);
  const kgDir = join(projectDir, 'knowledge');
  if (!existsSync(kgDir)) {
    console.error(`Chưa có knowledge/ cho ${project}. Chạy: npm run kg:build -- ${project} --src <app-src>`);
    process.exit(1);
  }
  const api = await readJson(join(kgDir, 'api.json'));
  const meta = await readJson(join(kgDir, 'meta.json'));
  const screensPath = join(projectDir, 'SCREENS.md');
  if (existsSync(screensPath)) {
    console.error(`⚠️ ${project}/SCREENS.md ĐÃ tồn tại — không ghi đè (tránh mất selector đã crawl). Xoá thủ công nếu muốn tạo lại.`);
    process.exit(1);
  }

  const content = `# SCREENS — ${project}
# ⚠️ CHỈ chứa cách tương tác. KHÔNG chứa expected value (lấy từ spec).
# Skeleton auto-seed từ Knowledge Graph (${meta?.langs?.join(', ') || '?'}) — selector/màn hình điền khi crawl (--screens).

## Meta
- base_url_hint: http://localhost:8081   # placeholder, môi trường thật lấy từ .env
- last_crawled: (chưa crawl — mới seed từ KG)
- content_hash: (chưa có — điền khi crawl)

## Auth
- login_url: <điền khi crawl>
- cách login: <điền>
- storageState: .auth/admin.json

## Màn hình
# (để trống — điền selector/flow khi crawl bằng --screens. Route/endpoint tra ở knowledge/api.json.)

## Data recipes (cách tạo/xóa data — theo thứ tự ưu tiên môi trường)
${dataRecipeSection(api)}
## Không chạy trên stg/prod (test phá hoại / phụ thuộc third-party thật)
- <điền khi rà TC phá hoại>
`;

  await mkdir(projectDir, { recursive: true });
  await writeFile(screensPath, content);
  const writes = (api?.nodes || []).filter((n) => WRITE_METHODS.has(n.method)).length;
  console.log(`[gen-screens] ${project}/SCREENS.md — seed ${writes} data-recipe API từ KG. Selector/màn hình: điền khi crawl.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
