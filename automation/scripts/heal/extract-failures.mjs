#!/usr/bin/env node
// Trích lỗi từ results.json (Bước 6.1) — thay python heredoc inline, gọn hơn để AI đọc.
// Usage: node scripts/heal/extract-failures.mjs <project> <run-id>
// Output: mỗi dòng "title :: status :: error" cho test KHÔNG passed/skipped.

import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOMATION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(suites, out) {
  for (const s of suites || []) {
    for (const spec of s.specs || []) {
      for (const t of spec.tests || []) {
        for (const r of t.results || []) {
          if (r.status !== 'passed' && r.status !== 'skipped') {
            const err = (r.errors || []).map((e) => (e.message || '').slice(0, 300)).join(' | ');
            out.push(`${spec.title} :: ${r.status} :: ${err}`);
          }
        }
      }
    }
    walk(s.suites, out);
  }
  return out;
}

const [project, runId] = process.argv.slice(2);
if (!project || !runId) {
  console.error('Usage: extract-failures.mjs <project> <run-id>');
  process.exit(1);
}
const p = join(AUTOMATION_DIR, 'projects', project, 'test-results', 'runs', runId, 'results.json');
const data = JSON.parse(await readFile(p, 'utf8'));
const lines = walk(data.suites, []);
console.log(lines.join('\n'));
