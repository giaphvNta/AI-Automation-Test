#!/usr/bin/env node
// M2.2 — CLI scaffolding sinh Knowledge Graph JSON cho 1 project.
// Usage: node scripts/knowledge/build-knowledge.mjs <project> [--src <path>]
//   <project>  : tên project trong automation/projects/
//   --src      : thư mục source app cần parse (mặc định lấy từ projects/<name>/docker-compose.override.yml
//                mount /app-src nếu có, hoặc phải truyền tay)
//
// Output: projects/<name>/knowledge/{meta,api,ui,deps}.json  (xem STEP-knowledge-graph.md)
//
// ⚠️ RANH GIỚI: graph CHỈ chứa cấu trúc/cách tương tác. KHÔNG chứa expected value.
//
// Trạng thái M2.2: khung parser + duyệt file + nạp grammar đã có.
// Các extractor (Route/API M2.3, UI M2.4, Dependency M2.5) là hàm rỗng, điền sau.

import { readdir, stat, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Parser from 'web-tree-sitter';
import { grammarForFile, makeLanguageLoader } from './lang.mjs';
import { runExtractor } from './extractors/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTOMATION_DIR = resolve(__dirname, '..', '..');

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '.next', 'target',
  '__pycache__', 'bower_components', 'public', 'storage', 'coverage']);

function parseArgs(argv) {
  const args = { project: null, src: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') args.src = argv[++i];
    else if (a === '--check') args.check = true;
    else if (!a.startsWith('--') && !args.project) args.project = a;
  }
  return args;
}

// tính hash source (giống lúc build) để phát hiện source đổi mà không cần parse
async function computeSourceHash(files, srcRoot) {
  const h = createHash('sha256');
  for (const file of files) {
    const rel = relative(srcRoot, file);
    let text;
    try { text = await readFile(file, 'utf8'); } catch { continue; }
    h.update(rel + '\0' + text);
  }
  return 'sha256:' + h.digest('hex');
}

// duyệt đệ quy, trả về danh sách file có grammar hỗ trợ
async function walkSource(root) {
  const out = [];
  async function rec(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        await rec(join(dir, e.name));
      } else if (e.isFile() && grammarForFile(e.name)) {
        out.push(join(dir, e.name));
      }
    }
  }
  await rec(root);
  return out;
}

// Extractor được dispatch theo grammar tại ./extractors/. Node/edge BẮT BUỘC có
// `source` = "relPath:line" để verify ngược. Xem STEP-knowledge-graph.md.

function makeCtx(part, rel, text) {
  return {
    rel,
    text,
    push: (node) => part.nodes.push(node),
    pushEdge: (edge) => part.edges.push(edge),
  };
}

async function main() {
  const { project, src, check } = parseArgs(process.argv.slice(2));
  if (!project) {
    console.error('Thiếu tên project. Usage: kg:build <project> [--src <path>] [--check]');
    process.exit(1);
  }
  const projectDir = join(AUTOMATION_DIR, 'projects', project);
  if (!existsSync(projectDir)) {
    console.error(`Không thấy project: ${projectDir}`);
    process.exit(1);
  }
  const srcRoot = src ? resolve(src) : null;
  if (!srcRoot || !existsSync(srcRoot)) {
    console.error('Cần --src <path> trỏ tới source app cần parse (thư mục tồn tại).');
    process.exit(1);
  }

  // --check: chỉ so hash source với meta.json cũ → FRESH (exit 0) / STALE (exit 1). Không parse.
  if (check) {
    const files = await walkSource(srcRoot);
    const current = await computeSourceHash(files, srcRoot);
    const metaPath = join(projectDir, 'knowledge', 'meta.json');
    if (!existsSync(metaPath)) {
      console.log('[kg:check] STALE — chưa có knowledge/meta.json, cần build.');
      process.exit(1);
    }
    const old = JSON.parse(await readFile(metaPath, 'utf8')).source_hash;
    if (old === current) {
      console.log('[kg:check] FRESH — source không đổi, dùng graph hiện có.');
      process.exit(0);
    }
    console.log('[kg:check] STALE — source đã đổi, cần rebuild (npm run kg:build).');
    process.exit(1);
  }

  await Parser.init();
  const parser = new Parser();
  const loadLanguage = makeLanguageLoader(Parser);

  const files = await walkSource(srcRoot);
  const graph = {
    api: { nodes: [], edges: [] },
    ui: { nodes: [], edges: [] },
    deps: { nodes: [], edges: [] },
  };
  const langs = new Set();
  const hash = createHash('sha256');

  for (const file of files) {
    const grammar = grammarForFile(file);
    const rel = relative(srcRoot, file);
    let text;
    try { text = await readFile(file, 'utf8'); } catch { continue; }
    hash.update(rel + '\0' + text);
    let Lang;
    try { Lang = await loadLanguage(grammar); }
    catch (e) { console.warn(`[skip] ${rel}: ${e.message}`); continue; }
    parser.setLanguage(Lang);
    const tree = parser.parse(text);
    langs.add(grammar);
    const root = tree.rootNode;
    await runExtractor('api', grammar, root, Lang, makeCtx(graph.api, rel, text));
    await runExtractor('ui', grammar, root, Lang, makeCtx(graph.ui, rel, text));
    await runExtractor('deps', grammar, root, Lang, makeCtx(graph.deps, rel, text));
  }

  const outDir = join(projectDir, 'knowledge');
  await mkdir(outDir, { recursive: true });
  const meta = {
    generated_at: new Date().toISOString(),
    source_hash: 'sha256:' + hash.digest('hex'),
    langs: [...langs],
    node_count: graph.api.nodes.length + graph.ui.nodes.length + graph.deps.nodes.length,
    edge_count: graph.api.edges.length + graph.ui.edges.length + graph.deps.edges.length,
  };
  await writeFile(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  await writeFile(join(outDir, 'api.json'), JSON.stringify(graph.api, null, 2));
  await writeFile(join(outDir, 'ui.json'), JSON.stringify(graph.ui, null, 2));
  await writeFile(join(outDir, 'deps.json'), JSON.stringify(graph.deps, null, 2));

  console.log(`[kg] project=${project} files=${files.length} langs=${[...langs].join(',') || '-'}`);
  console.log(`[kg] nodes=${meta.node_count} edges=${meta.edge_count} → ${relative(AUTOMATION_DIR, outDir)}`);
  if (meta.node_count === 0) {
    console.log('[kg] Chưa có extractor nào điền node (M2.3–2.5 còn TODO) — output rỗng là đúng ở giai đoạn này.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
