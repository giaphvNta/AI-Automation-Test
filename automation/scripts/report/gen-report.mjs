#!/usr/bin/env node
// Sinh KHUNG AI_REPORT.md từ results.json + token (deterministic, 0 token AI).
// AI chỉ cần APPEND phần "## ❌ TC-X Phân tích lỗi" cho case fail/BLOCKED — phần còn lại
// (📊/💰/📂/🎬 + bảng ảnh+video) script tự ráp từ attachments path thật trong results.json,
// không đoán tên thư mục.
//
// Usage:
//   node scripts/report/gen-report.mjs <project> <run-id> [--healed-tc="TC-1,TC-2"] [--mode=normal|live] [--os=auto|wsl2|macos|linux] [--from=<ISO>] [--to=<ISO>]
//
// Output: in ra stdout phần Markdown (📊+💰+📂+🎬). Caller (SKILL) ghi vào AI_REPORT.md rồi
// append phần phân tích lỗi/flaky/blocked ở dưới.

import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const AUTOMATION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const a = { project: null, runId: null, healedTc: [], mode: 'normal', os: 'auto', from: null, to: null };
  for (const arg of argv) {
    if (arg.startsWith('--healed-tc=')) a.healedTc = arg.slice(12).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith('--mode=')) a.mode = arg.slice(7);
    else if (arg.startsWith('--os=')) a.os = arg.slice(5);
    else if (arg.startsWith('--from=')) a.from = arg.slice(7);
    else if (arg.startsWith('--to=')) a.to = arg.slice(5);
    else if (!arg.startsWith('--') && !a.project) a.project = arg;
    else if (!arg.startsWith('--') && !a.runId) a.runId = arg;
  }
  return a;
}

function detectOs(explicit) {
  if (explicit && explicit !== 'auto') return explicit;
  if (process.platform === 'darwin') return 'macos';
  try {
    const v = readFileSync('/proc/version', 'utf8');
    if (/microsoft/i.test(v)) return 'wsl2';
  } catch {}
  return 'linux';
}

function wslDistroName() {
  const fromEnv = process.env.WSL_DISTRO_NAME;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null;
}

