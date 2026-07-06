#!/usr/bin/env node
// ⚠️  CHƯA TEST — viết xong nhưng chưa chạy thực tế. Cần verify trước khi dùng production.
// Ghi kết quả test (từ results.json) vào cuối 1 Google Doc có sẵn — append 1 section mỗi run.
//
// Usage:
//   node scripts/write-results-to-doc.mjs \
//     --doc="https://docs.google.com/document/d/<ID>/edit" \
//     --project=<name> \
//     --run-id=<run-id> \
//     [--healed=<n>]  [--notes="..."]  [--auth=/path/to/service-auth.json]
//
// Cần: service-auth.json với Google Docs API (scope: documents read+write)
// Share doc với email service account (quyền Editor)

import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DOCS_SCOPE = 'https://www.googleapis.com/auth/documents';

// ─── Auth ────────────────────────────────────────────────────────────────────

function base64url(v) {
  return Buffer.from(v).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function getAccessToken(authPath) {
  const key = JSON.parse(readFileSync(resolve(authPath), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: key.client_email, scope: DOCS_SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(key.private_key, 'base64url')}`;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Auth failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

// ─── Docs API helpers ────────────────────────────────────────────────────────

function extractDocId(input) {
  const m = input.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input;
}

async function getDoc(docId, token) {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get doc failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function batchUpdate(docId, requests, token) {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`batchUpdate failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// ─── Path format theo OS ─────────────────────────────────────────────────────

function formatPath(linuxPath) {
  try {
    const proc = readFileSync('/proc/version', 'utf8');
    if (proc.toLowerCase().includes('microsoft')) {
      return linuxPath.replaceAll('/', '\\').replace('\\home', '\\\\wsl.localhost\\Ubuntu\\home');
    }
  } catch {}
  return `file://${linuxPath}`;
}

// ─── Build section text ──────────────────────────────────────────────────────

function buildSection(args, stats, dateStr) {
  const pass     = stats.expected   || 0;
  const fail     = stats.unexpected || 0;
  const skip     = stats.skipped    || 0;
  const total    = pass + fail + skip;
  const healed   = args.healed;
  const duration = Math.round((stats.duration || 0) / 1000);
  const status   = fail > 0 ? '❌ FAIL' : (skip > 0 && pass === 0) ? '⏭ SKIP' : '✅ PASS';

  const runBase   = `${ROOT_DIR}/automation/projects/${args.project}/test-results/runs/${args.runId}`;
  const reportPath = formatPath(`${runBase}/AI_REPORT.md`);
  const videoPath  = formatPath(`${runBase}/artifacts/full-session.mp4`);

  const lines = [
    '',
    `──────────────────────────────────────────`,
    `Test Run: ${dateStr}`,
    `Project: ${args.project}  |  Run ID: ${args.runId}`,
    `Status: ${status}  |  Total: ${total}  |  Pass: ${pass}  |  Fail: ${fail}  |  Skip: ${skip}  |  Healed: ${healed}  |  Duration: ${duration}s`,
    `Report : ${reportPath}`,
    `Video  : ${videoPath}`,
  ];
  if (args.notes) lines.push(`Notes  : ${args.notes}`);
  lines.push('');

  return lines.join('\n');
}

// ─── Args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    doc: '',
    project: '',
    runId: '',
    healed: 0,
    notes: '',
    auth: `${ROOT_DIR}/service-auth.json`,
  };
  for (const arg of argv) {
    if (arg.startsWith('--doc='))      args.doc     = arg.slice(6);
    else if (arg.startsWith('--project='))  args.project = arg.slice(10);
    else if (arg.startsWith('--run-id='))   args.runId   = arg.slice(9);
    else if (arg.startsWith('--healed='))   args.healed  = parseInt(arg.slice(9), 10) || 0;
    else if (arg.startsWith('--notes='))    args.notes   = arg.slice(8);
    else if (arg.startsWith('--auth='))     args.auth    = arg.slice(7);
  }
  const missing = ['doc', 'project', 'runId'].filter(k => !args[k]);
  if (missing.length) {
    console.error('Thiếu args:', missing.map(k => `--${k.replace('Id', '-id')}`).join(', '));
    console.error('Usage: write-results-to-doc.mjs --doc=<url> --project=<name> --run-id=<id> [--healed=N] [--notes="..."]');
    process.exit(2);
  }
  return args;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const resultsPath = resolve(
    `${ROOT_DIR}/automation/projects/${args.project}/test-results/runs/${args.runId}/results.json`
  );
  if (!existsSync(resultsPath)) throw new Error(`Không tìm thấy: ${resultsPath}`);
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const stats = results.stats || {};

  const startDate = stats.startTime ? new Date(stats.startTime) : new Date();
  const dateStr = startDate.toISOString().replace('T', ' ').slice(0, 19);

  const docId = extractDocId(args.doc);
  const token  = await getAccessToken(args.auth);

  // Lấy endIndex của body để insert text vào cuối
  const doc = await getDoc(docId, token);
  const bodyContent = doc.body?.content || [];
  const lastElement = bodyContent[bodyContent.length - 1];
  // endIndex của body là trước ký tự newline cuối cùng
  const insertIndex = (lastElement?.endIndex ?? 1) - 1;

  const sectionText = buildSection(args, stats, dateStr);

  // Insert text tại cuối document
  await batchUpdate(docId, [
    {
      insertText: {
        location: { index: insertIndex },
        text: sectionText,
      },
    },
  ], token);

  const pass   = stats.expected   || 0;
  const fail   = stats.unexpected || 0;
  const skip   = stats.skipped    || 0;
  const status = fail > 0 ? '❌ FAIL' : (skip > 0 && pass === 0) ? '⏭ SKIP' : '✅ PASS';

  console.log(`[write-results-to-doc] ✅ Đã append vào doc`);
  console.log(`  Project: ${args.project} | Run: ${args.runId}`);
  console.log(`  ${status} — Pass: ${pass}, Fail: ${fail}, Skip: ${skip}, Healed: ${args.healed}`);
}

main().catch(e => { console.error(`[write-results-to-doc] ❌ ${e.message}`); process.exit(1); });
