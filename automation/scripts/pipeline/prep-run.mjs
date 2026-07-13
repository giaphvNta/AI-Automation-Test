#!/usr/bin/env node
// Pha 1 PREP: parse args + load spec + spec hash + env check + difficulty + state.
// Deterministic, dùng cho mọi project/dev path.
//
// Usage:
//   node scripts/pipeline/prep-run.mjs <input> --project=<name> [--target=<url>] [--sheet-tab=<tab>] [--rerun] [--fast] [--live] [--interactive] [--kg] [--kg-rebuild] [--screens] [--max-heal=3] [--note=<text>]
//
// Output: JSON state; đồng thời ghi projects/<name>/.run-state.json

import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOMATION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const args = {
    input: '',
    project: '',
    target: '',
    sheetTab: '',
    maxHeal: 3,
    interactive: false,
    rerun: false,
    fast: false,
    live: false,
    screens: false,
    kg: false,
    kgRebuild: false,
    note: '',
    only: '',
    resultSheet: '',
    resultDoc: '',
  };
  for (const arg of argv) {
    if (arg.startsWith('--project=')) args.project = arg.slice(10);
    else if (arg.startsWith('--target=')) args.target = arg.slice(9);
    else if (arg.startsWith('--sheet-tab=')) args.sheetTab = arg.slice(12);
    else if (arg.startsWith('--max-heal=')) args.maxHeal = Number(arg.slice(11)) || 3;
    else if (arg.startsWith('--note=')) args.note = arg.slice(7);
    else if (arg.startsWith('--only=')) args.only = arg.slice(7);
    else if (arg.startsWith('--sheet=')) args.resultSheet = arg.slice(8);
    else if (arg.startsWith('--doc=')) args.resultDoc = arg.slice(6);
    else if (arg === '--interactive') args.interactive = true;
    else if (arg === '--rerun') args.rerun = true;
    else if (arg === '--fast') args.fast = true;
    else if (arg === '--live') args.live = true;
    else if (arg === '--screens') args.screens = true;
    else if (arg === '--kg') args.kg = true;
    else if (arg === '--kg-rebuild') args.kgRebuild = true;
    else if (!arg.startsWith('--') && !args.input) args.input = arg;
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.project) throw new Error('Missing required --project=<name>');
  if (!args.input && !args.rerun) throw new Error('Missing input. Use --rerun only when reusing an existing test file.');
  return args;
}

function slugify(input) {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'input';
}

function sheetId(input) {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input;
}

function docId(input) {
  const m = input.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input;
}

function confluencePageId(input) {
  const m = input.match(/\/pages\/(\d+)/) || input.match(/[?&]pageId=(\d+)/);
  return m ? m[1] : slugify(input);
}