// path container "/work/..." -> path host thật theo OS, dùng cho report (dev tự mở file)
function toDisplayPath(containerPath, os) {
  const rel = containerPath.replace(/^\/work\//, ''); // "projects/<name>/.../video.mp4"
  const hostAbs = join(AUTOMATION_DIR, rel); // path host thật (linux-style)
  if (os === 'wsl2') {
    const distro = wslDistroName();
    if (distro) return `\\\\wsl.localhost\\${distro}` + hostAbs.replace(/\//g, '\\');
    return 'file://' + hostAbs;
  }
  if (os === 'macos' || os === 'linux') return 'file://' + hostAbs;
  return hostAbs;
}

function tcNumberOf(title) {
  const m = title.match(/^TC-?(\d+)/i);
  return m ? parseInt(m[1], 10) : 9999;
}

function attachmentPath(attachments, name) {
  const a = attachments.find((x) => x.name === name);
  return a ? a.path : null;
}

function containerToHost(containerPath) {
  return join(AUTOMATION_DIR, containerPath.replace(/^\/work\//, ''));
}

// Ưu tiên file thật trên đĩa (script chạy trên host, cùng filesystem với container qua bind mount)
// hơn là tin suông vào JSON — JSON ghi path .webm TRƯỚC convert (Bước 6b), và không biết file
// evidence.png tùy biến (test tự chụp, không nằm trong attachments[] của Playwright).
function resolveImage(attachments) {
  const shotAttach = attachmentPath(attachments, 'screenshot');
  if (!shotAttach) return null;
  const dirHost = dirname(containerToHost(shotAttach));
  const evidenceHost = join(dirHost, 'evidence.png');
  if (existsSync(evidenceHost)) return '/work/' + rel(evidenceHost) ;
  return shotAttach; // fallback: test-finished-*.png (pass) / test-failed-*.png (fail)
}

function resolveVideo(attachments) {
  const vidAttach = attachmentPath(attachments, 'video');
  if (!vidAttach) return null;
  const mp4Container = vidAttach.replace(/\.webm$/, '.mp4');
  const mp4Host = containerToHost(mp4Container);
  if (existsSync(mp4Host)) return mp4Container; // đã convert (Bước 6b) → dùng .mp4
  return vidAttach; // chưa convert → vẫn .webm
}

function rel(hostPath) {
  return hostPath.slice(AUTOMATION_DIR.length + 1).replace(/\\/g, '/');
}

function finalResultOf(test) {
  const results = test.results || [];
  if (results.length === 0) return { status: 'skipped', attachments: [], errors: [] };
  return results[results.length - 1];
}

function walkTests(suites, out) {
  for (const s of suites || []) {
    for (const spec of s.specs || []) {
      for (const test of spec.tests || []) {
        const r = finalResultOf(test);
        const hadFailedAttempt = (test.results || []).slice(0, -1).some((x) => x.status !== 'passed' && x.status !== 'skipped');
        out.push({
          title: spec.title,
          status: r.status,
          attachments: r.attachments || [],
          flaky: r.status === 'passed' && hadFailedAttempt,
        });
      }
    }
    walkTests(s.suites, out);
  }
  return out;
}

function statusEmoji(status, isHealed) {
  if (status === 'skipped') return '⛔';
  if (status === 'passed') return isHealed ? '⚠️' : '✅';
  return '❌';
}

async function getTokenSummary({ from, to } = {}) {
  try {
    const args = [join(AUTOMATION_DIR, 'scripts', 'measure-tokens.mjs'), '--latest', '--json'];
    if (from) args.push('--from', from);
    if (to) args.push('--to', to);
    const out = execFileSync('node', args, { encoding: 'utf8' });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

async function getRunTokenSummary(runDir) {
  const tokenPath = join(runDir, 'token.json');
  if (!existsSync(tokenPath)) return null;
  try {
    return JSON.parse(await readFile(tokenPath, 'utf8'));
  } catch {
    return null;
  }
}

function computeStats(tests) {
  const stats = { total: tests.length, expected: 0, unexpected: 0, skipped: 0, flaky: 0 };
  for (const t of tests) {
    if (t.status === 'skipped') stats.skipped += 1;
    else if (t.status === 'passed') stats.expected += 1;
    else stats.unexpected += 1;
    if (t.flaky) stats.flaky += 1;
  }
  return stats;
}

export async function generateReport({ project, runId, healedTc = [], mode = 'normal', os: osArg = 'auto', from = null, to = null, sessionFreshness = null }) {
  if (!project || !runId) {
    throw new Error('Missing project/runId');
  }
  const os = detectOs(osArg);
  const runDir = join(AUTOMATION_DIR, 'projects', project, 'test-results', 'runs', runId);
  const resultsPath = join(runDir, 'results.json');
  if (!existsSync(resultsPath)) {
    console.error(`Không thấy results.json: ${resultsPath}`);
    process.exit(1);
  }
  const results = JSON.parse(await readFile(resultsPath, 'utf8'));
  const tests = walkTests(results.suites, []).sort((a, b) => tcNumberOf(a.title) - tcNumberOf(b.title));

  // .run-state.json (do merge-heal.mjs ghi) là nguồn CHUẨN cho healed_tc — không cần AI tự nhớ/truyền
  // --healed-tc qua nhiều vòng heal. Flag --healed-tc chỉ dùng khi chạy tay không qua heal loop.
  let healedFromState = [];
  const statePath = join(runDir, '.run-state.json');
  if (existsSync(statePath)) {
    try {
      const runState = JSON.parse(await readFile(statePath, 'utf8'));
      healedFromState = runState.healed_tc || [];
      sessionFreshness ||= runState.session_freshness || null;
    } catch {}
  }
  const healedSet = new Set([...healedTc, ...healedFromState].map((s) => s.replace(/:$/, '')));

  const stats = computeStats(tests);
  const healedCount = tests.filter((t) => t.status === 'passed' && healedSet.has(t.title.match(/^TC-?\d+[a-z]?/i)?.[0])).length;

  let token = null;
  let tokenSource = 'none';
  if (from || to) {
    token = await getTokenSummary({ from, to });
    tokenSource = token ? 'filtered' : 'filtered-missing';
  } else {
    token = await getRunTokenSummary(runDir);
    tokenSource = token ? 'run-token' : 'none';
    if (!token) {
      token = await getTokenSummary();
      tokenSource = token ? 'latest-session' : 'none';
    }
  }

  const lines = [];
  lines.push('## 📊 Kết quả tổng hợp', '');
  lines.push('| Metric | Count |', '|--------|-------|');
  lines.push(`| Total | ${stats.total} |`);
  lines.push(`| ✅ Pass | ${stats.expected} |`);
  lines.push(`| ❌ Fail | ${stats.unexpected} |`);
  lines.push(`| ⚠️ Flaky (healed by retry) | ${stats.flaky} |`);
  lines.push(`| 🔧 Healed | ${healedCount} |`, '', '---', '');

  lines.push('## 💰 Token tiêu thụ (cả lần chạy)', '');
  if (token) {
    lines.push('| Loại | Token |', '|------|-------|');
    lines.push(`| input | ${token.input.toLocaleString('en-US')} |`);
    lines.push(`| output | ${token.output.toLocaleString('en-US')} |`);
    lines.push(`| cache_creation | ${token.cache_creation.toLocaleString('en-US')} |`);
    lines.push(`| cache_read | ${token.cache_read.toLocaleString('en-US')} |`);
    lines.push(`| **TỔNG (billed)** | **${token.total_billed.toLocaleString('en-US')}** |`);
  } else {
    lines.push('> Không đo được (thiếu log phiên). Chạy `npm run kg:tokens -- --latest` thủ công.');
  }
  if (sessionFreshness?.fresh === false) {
    lines.push('', '> ⚠️ Run này chạy trong phiên đã tích lũy nhiều token từ trước — số cache_read/tổng token có thể không phản ánh đúng chi phí riêng của run này. Muốn số sạch: chạy lại trong phiên mới.');
  }
  if (tokenSource === 'filtered') {
    lines.push('', `> Đo bằng \`measure-tokens.mjs --latest\` có lọc thời gian${from ? ` từ \`${from}\`` : ''}${to ? ` đến \`${to}\`` : ''}.`, '', '---', '');
  } else if (tokenSource === 'run-token') {
    lines.push('', '> Số token lấy từ `token.json` trong run dir. File này là nguồn chuẩn khi mỗi lần test chạy trong một phiên Claude riêng; nếu dùng chung phiên dài, hãy sinh report với `--from=<ISO lúc bắt đầu run>` để bó đúng lần chạy.', '', '---', '');
  } else if (tokenSource === 'filtered-missing') {
    lines.push('', '> Không đọc được log Claude để lọc theo thời gian. Không fallback sang `token.json` vì file đó có thể chứa cả phiên dài, không đúng riêng run này.', '', '---', '');
  } else {
    lines.push('', '> Chưa có `token.json` của run, nên số token là snapshot từ `measure-tokens.mjs --latest`. Chạy 1 phiên/run để snapshot này không lẫn việc khác; sau khi Stop hook ghi `token.json`, dùng file đó làm nguồn chuẩn.', '', '---', '');
  }

  const reportUncPath = toDisplayPath(`/work/projects/${project}/test-results/runs/${runId}/AI_REPORT.md`, os);
  const fullSessionPath = toDisplayPath(`/work/projects/${project}/test-results/runs/${runId}/artifacts/full-session.mp4`, os);
  lines.push('## 📂 Đường dẫn', '', '```');
  lines.push(`📝 Report: ${reportUncPath}`);
  lines.push(`🎬 Full session: ${fullSessionPath}`);
  lines.push('```', '', '---', '');

  lines.push('## 🎬 Video & ảnh từng test case', '');
  lines.push('| TC | Title | Ảnh (evidence) | Video |', '|----|-------|----------------|-------|');
  for (const t of tests) {
    const m = t.title.match(/^(TC-?\d+[a-z]?):?\s*(.*)$/i);
    const tcId = m ? m[1] : t.title;
    const titleRest = m ? m[2] : '';
    const isHealed = t.status === 'passed' && healedSet.has(tcId);
    const emoji = statusEmoji(t.status, isHealed);
    const shot = resolveImage(t.attachments);
    const vid = resolveVideo(t.attachments);
    const shotDisp = shot ? '`' + toDisplayPath(shot, os) + '`' : '—';
    const vidDisp = vid ? '`' + toDisplayPath(vid, os) + '`' : '—';
    lines.push(`| ${emoji} ${tcId} | ${titleRest} | ${shotDisp} | ${vidDisp} |`);
  }
  lines.push('');
  lines.push('> (✅=pass, ❌=fail, ⚠️=healed, ⛔=blocked/skipped. Script sinh tự động từ results.json — KHÔNG đoán tên thư mục.)');

  return lines.join('\n');
}

async function main() {
  const { project, runId, healedTc, mode, os: osArg, from, to } = parseArgs(process.argv.slice(2));
  if (!project || !runId) {
    console.error('Usage: gen-report.mjs <project> <run-id> [--healed-tc="TC-1,TC-2"] [--mode=normal|live] [--os=auto|wsl2|macos|linux] [--from=<ISO>] [--to=<ISO>]');
    process.exit(1);
  }
  console.log(await generateReport({ project, runId, healedTc, mode, os: osArg, from, to }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
