#!/usr/bin/env node
// Merge kết quả heal rerun về run gốc (Bước 6.5) — thay python heredoc inline trong SKILL.
// Làm cả 3 việc: (a) copy artifacts, (b) merge results.json, (c) xóa heal dir.
// Output: in ra danh sách T id THẬT SỰ được heal (so status trước/sau — không phải suy đoán/AI tự nhớ),
// dùng trực tiếp cho `gen-report.mjs --healed-tc=`.
//
// Usage: node scripts/heal/merge-heal.mjs <project> <RUN_ID> <HEAL_RUN_ID>

import { readFile, writeFile } from 'node:fs/promises';
import { cpSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOMATION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST_ID_RE = /^T(?:C)?-[A-Z0-9-]*\d+[a-z]?/i;

function specStatusMap(suites, out = {}) {
  for (const s of suites || []) {
    for (const spec of s.specs || []) {
      const hadFailure = (spec.tests || []).some((t) => (t.results || []).some((r) => r.status !== 'passed' && r.status !== 'skipped'));
      out[spec.title] = hadFailure ? 'failed' : 'passed';
    }
    specStatusMap(s.suites, out);
  }
  return out;
}

function setSpecPassed(suites, title) {
  for (const s of suites || []) {
    for (const spec of s.specs || []) {
      if (spec.title === title) {
        for (const t of spec.tests || []) {
          t.status = 'expected';
          for (const r of t.results || []) r.status = 'passed';
        }
      }
    }
    setSpecPassed(s.suites, title);
  }
}

function findSpec(suites, title) {
  for (const s of suites || []) {
    for (const spec of s.specs || []) {
      if (spec.title === title) return spec;
    }
    const nested = findSpec(s.suites, title);
    if (nested) return nested;
  }
  return null;
}

function rewriteRunIdPaths(value, fromRunId, toRunId) {
  if (Array.isArray(value)) return value.map((item) => rewriteRunIdPaths(item, fromRunId, toRunId));
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      value[key] = rewriteRunIdPaths(child, fromRunId, toRunId);
    }
    return value;
  }
  if (typeof value === 'string') return value.split(fromRunId).join(toRunId);
  return value;
}

async function main() {
  const [project, runId, healRunId] = process.argv.slice(2);
  if (!project || !runId || !healRunId) {
    console.error('Usage: merge-heal.mjs <project> <RUN_ID> <HEAL_RUN_ID>');
    process.exit(1);
  }
  const runDir = join(AUTOMATION_DIR, 'projects', project, 'test-results', 'runs', runId);
  const healDir = join(AUTOMATION_DIR, 'projects', project, 'test-results', 'runs', healRunId);
  if (!existsSync(runDir) || !existsSync(healDir)) {
    console.error(`Thiếu run dir: ${runDir} hoặc ${healDir}`);
    process.exit(1);
  }

  const orig = JSON.parse(await readFile(join(runDir, 'results.json'), 'utf8'));
  const heal = JSON.parse(await readFile(join(healDir, 'results.json'), 'utf8'));

  const origStatusBefore = specStatusMap(orig.suites);
  const healStatus = specStatusMap(heal.suites);

  // a. copy artifacts (đè — bản mới nhất thắng, kể cả T heal lại vẫn fail)
  const healArtifacts = join(healDir, 'artifacts');
  const origArtifacts = join(runDir, 'artifacts');
  if (existsSync(healArtifacts)) cpSync(healArtifacts, origArtifacts, { recursive: true });

  // b. merge results.json — chỉ set 'passed' cho spec mà heal rerun pass
  const healedTc = [];
  for (const [title, status] of Object.entries(healStatus)) {
    if (status === 'passed') {
      const origSpec = findSpec(orig.suites, title);
      const healSpec = findSpec(heal.suites, title);
      if (origSpec && healSpec) {
        origSpec.tests = rewriteRunIdPaths(JSON.parse(JSON.stringify(healSpec.tests || [])), healRunId, runId);
      }
      setSpecPassed(orig.suites, title);
      if (origStatusBefore[title] === 'failed') {
        const m = title.match(TEST_ID_RE);
        if (m) healedTc.push(m[0].replace(/^T(?:C)-/i, 'T-'));
      }
    }
  }
  await writeFile(join(runDir, 'results.json'), JSON.stringify(orig, null, 2));

  // c. xóa heal dir
  rmSync(healDir, { recursive: true, force: true });

  // d. cộng dồn vào .run-state.json (trạng thái tối thiểu của run — Bước 7 đọc thẳng, AI không
  // cần tự nhớ/truyền --healed-tc qua nhiều vòng heal)
  const statePath = join(runDir, '.run-state.json');
  let state = { run_id: runId, project, healed_tc: [] };
  if (existsSync(statePath)) {
    try { state = JSON.parse(readFileSync(statePath, 'utf8')); } catch {}
  }
  const merged = new Set([...(state.healed_tc || []), ...healedTc]);
  state.healed_tc = [...merged];
  state.updated_at = new Date().toISOString();
  await writeFile(statePath, JSON.stringify(state, null, 2));

  console.error(`[merge-heal] Đã merge ${healRunId} → ${runId}, xóa heal dir. .run-state.json: healed_tc=${state.healed_tc.join(',')}`);
  console.log(healedTc.join(','));
}

main().catch((e) => { console.error(e); process.exit(1); });
