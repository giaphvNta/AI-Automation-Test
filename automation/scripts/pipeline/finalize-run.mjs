#!/usr/bin/env node
// Pha 4 FINALIZE: convert video + report skeleton + move seed + source meta + optional Sheet/Doc write.
// Phần phân tích lỗi/app bug vẫn để AI append sau skeleton nếu cần.
//
// Usage:
//   node scripts/pipeline/finalize-run.mjs <project> <run-id> [--slug=<slug>] [--mode=normal|live|fast] [--from=<ISO>] [--skip-convert] [--no-sheet-doc]

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReport } from '../report/gen-report.mjs';

const AUTOMATION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const args = {
    project: '',
    runId: '',
    slug: '',
    mode: 'normal',
    from: '',
    skipConvert: false,
    noSheetDoc: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--slug=')) args.slug = arg.slice(7);
    else if (arg.startsWith('--mode=')) args.mode = arg.slice(7);
    else if (arg.startsWith('--from=')) args.from = arg.slice(7);
    else if (arg === '--skip-convert') args.skipConvert = true;
    else if (arg === '--no-sheet-doc') args.noSheetDoc = true;
    else if (!arg.startsWith('--') && !args.project) args.project = arg;
    else if (!arg.startsWith('--') && !args.runId) args.runId = arg;
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.project || !args.runId) throw new Error('Usage: finalize-run.mjs <project> <run-id> [--slug=<slug>]');
  return args;
}

async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function run(script, args, options = {}) {
  return execFileSync(script, args, {
    cwd: AUTOMATION_DIR,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
}

function runOptional(script, args) {
  try {
    return run(script, args);
  } catch {
    return '';
  }
}

function hashOf(content) {
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}

function stripIdleFields(state) {
  const {
    active_run_token,
    last_run_id,
    last_report_file,
    reset_at,
    note,
    ...rest
  } = state || {};
  return rest;
}

async function moveSeedFiles(projectDir) {
  const testsDir = join(projectDir, 'tests');
  if (!existsSync(testsDir)) return [];
  async function walk(dir, out = []) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p, out);
      else if (e.isFile() && /^seed.*\.spec\.ts$/i.test(e.name)) out.push(p);
    }
    return out;
  }
  const seedFiles = await walk(testsDir);
  if (seedFiles.length === 0) return [];

  const seedDir = join(AUTOMATION_DIR, 'seeds', basename(projectDir));
  await mkdir(seedDir, { recursive: true });
  const moved = [];
  for (const file of seedFiles) {
    const dest = join(seedDir, basename(file));
    await rename(file, dest);
    moved.push(dest.slice(AUTOMATION_DIR.length + 1).replace(/\\/g, '/'));
  }
  return moved;
}

async function saveSourceMeta(state, projectDir, runId) {
  if (!state || state.flags?.rerun || !state.slug || !state.spec_file) return null;
  const specPath = join(AUTOMATION_DIR, state.spec_file);
  const contentHash = state.current_hash || (existsSync(specPath) ? hashOf(await readFile(specPath, 'utf8')) : '');
  if (!contentHash) return null;

  const metaDir = join(projectDir, 'specs', '.source-meta');
  await mkdir(metaDir, { recursive: true });
  const meta = {
    input: state.input || '',
    content_hash: contentHash,
    last_tested: new Date().toISOString(),
    run_id: runId,
    spec_file: state.spec_file,
    test_file: state.test_file || `projects/${state.project}/tests/${state.slug}.spec.ts`,
    sheet_tab: state.flags?.sheet_tab || '',
    input_slug: state.slug,
  };
  const metaPath = join(metaDir, `${state.slug}.json`);
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  return metaPath.slice(AUTOMATION_DIR.length + 1).replace(/\\/g, '/');
}

