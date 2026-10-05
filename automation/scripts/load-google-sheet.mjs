#!/usr/bin/env node
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
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
  --auth=<ROOT>/service-auth.json (mặc định: <repo-root>/service-auth.json)
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

// Các cột kết quả test — tool ghi ngược vào (write-results-to-sheet.mjs), phải loại khỏi
// nội dung khi hash để detect thay đổi spec. Header thật thường là chuỗi song ngữ ghép
// (vd "結果2 Kết quả 2", "実施日1 Ngày thực hiện 1", "備考 Nhận xét") nên KHÔNG match exact được
// → match theo CHỨA keyword result. Nhưng phải LOẠI TRỪ cột "期待結果 Kết quả mong muốn"
// (Expected Results = nội dung spec, KHÔNG được strip — nếu strip sẽ mất expected → INC-05).
const RESULT_KEYWORDS = [
  'chrome', 'chromium', 'safari', 'webkit', 'firefox', 'edge',
  'tester', 'tested by', 'người test', 'người thực hiện', '実施者',
  'date test', 'test date', 'ngày test', 'run date', 'ngày thực hiện', '実施日',
  'status', 'trạng thái',
  '結果', 'kết quả', 'result',
  '備考', 'ghi chú', 'notes', 'note', 'error', 'remark',
];
// Nếu header chứa 1 trong các từ này → là cột SPEC (expected/điều kiện/bước...) → KHÔNG strip.
const SPEC_EXCLUDE_KEYWORDS = [
  '期待', 'expected', 'mong muốn', 'kết quả mong',
  'pre-condition', 'điều kiện', 'objective', 'mục tiêu',
  'test step', 'các bước', 'nội dung', 'mô tả', 'ケース', 'quan điểm', '確認箇所',
];

function stripResultColumns(rows) {
  if (rows.length === 0) return rows;
  const width = Math.max(...rows.map((row) => row.length));
  const norm = (v) => String(v ?? '').toLowerCase().trim();
  const drop = new Set();
  // Header có thể nằm ở 1 trong vài dòng đầu (template Nhật: 2 dòng metadata rồi mới tới header thật).
  const scanRows = rows.slice(0, 4);
  for (let col = 0; col < width; col++) {
    for (const row of scanRows) {
      const cell = norm(row[col]);
      if (!cell) continue;
      const isSpec = SPEC_EXCLUDE_KEYWORDS.some((kw) => cell.includes(kw));
      if (isSpec) continue; // cột spec (vd 期待結果) → giữ lại
      if (RESULT_KEYWORDS.some((kw) => cell.includes(kw))) {
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

// omitSource=true khi output chỉ dùng để HASH (--strip-result-cols): bỏ dòng Source vì URL
// gõ khác nhau (edit?gid=... vs edit#gid=...) sẽ làm hash đổi oan dù nội dung spec y hệt.
function toMarkdown(rows, source, omitSource = false) {
  const sourceLine = omitSource ? [] : [`Source: ${source}`, ''];
  if (rows.length === 0) {
    return [`# Google Sheet Input`, '', ...sourceLine, 'No rows found.', ''].join('\n');
  }

  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) =>
    Array.from({ length: width }, (_, index) => escapeCell(row[index])),
  );
  const header = normalized[0].map((cell, index) => cell || `Column ${index + 1}`);
  const body = normalized.slice(1);

  return [
    '# Google Sheet Input',
    '',
    ...sourceLine,
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
  else output = toMarkdown(rows, args.input, args.stripResultCols);

  if (args.out) writeFileSync(resolve(args.out), output);
  else process.stdout.write(output);
}

main().catch((error) => {
  console.error(`[load-google-sheet] ${error.message}`);
  process.exit(1);
});
