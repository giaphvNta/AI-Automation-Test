#!/usr/bin/env node
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT_DIR = '/home/user/ai-automation-test';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

function usage() {
  console.error(`Usage:
  node scripts/load-google-sheet.mjs <sheet-url-or-id> [--range=A:Z] [--sheet="Sheet1"] [--format=markdown|csv|json] [--out=path] [--strip-result-cols]

Options:
  --strip-result-cols  Bỏ các cột kết quả test (Chrome/Safari/Tester/Date test/Status/Notes)
                       khỏi output — dùng khi hash nội dung spec để detect thay đổi,
                       tránh việc tool tự ghi kết quả làm hash đổi.

Defaults:
  --auth=/home/user/ai-automation-test/service-auth.json
  --range=A:Z
  --format=markdown`);
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    process.exit(0);
  }

  const args = {
    input: '',
    auth: `${ROOT_DIR}/service-auth.json`,
    range: 'A:Z',
    sheet: '',
    format: 'markdown',
    out: '',
    stripResultCols: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--auth=')) args.auth = arg.slice('--auth='.length);
    else if (arg.startsWith('--range=')) args.range = arg.slice('--range='.length);
    else if (arg.startsWith('--sheet=')) args.sheet = arg.slice('--sheet='.length);
    else if (arg.startsWith('--format=')) args.format = arg.slice('--format='.length);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--strip-result-cols') args.stripResultCols = true;
    else if (!args.input) args.input = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.input) {
    usage();
    process.exit(2);
  }
  if (!['markdown', 'csv', 'json'].includes(args.format)) {
    throw new Error(`Unsupported format: ${args.format}`);
  }
  return args;
}

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function extractSpreadsheetId(input) {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : input;
}

function sheetRange(sheetTitle, range) {
  if (!sheetTitle) return range;
  const escaped = sheetTitle.replaceAll("'", "''");
  return `'${escaped}'!${range}`;
}

async function getAccessToken(authPath) {
  const key = JSON.parse(readFileSync(resolve(authPath), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: key.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(key.private_key, 'base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google auth failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getFirstSheetTitle(spreadsheetId, accessToken) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
  url.searchParams.set('fields', 'sheets.properties.title');

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Read spreadsheet metadata failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.sheets?.[0]?.properties?.title || '';
}

async function readValues(spreadsheetId, range, accessToken) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
  );

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Read sheet values failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.values || [];
}

// Các header cột kết quả test — tool ghi ngược vào các cột này (write-results-to-sheet.mjs),
// nên phải loại khỏi nội dung khi hash để detect thay đổi spec.
// Match EXACT (sau normalize) để tránh false positive ("Expected Results" không match "result").
const RESULT_COL_HEADERS = [
  'chrome', 'chromium', 'safari', 'webkit', 'firefox', 'edge',
  'tester', 'tested by', 'qa', 'người test',
  'date test', 'test date', 'ngày test', 'run date', 'date',
  'status', 'result', 'kết quả', 'trạng thái', '結果',
  'notes', 'note', 'ghi chú', 'error',
];

function stripResultColumns(rows) {
  if (rows.length === 0) return rows;
  const width = Math.max(...rows.map((row) => row.length));
  const norm = (v) => String(v ?? '').toLowerCase().trim();
  const drop = new Set();
  // Header có thể nằm ở 1-3 dòng đầu (double-header: "First time" + sub-row "Chrome")
  const scanRows = rows.slice(0, 3);
  for (let col = 0; col < width; col++) {
    for (const row of scanRows) {
      if (RESULT_COL_HEADERS.includes(norm(row[col]))) {
        drop.add(col);
        break;
      }
    }
  }
  if (drop.size === 0) return rows;
  return rows.map((row) =>
    Array.from({ length: width }, (_, index) => row[index]).filter((_, index) => !drop.has(index)),
  );
}

function escapeCell(value) {
  const text = String(value ?? '').replaceAll('\n', ' ').trim();
  return text.replaceAll('|', '\\|');
}

function toMarkdown(rows, source) {
  if (rows.length === 0) return `# Google Sheet Input\n\nSource: ${source}\n\nNo rows found.\n`;

  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) =>
    Array.from({ length: width }, (_, index) => escapeCell(row[index])),
  );
  const header = normalized[0].map((cell, index) => cell || `Column ${index + 1}`);
  const body = normalized.slice(1);

  return [
    '# Google Sheet Input',
    '',
    `Source: ${source}`,
    '',
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
    '',
  ].join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spreadsheetId = extractSpreadsheetId(args.input);
  const accessToken = await getAccessToken(args.auth);
  const sheetTitle = args.sheet || (await getFirstSheetTitle(spreadsheetId, accessToken));
  const range = sheetRange(sheetTitle, args.range);
  let rows = await readValues(spreadsheetId, range, accessToken);
  if (args.stripResultCols) rows = stripResultColumns(rows);

  let output;
  if (args.format === 'json') output = `${JSON.stringify({ spreadsheetId, range, rows }, null, 2)}\n`;
  else if (args.format === 'csv') output = toCsv(rows);
  else output = toMarkdown(rows, args.input);

  if (args.out) writeFileSync(resolve(args.out), output);
  else process.stdout.write(output);
}

main().catch((error) => {
  console.error(`[load-google-sheet] ${error.message}`);
  process.exit(1);
});