async function writeReport(args, state, movedSeeds) {
  const runDir = join(AUTOMATION_DIR, 'projects', args.project, 'test-results', 'runs', args.runId);
  const reportPath = join(runDir, 'AI_REPORT.md');
  const mode = args.mode === 'live' ? 'Live (VNC)' : 'Headless';
  const date = new Date().toISOString().slice(0, 10);
  const skeleton = await generateReport({
    project: args.project,
    runId: args.runId,
    mode: args.mode === 'live' ? 'live' : 'normal',
    from: args.from || null,
    sessionFreshness: state?.session_freshness || null,
  });
  const specLabel = state?.input || state?.spec_file || '';
  const header = [
    `# AI Test Report — ${args.project}`,
    '',
    `**Run ID:** ${args.runId}`,
    `**Date:** ${date}`,
    `**Mode:** ${mode}`,
    `**Spec:** ${specLabel}`,
    '',
    '---',
    '',
  ].join('\n');
  const seedNote = movedSeeds.length
    ? `\n---\n\n📦 Seed files đã move về:\n${movedSeeds.map((p) => `- \`${p}\``).join('\n')}\n`
    : '';
  await writeFile(reportPath, header + skeleton + seedNote);
  return reportPath.slice(AUTOMATION_DIR.length + 1).replace(/\\/g, '/');
}

function optionalWriteResults(state, args) {
  if (args.noSheetDoc || !state?.flags) return [];
  const done = [];
  const healed = (state.healed_tc || []).length;
  if (state.flags.result_sheet) {
    const sheetArgs = [
      'scripts/write-results-to-sheet.mjs',
      `--sheet=${state.flags.result_sheet}`,
      `--project=${args.project}`,
      `--run-id=${args.runId}`,
      `--healed=${healed}`,
    ];
    if (state.flags.sheet_tab) sheetArgs.push(`--sheet-tab=${state.flags.sheet_tab}`);
    run('node', sheetArgs, { stdio: 'pipe' });
    done.push('sheet');
  }
  if (state.flags.result_doc) {
    run('node', [
      'scripts/write-results-to-doc.mjs',
      `--doc=${state.flags.result_doc}`,
      `--project=${args.project}`,
      `--run-id=${args.runId}`,
      `--healed=${healed}`,
    ], { stdio: 'pipe' });
    done.push('doc');
  }
  return done;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectDir = join(AUTOMATION_DIR, 'projects', args.project);
  const runDir = join(projectDir, 'test-results', 'runs', args.runId);
  if (!existsSync(runDir)) throw new Error(`Missing run dir: ${runDir}`);
  if (!existsSync(join(runDir, 'results.json'))) throw new Error(`Missing results.json in run dir: ${runDir}`);

  const projectStatePath = join(projectDir, '.run-state.json');
  const runStatePath = join(runDir, '.run-state.json');
  const rawProjectState = await readJson(projectStatePath, {});
  const runState = await readJson(runStatePath, {});
  const projectState = rawProjectState.phase === 'idle' ? {} : rawProjectState;
  const state = {
    ...projectState,
    ...runState,
    flags: { ...(projectState.flags || {}), ...(runState.flags || {}) },
    env_check: runState.env_check || projectState.env_check,
    session_freshness: runState.session_freshness || projectState.session_freshness,
    difficulty_summary: runState.difficulty_summary || projectState.difficulty_summary,
  };
  if (args.slug) state.slug = args.slug;

  if (args.mode !== 'fast' && !args.skipConvert) {
    run('./scripts/convert-videos.sh', [args.project, args.runId], { stdio: 'inherit' });
  }

  const movedSeeds = await moveSeedFiles(projectDir);
  const metaPath = await saveSourceMeta(state, projectDir, args.runId);
  const reportPath = args.mode === 'fast' ? '' : await writeReport(args, state, movedSeeds);
  const integrations = optionalWriteResults(state, args);

  const finalState = {
    ...stripIdleFields(state),
    phase: 'finalize',
    project: args.project,
    run_id: args.runId,
    report_file: reportPath,
    source_meta_file: metaPath || state.source_meta_file || '',
    moved_seed_files: movedSeeds,
    integrations,
    updated_at: new Date().toISOString(),
  };
  await writeFile(runStatePath, JSON.stringify(finalState, null, 2));
  if (state.slug && state.should_author === false) {
    runOptional('node', [
      'scripts/pipeline/checklist.mjs',
      'mark',
      args.project,
      'author',
      'skipped',
      `--run-id=${args.runId}`,
      `--slug=${state.slug}`,
      '--note=should_author=false',
    ]);
  }
  if (state.slug) {
    runOptional('node', [
      'scripts/pipeline/checklist.mjs',
      'mark',
      args.project,
      'finalize',
      'done',
      `--run-id=${args.runId}`,
      `--slug=${state.slug}`,
      `--note=report=${reportPath || '(fast mode)'}`,
    ]);
  }

  const idleState = {
    phase: 'idle',
    project: args.project,
    active_run_token: '',
    run_id: '',
    last_run_id: args.runId,
    last_report_file: reportPath,
    reset_at: new Date().toISOString(),
    note: 'Previous run finalized. Start next run from PREP; do not resume this project-level state.',
  };
  await writeFile(projectStatePath, JSON.stringify(idleState, null, 2));
  runOptional('node', [
    'scripts/pipeline/checklist.mjs',
    'reset',
    args.project,
    `--last-run-id=${args.runId}`,
    `--note=Previous run finalized: ${reportPath || '(fast mode)'}`,
  ]);
  console.log(JSON.stringify(finalState, null, 2));
}

main().catch((e) => {
  console.error(`[finalize-run] ${e.message}`);
  process.exit(1);
});
