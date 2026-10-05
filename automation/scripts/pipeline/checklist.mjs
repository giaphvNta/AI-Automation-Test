#!/usr/bin/env node
// Checklist gọn cho pipeline 4 pha. Mục tiêu: sau mỗi pha có thể /clear hoặc mở phiên mới,
// rồi chỉ đọc lại file này + .run-state.json thay vì giữ transcript dài trong context.
//
// Usage:
//   node scripts/pipeline/checklist.mjs init <project> [--slug=<slug>] [--run-id=<id>]
//   node scripts/pipeline/checklist.mjs mark <project> <phase> <pending|running|done|blocked|skipped> [--run-id=<id>] [--note=<text>]
//   node scripts/pipeline/checklist.mjs show <project> [--run-id=<id>]
//   node scripts/pipeline/checklist.mjs reset <project> [--last-run-id=<id>] [--note=<text>]

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOMATION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PHASES = ['prep', 'author', 'run_heal', 'finalize'];
const STATUS = new Set(['pending', 'running', 'done', 'blocked', 'skipped']);

function parseFlags(argv) {
  const out = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function paths(project, runId = '') {
  const projectDir = join(AUTOMATION_DIR, 'projects', project);
  const projectJson = join(projectDir, '.run-checklist.json');
  const projectMd = join(projectDir, '.run-checklist.md');
  const runDir = runId ? join(projectDir, 'test-results', 'runs', runId) : '';
  return {
    projectDir,
    projectJson,
    projectMd,
    runJson: runDir ? join(runDir, '.run-checklist.json') : '',
    runMd: runDir ? join(runDir, '.run-checklist.md') : '',
  };
}

async function readChecklist(project, runId = '') {
  const p = paths(project, runId);
  const primary = runId && existsSync(p.runJson) ? p.runJson : p.projectJson;
  if (!existsSync(primary)) return null;
  try {
    return JSON.parse(await readFile(primary, 'utf8'));
  } catch {
    return null;
  }
}

function defaultChecklist(project, flags = {}) {
  const now = new Date().toISOString();
  return {
    project,
    run_id: flags['run-id'] || '',
    slug: flags.slug || '',
    updated_at: now,
    cache_policy: 'After each done/skipped phase, clear or start a fresh context; resume from .run-checklist.md + .run-state.json only.',
    phases: {
      prep: { status: 'pending', note: 'Parse/load/hash/env/difficulty/state by script.' },
      author: { status: 'pending', note: 'Only if should_author=true. Use agent/sub-context for UI exploration.' },
      run_heal: { status: 'pending', note: 'Run script; healer only on fail in separate context.' },
      finalize: { status: 'pending', note: 'Convert/report/source-meta/writeback by script.' },
    },
  };
}

function idleChecklist(project, flags = {}) {
  const c = defaultChecklist(project, flags);
  c.status = 'idle';
  c.run_id = '';
  c.slug = '';
  c.last_run_id = flags['last-run-id'] || '';
  c.cache_policy = 'Idle. Start the next run from PREP; do not resume old project-level state.';
  c.phases = {
    prep: { status: 'pending', note: 'Waiting for next run.' },
    author: { status: 'pending', note: 'Waiting for next run.' },
    run_heal: { status: 'pending', note: 'Waiting for next run.' },
    finalize: { status: 'pending', note: flags.note || 'Previous run finalized; project state reset.' },
  };
  return c;
}

function renderMd(checklist) {
  const icon = { pending: '[ ]', running: '[~]', done: '[x]', skipped: '[-]', blocked: '[!]' };
  const lines = [
    `# AI Test Checklist — ${checklist.project}`,
    '',
    `- run_id: ${checklist.run_id || '(pending)'}`,
    checklist.last_run_id ? `- last_run_id: ${checklist.last_run_id}` : null,
    `- slug: ${checklist.slug || '(pending)'}`,
    `- updated_at: ${checklist.updated_at}`,
    `- cache_policy: ${checklist.cache_policy}`,
    '',
    '| Phase | Status | Note |',
    '|---|---|---|',
  ].filter(Boolean);
  for (const phase of PHASES) {
    const item = checklist.phases[phase] || { status: 'pending', note: '' };
    lines.push(`| ${phase} | ${icon[item.status] || '[?]'} ${item.status} | ${String(item.note || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('', 'Resume rule: read this file, then `projects/<project>/.run-state.json`; do not reload old transcript/spec/report unless the current phase needs it.');
  return `${lines.join('\n')}\n`;
}

async function writeChecklist(checklist, runId = '') {
  checklist.updated_at = new Date().toISOString();
  const p = paths(checklist.project, runId || checklist.run_id);
  await mkdir(p.projectDir, { recursive: true });
  const json = JSON.stringify(checklist, null, 2);
  const md = renderMd(checklist);
  await writeFile(p.projectJson, json);
  await writeFile(p.projectMd, md);
  if (checklist.run_id && p.runJson) {
    await mkdir(dirname(p.runJson), { recursive: true });
    await writeFile(p.runJson, json);
    await writeFile(p.runMd, md);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const [cmd, project] = argv;
  if (!cmd || !project) {
    console.error('Usage: checklist.mjs <init|mark|show> <project> ...');
    process.exit(2);
  }

  if (cmd === 'init') {
    const flags = parseFlags(argv.slice(2));
    const checklist = defaultChecklist(project, flags);
    await writeChecklist(checklist, flags['run-id'] || '');
    console.log(renderMd(checklist));
    return;
  }

  if (cmd === 'mark') {
    const phase = argv[2];
    const status = argv[3];
    const flags = parseFlags(argv.slice(4));
    if (!PHASES.includes(phase)) throw new Error(`Unknown phase: ${phase}`);
    if (!STATUS.has(status)) throw new Error(`Unknown status: ${status}`);
    const runId = flags['run-id'] || '';
    const checklist = await readChecklist(project, runId) || defaultChecklist(project, flags);
    checklist.run_id = runId || checklist.run_id || '';
    if (flags.slug) checklist.slug = flags.slug;
    checklist.phases[phase] = {
      status,
      note: flags.note || checklist.phases[phase]?.note || '',
      at: new Date().toISOString(),
    };
    await writeChecklist(checklist, runId);
    console.log(renderMd(checklist));
    return;
  }

  if (cmd === 'show') {
    const flags = parseFlags(argv.slice(2));
    const checklist = await readChecklist(project, flags['run-id'] || '');
    if (!checklist) {
      console.error(`Missing checklist for project: ${project}`);
      process.exit(1);
    }
    console.log(renderMd(checklist));
    return;
  }

  if (cmd === 'reset') {
    const flags = parseFlags(argv.slice(2));
    const checklist = idleChecklist(project, flags);
    await writeChecklist(checklist, '');
    console.log(renderMd(checklist));
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(`[checklist] ${e.message}`);
  process.exit(1);
});
