#!/usr/bin/env node
// Đo token THẬT tiêu thụ trong 1 phiên AI tool.
// Hiện backend đọc log JSONL của Claude Code tại ~/.claude/projects; tool khác như Codex sẽ fail-open
// ở check-session-freshness nếu không có log tương thích.
// Dùng làm bằng chứng A/B: chạy /ai-test 1 lần KHÔNG --kg và 1 lần CÓ --kg (mỗi lần 1 phiên
// riêng cho sạch), rồi so tổng token.
//
// Usage:
//   node scripts/measure-tokens.mjs --latest                 # phiên mới nhất của project hiện tại
//   node scripts/measure-tokens.mjs <đường-dẫn-file.jsonl>   # phiên cụ thể
//   node scripts/measure-tokens.mjs --list                   # liệt kê các phiên gần đây
//
// Token "billed" = input + output + cache_creation + cache_read (cache_read rẻ hơn nhưng vẫn tính riêng).

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

export async function listSessions() {
  const out = [];
  let dirs = [];
  try { dirs = await readdir(PROJECTS_DIR); } catch { return out; }
  for (const d of dirs) {
    const dir = join(PROJECTS_DIR, d);
    let files = [];
    try { files = await readdir(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const p = join(dir, f);
      const s = await stat(p);
      out.push({ path: p, project: d, mtime: s.mtimeMs });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export async function sumUsage(jsonlPath, from, to) {
  const text = await readFile(jsonlPath, 'utf8');
  const acc = { input: 0, output: 0, cache_creation: 0, cache_read: 0, messages: 0, byModel: {},
                first: null, last: null };
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const ts = obj?.timestamp ? Date.parse(obj.timestamp) : null;
    if (ts != null) {
      if (from != null && ts < from) continue;
      if (to != null && ts > to) continue;
      acc.first = acc.first == null ? ts : Math.min(acc.first, ts);
      acc.last = acc.last == null ? ts : Math.max(acc.last, ts);
    }
    const u = obj?.message?.usage || obj?.usage;
    if (!u) continue;
    const model = obj?.message?.model || obj?.model || 'unknown';
    acc.messages++;
    acc.input += u.input_tokens || 0;
    acc.output += u.output_tokens || 0;
    acc.cache_creation += u.cache_creation_input_tokens || 0;
    acc.cache_read += u.cache_read_input_tokens || 0;
    const m = (acc.byModel[model] ||= { input: 0, output: 0, cache_creation: 0, cache_read: 0 });
    m.input += u.input_tokens || 0;
    m.output += u.output_tokens || 0;
    m.cache_creation += u.cache_creation_input_tokens || 0;
    m.cache_read += u.cache_read_input_tokens || 0;
  }
  return acc;
}

function fmt(n) { return n.toLocaleString('en-US'); }

function printReport(path, a) {
  const total = a.input + a.output + a.cache_creation + a.cache_read;
  console.log(`\nPhiên: ${path}`);
  if (a.first != null) {
    const mins = ((a.last - a.first) / 60000).toFixed(1);
    console.log(`  khoảng thời gian  : ${new Date(a.first).toISOString()} → ${new Date(a.last).toISOString()} (${mins} phút)`);
  }
  console.log(`  messages có usage : ${fmt(a.messages)}`);
  console.log(`  input_tokens      : ${fmt(a.input)}`);
  console.log(`  output_tokens     : ${fmt(a.output)}`);
  console.log(`  cache_creation    : ${fmt(a.cache_creation)}`);
  console.log(`  cache_read        : ${fmt(a.cache_read)}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  TỔNG (billed)     : ${fmt(total)}`);
  const models = Object.keys(a.byModel);
  if (models.length > 1) {
    console.log(`  theo model:`);
    for (const m of models) {
      const b = a.byModel[m];
      console.log(`    ${m}: ${fmt(b.input + b.output + b.cache_creation + b.cache_read)}`);
    }
  }
}

export function toTokenJson(a) {
  const total = a.input + a.output + a.cache_creation + a.cache_read;
  return {
    input: a.input,
    output: a.output,
    cache_creation: a.cache_creation,
    cache_read: a.cache_read,
    total_billed: total,
    messages: a.messages,
    first: a.first ? new Date(a.first).toISOString() : null,
    last: a.last ? new Date(a.last).toISOString() : null,
    by_model: a.byModel,
    measured_at: new Date().toISOString(),
  };
}

function getOpt(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const arg = process.argv[2];
  if (!arg || arg === '--help') {
    console.log('Usage: measure-tokens.mjs [--latest | --list | <file.jsonl>] [--from <ISO>] [--to <ISO>]');
    process.exit(arg ? 0 : 1);
  }
  const from = getOpt('--from') ? Date.parse(getOpt('--from')) : null;
  const to = getOpt('--to') ? Date.parse(getOpt('--to')) : null;
  if (arg === '--list') {
    const s = await listSessions();
    for (const x of s.slice(0, 15)) {
      console.log(`${new Date(x.mtime).toISOString()}  ${x.project}  ${x.path}`);
    }
    return;
  }
  let path = arg;
  if (arg === '--latest') {
    const s = await listSessions();
    if (!s.length) { console.error('Không tìm thấy phiên nào.'); process.exit(1); }
    path = s[0].path;
  }
  const a = await sumUsage(path, from, to);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(toTokenJson(a), null, 2));
    return;
  }
  printReport(path, a);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