function inputKind(input) {
  if (/docs\.google\.com\/spreadsheets/.test(input)) return 'google_sheet';
  if (/docs\.google\.com\/document/.test(input)) return 'google_doc';
  if (/\.atlassian\.net\/wiki/.test(input)) return 'confluence';
  if (/^https?:\/\//.test(input)) return 'url';
  if (/[\\/]/.test(input) || /\.(md|txt|csv|xlsx|pdf)$/i.test(input)) return 'file';
  return 'description';
}

function inputSlug(args, kind) {
  if (kind === 'google_sheet') {
    const tab = args.sheetTab ? `_${slugify(args.sheetTab)}` : '';
    return `sheet_${sheetId(args.input).slice(0, 8)}${tab}`;
  }
  if (kind === 'google_doc') return `doc_${docId(args.input).slice(0, 8)}`;
  if (kind === 'confluence') return `confluence_${confluencePageId(args.input)}`;
  if (kind === 'file') return slugify(basename(args.input, extname(args.input)));
  if (kind === 'url') {
    try {
      const u = new URL(args.input);
      const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
      return slugify(`${u.hostname}-${last}`).slice(0, 40);
    } catch {
      return slugify(args.input).slice(0, 40);
    }
  }
  return slugify(args.input.split(/\s+/).slice(0, 5).join(' '));
}

function hashOf(content) {
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}

async function readMeta(metaPath) {
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(await readFile(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

function runNode(script, args, options = {}) {
  return execFileSync('node', [join(AUTOMATION_DIR, script), ...args], {
    cwd: AUTOMATION_DIR,
    encoding: 'utf8',
    ...options,
  });
}

function runOptionalNode(script, args) {
  try {
    return runNode(script, args);
  } catch {
    return '';
  }
}

function runJsonScript(script, fallback, options = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [join(AUTOMATION_DIR, script)], {
      cwd: AUTOMATION_DIR,
      stdio: ['ignore', 'pipe', options.inheritStderr ? 'inherit' : 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    if (!options.inheritStderr) child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => resolve(fallback));
    child.on('close', () => {
      try {
        resolve(JSON.parse(stdout || '{}'));
      } catch {
        resolve({ ...fallback, error: stderr || stdout || fallback.error });
      }
    });
  });
}

function runCheckEnv() {
  return runJsonScript('scripts/check-env.mjs', { ok: false, error: 'check-env failed' });
}

function runSessionFreshness() {
  const fallback = {
    fresh: true,
    total_billed: 0,
    messages: 0,
    session_duration_min: null,
    threshold_tokens: 3_000_000,
    threshold_messages: 300,
    advisory: true,
    reason: 'check-session-freshness failed',
  };
  return runJsonScript('scripts/check-session-freshness.mjs', fallback, { inheritStderr: true });
}

async function loadSpec(args, kind, specFile) {
  if (args.rerun) return existsSync(specFile) ? await readFile(specFile, 'utf8') : '';

  if (kind === 'google_sheet') {
    const loadArgs = [args.input, '--format=markdown'];
    if (args.sheetTab) loadArgs.push(`--sheet=${args.sheetTab}`);
    const content = runNode('scripts/load-google-sheet.mjs', loadArgs);
    await writeFile(specFile, content);

    const hashArgs = [args.input, '--format=markdown', '--strip-result-cols'];
    if (args.sheetTab) hashArgs.push(`--sheet=${args.sheetTab}`);
    return runNode('scripts/load-google-sheet.mjs', hashArgs);
  }

  if (kind === 'google_doc') {
    const content = runNode('scripts/load-google-doc.mjs', [args.input]);
    await writeFile(specFile, content);
    return content;
  }

  if (kind === 'confluence') {
    const content = runNode('scripts/load-confluence.mjs', [args.input]);
    await writeFile(specFile, content);
    return content;
  }

  if (kind === 'file') {
    const content = await readFile(resolve(args.input), 'utf8');
    await writeFile(specFile, content);
    return content;
  }

  if (kind === 'url') {
    const res = await fetch(args.input);
    if (!res.ok) throw new Error(`Fetch URL failed (${res.status}): ${await res.text()}`);
    const body = await res.text();
    const content = `# URL Input\n\nSource: ${args.input}\n\n---\n\n${body}\n`;
    await writeFile(specFile, content);
    return content;
  }

  const content = `# Text Input\n\n${args.input}\n`;
  await writeFile(specFile, content);
  return content;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const kind = args.rerun ? 'rerun' : inputKind(args.input);
  const slug = args.rerun ? 'rerun' : inputSlug(args, kind);
  const projectDir = join(AUTOMATION_DIR, 'projects', args.project);
  const specsDir = join(projectDir, 'specs');
  const testsDir = join(projectDir, 'tests');
  const resultsDir = join(projectDir, 'test-results');
  await mkdir(specsDir, { recursive: true });
  await mkdir(testsDir, { recursive: true });
  await mkdir(resultsDir, { recursive: true });

  const specFile = args.rerun ? '' : join(specsDir, `${slug}.md`);
  const testFile = args.rerun ? testsDir : join(testsDir, `${slug}.spec.ts`);
  const difficultyFile = args.rerun ? '' : join(specsDir, `${slug}.difficulty.json`);
  const metaPath = join(specsDir, '.source-meta', `${slug}.json`);

  const [envCheck, sessionFreshness] = await Promise.all([runCheckEnv(), runSessionFreshness()]);
  let contentForHash = '';
  if (!args.rerun) contentForHash = await loadSpec(args, kind, specFile);

  const currentHash = args.rerun ? '' : hashOf(contentForHash);
  const meta = await readMeta(metaPath);
  const storedHash = meta?.content_hash || '';
  const specStatus = args.rerun ? 'rerun' : (!storedHash ? 'first' : (storedHash === currentHash ? 'same' : 'changed'));
  const shouldAuthor = !args.rerun && (specStatus === 'first' || specStatus === 'changed' || !existsSync(testFile));

  let difficulty = { summary: { total: 0, simple: 0, medium: 0, hard: 0, blocked: 0 }, cases: [] };
  if (!args.rerun && specFile && existsSync(specFile)) {
    try {
      difficulty = JSON.parse(runNode('scripts/classify-difficulty.mjs', [specFile]));
      await writeFile(difficultyFile, JSON.stringify(difficulty, null, 2));
    } catch (e) {
      difficulty = { error: String(e.message || e), summary: { total: 0, simple: 0, medium: 0, hard: 0, blocked: 0 }, cases: [] };
    }
  }

  const state = {
    phase: 'prep',
    project: args.project,
    input: args.input,
    input_type: kind,
    target: args.target,
    slug,
    spec_file: args.rerun ? '' : `projects/${args.project}/specs/${slug}.md`,
    test_file: args.rerun ? `projects/${args.project}/tests/` : `projects/${args.project}/tests/${slug}.spec.ts`,
    difficulty_file: args.rerun ? '' : `projects/${args.project}/specs/${slug}.difficulty.json`,
    source_meta_file: args.rerun ? '' : `projects/${args.project}/specs/.source-meta/${slug}.json`,
    source_meta_status: specStatus,
    current_hash: currentHash,
    stored_hash: storedHash,
    should_author: shouldAuthor,
    mode: args.live ? 'live' : (args.fast ? 'fast' : 'normal'),
    flags: {
      max_heal: args.maxHeal,
      interactive: args.interactive,
      rerun: args.rerun,
      fast: args.fast,
      live: args.live,
      screens: args.screens,
      kg: args.kg,
      kg_rebuild: args.kgRebuild,
      result_sheet: args.resultSheet,
      result_doc: args.resultDoc,
      sheet_tab: args.sheetTab,
      note: args.note,
      only: args.only,
    },
    env_check: envCheck,
    session_freshness: sessionFreshness,
    difficulty_summary: difficulty.summary,
    updated_at: new Date().toISOString(),
  };

  await writeFile(join(projectDir, '.run-state.json'), JSON.stringify(state, null, 2));
  runOptionalNode('scripts/pipeline/checklist.mjs', ['init', args.project, `--slug=${slug}`]);
  runOptionalNode('scripts/pipeline/checklist.mjs', [
    'mark',
    args.project,
    'prep',
    envCheck.ok ? 'done' : 'blocked',
    `--slug=${slug}`,
    `--note=${envCheck.ok ? `state=${specStatus}, should_author=${shouldAuthor}` : 'environment check failed'}`,
  ]);
  if (envCheck.ok && !shouldAuthor) {
    runOptionalNode('scripts/pipeline/checklist.mjs', [
      'mark',
      args.project,
      'author',
      'skipped',
      `--slug=${slug}`,
      '--note=should_author=false',
    ]);
  }
  console.log(JSON.stringify(state, null, 2));
}

main().catch((e) => {
  console.error(`[prep-run] ${e.message}`);
  process.exit(1);
});
