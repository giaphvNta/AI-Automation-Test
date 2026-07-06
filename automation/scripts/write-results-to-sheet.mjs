#!/usr/bin/env node
// ⚠️  CHƯA TEST — viết xong nhưng chưa chạy thực tế. Cần verify trước khi dùng production.
//
// Ghi kết quả test ngược vào Google Sheet — hai chế độ:
//
// ── UPDATE mode (mặc định) ────────────────────────────────────────────────────
// Tìm đúng dòng test case trong sheet gốc → tự động fill các cột:
//   • Cột browser (Chrome, Safari, Firefox...) → kết quả test trên browser đó
//   • Cột Tester → "Claude AI" (hoặc giá trị --tester)
//   • Cột Test date → ngày chạy
//   • Cột Status/Result → ✅ PASS / ❌ FAIL tổng hợp
//   • Cột Notes/Error → lỗi nếu fail
//
// Tất cả đều auto-detect từ tên header. Chỉ cần chỉ định thủ công khi auto-detect sai.
//
//   node scripts/write-results-to-sheet.mjs \
//     --sheet="https://docs.google.com/spreadsheets/d/<ID>/edit" \
//     --project=<name> \
//     --run-id=<run-id> \
//     [--match-col=<col>]    # Cột tên test case để match — auto-detect nếu bỏ qua
//     [--result-col=<col>]   # Cột Status/Result tổng hợp — auto-detect
//     [--date-col=<col>]     # Cột Test date — auto-detect
//     [--note-col=<col>]     # Cột Notes/Error — auto-detect
//     [--tester-col=<col>]   # Cột Tester — auto-detect
//     [--tester="Claude AI"] # Giá trị ghi vào cột Tester (mặc định: "Claude AI")
//     [--tab=<name>]         # Sheet tab (mặc định: tab đầu tiên) — alias: --sheet-tab
//     [--start-row=<n>]      # Dòng data đầu tiên (mặc định: 2)
//
// ── TRACKING mode ─────────────────────────────────────────────────────────────
// Append 1 dòng tóm tắt vào sheet lịch sử run riêng.
//
//   node scripts/write-results-to-sheet.mjs \
//     --mode=tracking \
//     --sheet="https://docs.google.com/spreadsheets/d/<ID>/edit" \
//     --project=<name> \
//     --run-id=<run-id> \
//     [--healed=<n>] [--notes="..."]

import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// ─── Keyword lists cho auto-detect ───────────────────────────────────────────

// Cột status/kết quả tổng hợp
// ⚠️ KHÔNG dùng 'result' làm keyword vì match nhầm "Expected Results" (cột spec, không phải cột kết quả test)
// ⚠️ KHÔNG match "期待結果" (expected result tiếng Nhật) — đã loại ở SPEC_COLUMN_PREFIXES
// Match ưu tiên: "結果1", "結果2" (có số suffix) trước, rồi mới "結果" đơn thuần
const RESULT_COL_KEYWORDS = ['結果2', '結果1', 'kết quả 2', 'kết quả 1', 'status', 'kết quả', 'outcome', 'trạng thái', '結果'];
// Cột tên test case để match
const MATCH_COL_KEYWORDS  = ['test case', 'testcase', 'test name', 'tên test', 'scenario',
                              'title', 'case name', 'id', 'no.', 'no ', 'tc'];
// Cột ngày test
const DATE_COL_KEYWORDS   = ['test date', 'run date', 'date', 'ngày', 'ngày test',
                              'updated', 'last run', '日付', 'tested on'];
// Cột ghi chú/lỗi
const NOTE_COL_KEYWORDS   = ['note', 'notes', 'ghi chú', 'error', 'reason', 'comment', 'remarks'];
// Cột tester/người test
const TESTER_COL_KEYWORDS = ['tester', 'tested by', 'người test', 'executor', 'qa', 'by'];

// Mapping browser projectName → từ khoá tên cột trong sheet
const BROWSER_COLUMN_MAP = {
  chromium: ['chrome', 'chromium', 'chrome/chromium', 'google chrome'],
  firefox:  ['firefox', 'ff', 'mozilla', 'firefox/gecko'],
  webkit:   ['safari', 'webkit', 'safari/webkit', 'apple safari'],
  edge:     ['edge', 'microsoft edge', 'ms edge'],
};

const TRACKING_HEADERS = [
  'Date', 'Project', 'Run ID', 'Total', 'Pass ✅', 'Fail ❌', 'Skip ⏭',
  'Healed 🔧', 'Status', 'Duration (s)', 'Report', 'Video (full-session)', 'Notes',
];

// ─── Auth ────────────────────────────────────────────────────────────────────

function base64url(v) {
  return Buffer.from(v).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function getAccessToken(authPath) {
  const key = JSON.parse(readFileSync(resolve(authPath), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: key.client_email, scope: SHEETS_SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now };
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

// ─── Sheets API helpers ──────────────────────────────────────────────────────

function extractSpreadsheetId(input) {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input;
}

async function getSpreadsheetMeta(sheetId, token) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Get spreadsheet failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function getSheetValues(sheetId, range, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Read sheet failed (${res.status}): ${await res.text()}`);
  return (await res.json()).values || [];
}

async function batchUpdateValues(sheetId, data, token) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
    }
  );
  if (!res.ok) throw new Error(`batchUpdate failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function appendRow(sheetId, range, row, token) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append`
  );
  url.searchParams.set('valueInputOption', 'USER_ENTERED');
  url.searchParams.set('insertDataOption', 'INSERT_ROWS');
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) throw new Error(`Append row failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function updateRow(sheetId, range, row, token) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`
  );
  url.searchParams.set('valueInputOption', 'USER_ENTERED');
  const res = await fetch(url, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) throw new Error(`Update row failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// ─── Column helpers ──────────────────────────────────────────────────────────

function indexToLetter(index) {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

function letterToIndex(letter) {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.toUpperCase().charCodeAt(i) - 64);
  }
  return index - 1;
}

// Các prefix/keyword chỉ ra đây là cột spec/mô tả, KHÔNG phải cột kết quả test
// Thêm: '期待' (kỳ vọng/expected tiếng Nhật) để tránh match nhầm "期待結果" (expected result)
const SPEC_COLUMN_PREFIXES = ['expected', 'actual', 'test step', 'pre-condition', 'objective', 'mô tả', 'muc tieu', '期待', '予想', 'kết quả mong'];

function detectColumn(headers, keywords) {
  const norm = (s) => (s || '').toLowerCase().trim();
  for (const kw of keywords) {
    const idx = headers.findIndex(h => {
      const nh = norm(h);
      if (!nh.includes(kw)) return false;
      // Loại trừ các cột spec (Expected Results, Actual Results, Test Steps...)
      if (SPEC_COLUMN_PREFIXES.some(prefix => nh.startsWith(prefix))) return false;
      return true;
    });
    if (idx >= 0) return idx;
  }
  return -1;
}

function resolveColSpec(spec, headers) {
  if (!spec) return -1;
  if (/^[A-Za-z]+$/.test(spec)) return letterToIndex(spec);
  if (/^\d+$/.test(spec)) return parseInt(spec, 10) - 1;
  const norm = (s) => (s || '').toLowerCase().trim();
  const exact = headers.findIndex(h => norm(h) === norm(spec));
  if (exact >= 0) return exact;
  return headers.findIndex(h => norm(h).includes(norm(spec)));
}

// Tìm cột browser trong sheet header
// Trả về map: { chromium: 3, webkit: 5 } (index 0-based)
function detectBrowserColumns(headers) {
  const norm = (s) => (s || '').toLowerCase().trim();
  const found = {};
  for (const [browser, keywords] of Object.entries(BROWSER_COLUMN_MAP)) {
    for (const kw of keywords) {
      const idx = headers.findIndex(h => norm(h) === kw || norm(h).includes(kw));
      if (idx >= 0) { found[browser] = idx; break; }
    }
  }
  return found;
}

// ─── Test result extraction ──────────────────────────────────────────────────

function extractTests(suites, results = []) {
  if (!suites) return results;
  for (const suite of suites) {
    if (suite.specs) {
      for (const spec of suite.specs) {
        // Mỗi spec có thể có nhiều tests (mỗi browser 1 test)
        for (const test of (spec.tests || [])) {
          const r = test.results?.[0];
          const rawStatus = r?.status || 'unknown';
          let status;
          if (rawStatus === 'passed') status = '✅ PASS';
          else if (rawStatus === 'skipped') status = '⏭ SKIP';
          else status = '❌ FAIL';

          // Strip mã màu ANSI (\x1b[2m, \x1b[31m...) — nếu không sheet sẽ hiển thị rác "[2m[31m..."
          const error = r?.error?.message
            ? r.error.message.replace(/\[[0-9;]*m/g, '').split('\n')[0].slice(0, 200)
            : '';

          results.push({
            title: spec.title,
            status,
            rawStatus,
            error,
            browser: (test.projectName || 'chromium').toLowerCase(),
          });
        }
      }
    }
    if (suite.suites) extractTests(suite.suites, results);
  }
  return results;
}

// ─── Matching logic ──────────────────────────────────────────────────────────

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^\w　-鿿가-힯]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTcNumber(s) {
  // Match "TC-01", "TC01", "TC-14b" etc. → normalize to plain integer string
  const tcMatch = (s || '').match(/\btc[-\s]?(\d+)/i);
  if (tcMatch) return String(parseInt(tcMatch[1], 10));
  // Match plain integer cell value like "1", "14" in sheet ID column
  const numMatch = (s || '').trim().match(/^(\d+)$/);
  if (numMatch) return String(parseInt(numMatch[1], 10));
  return null;
}

function matchTestToRow(testTitle, rowValue) {
  const tcTest = extractTcNumber(testTitle);
  const tcRow  = extractTcNumber(rowValue);
  if (tcTest && tcRow && tcTest === tcRow) return true;

  const normTest = normalize(testTitle);
  const normRow  = normalize(rowValue);
  if (!normRow || !normTest) return false;
  if (normTest.includes(normRow) && normRow.length > 5) return true;
  if (normRow.includes(normTest) && normTest.length > 5) return true;
  return false;
}

// ─── Path format ─────────────────────────────────────────────────────────────

function formatPath(linuxPath) {
  try {
    const proc = readFileSync('/proc/version', 'utf8');
    if (proc.toLowerCase().includes('microsoft')) {
      return linuxPath.replaceAll('/', '\\').replace('\\home', '\\\\wsl.localhost\\Ubuntu\\home');
    }
  } catch {}
  return `file://${linuxPath}`;
}

// ─── Args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    mode: 'update',
    sheet: '',
    project: '',
    runId: '',
    matchCol: '',
    resultCol: '',
    dateCol: '',
    noteCol: '',
    testerCol: '',
    tester: 'Claude AI',
    tab: '',
    startRow: 2,
    healed: 0,
    notes: '',
    auth: `${ROOT_DIR}/service-auth.json`,
  };
  for (const arg of argv) {
    if (arg.startsWith('--mode='))         args.mode      = arg.slice(7);
    else if (arg.startsWith('--sheet='))   args.sheet     = arg.slice(8);
    else if (arg.startsWith('--project=')) args.project   = arg.slice(10);
    else if (arg.startsWith('--run-id='))  args.runId     = arg.slice(9);
    else if (arg.startsWith('--match-col='))  args.matchCol  = arg.slice(12);
    else if (arg.startsWith('--result-col=')) args.resultCol = arg.slice(13);
    else if (arg.startsWith('--date-col='))   args.dateCol   = arg.slice(11);
    else if (arg.startsWith('--note-col='))   args.noteCol   = arg.slice(11);
    else if (arg.startsWith('--tester-col=')) args.testerCol = arg.slice(13);
    else if (arg.startsWith('--tester='))     args.tester    = arg.slice(9);
    else if (arg.startsWith('--tab='))       args.tab       = arg.slice(6);
    else if (arg.startsWith('--sheet-tab=')) args.tab       = arg.slice(12);
    else if (arg.startsWith('--start-row=')) args.startRow = parseInt(arg.slice(12), 10) || 2;
    else if (arg.startsWith('--healed='))  args.healed    = parseInt(arg.slice(9), 10) || 0;
    else if (arg.startsWith('--notes='))   args.notes     = arg.slice(8);
    else if (arg.startsWith('--auth='))    args.auth      = arg.slice(7);
  }
  const missing = ['sheet', 'project', 'runId'].filter(k => !args[k]);
  if (missing.length) {
    console.error('Thiếu args:', missing.map(k => `--${k.replace('Id', '-id')}`).join(', '));
    process.exit(2);
  }
  return args;
}

// ─── Mode: UPDATE ────────────────────────────────────────────────────────────

async function modeUpdate(args, token) {
  const sheetId = extractSpreadsheetId(args.sheet);

  // Lấy tên tab
  let tabName = args.tab;
  if (!tabName) {
    const meta = await getSpreadsheetMeta(sheetId, token);
    tabName = meta.sheets?.[0]?.properties?.title || 'Sheet1';
    console.error(`[write-results] Dùng tab: "${tabName}"`);
  }

  // Đọc toàn bộ sheet
  const allValues = await getSheetValues(sheetId, `'${tabName}'`, token);
  if (!allValues || allValues.length < 2) throw new Error('Sheet trống hoặc không có data');

  // Auto-detect header row:
  // 1. Ưu tiên row nào có cell ngắn (< 60 ký tự) chứa browser keywords (Chrome/Safari/Tester...)
  //    → đây là row label thật, không phải data
  // 2. Fallback: row có nhiều keyword nhất trong số các cell ngắn
  const BROWSER_HEADER_KEYWORDS = Object.values(BROWSER_COLUMN_MAP).flat();
  const SHORT_CELL = 60; // cell > 60 ký tự là data, không phải header

  function scoreRow(row) {
    const cells = row.map(h => (h || '').trim());
    // Chỉ count cell ngắn để tránh match data cells dài
    return cells.reduce((acc, cell) => {
      if (cell.length > SHORT_CELL) return acc;
      const low = cell.toLowerCase();
      const allKw = [
        ...MATCH_COL_KEYWORDS, ...RESULT_COL_KEYWORDS, ...DATE_COL_KEYWORDS,
        ...NOTE_COL_KEYWORDS, ...TESTER_COL_KEYWORDS, ...BROWSER_HEADER_KEYWORDS,
      ];
      return acc + (allKw.some(kw => low.includes(kw.toLowerCase())) ? 1 : 0);
    }, 0);
  }

  let headerRowIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(allValues.length, 30); i++) {
    const score = scoreRow(allValues[i]);
    if (score > bestScore) { bestScore = score; headerRowIdx = i; }
  }

  // Merge với row ngay trên nếu row đó cũng có keywords (double-header kiểu tách 2 dòng)
  let headerRow = allValues[headerRowIdx].map(h => (h || '').trim());
  if (headerRowIdx > 0) {
    const prevScore = scoreRow(allValues[headerRowIdx - 1]);
    if (prevScore > 0) {
      const prevRow = allValues[headerRowIdx - 1].map(h => (h || '').trim());
      headerRow = headerRow.map((h, i) => h || prevRow[i] || '');
    }
  }

  const dataStartRow = headerRowIdx + 2; // 1-indexed row number của data đầu tiên
  console.error(`[write-results] Header row: ${headerRowIdx + 1} (auto-detect, score=${bestScore})`);
  console.error('[write-results] Headers:', headerRow.map((h, i) => `${indexToLetter(i)}:${h||'?'}`).join(', '));

  // Resolve cột: user-specified → auto-detect → -1 (bỏ qua)
  const resolveOrDetect = (spec, keywords, label) => {
    if (spec) {
      const idx = resolveColSpec(spec, headerRow);
      if (idx >= 0) { console.error(`[write-results] ${label}: "${headerRow[idx]}" (${indexToLetter(idx)}) [user-specified]`); return idx; }
      console.error(`[write-results] ⚠️  Không tìm thấy cột "${spec}" cho ${label}`);
      return -1;
    }
    const idx = detectColumn(headerRow, keywords);
    if (idx >= 0) console.error(`[write-results] ${label}: "${headerRow[idx]}" (${indexToLetter(idx)}) [auto-detect]`);
    return idx;
  };

  const matchIdx   = resolveOrDetect(args.matchCol,  MATCH_COL_KEYWORDS,  'Match col');
  const resultIdx  = resolveOrDetect(args.resultCol, RESULT_COL_KEYWORDS, 'Result col');
  const dateIdx    = resolveOrDetect(args.dateCol,   DATE_COL_KEYWORDS,   'Date col');
  const noteIdx    = resolveOrDetect(args.noteCol,   NOTE_COL_KEYWORDS,   'Note col');
  const testerIdx  = resolveOrDetect(args.testerCol, TESTER_COL_KEYWORDS, 'Tester col');

  // Browser cột: auto-detect dựa vào tên header
  const browserColMap = detectBrowserColumns(headerRow); // { chromium: 3, webkit: 5, ... }
  if (Object.keys(browserColMap).length > 0) {
    console.error('[write-results] Browser cols:', Object.entries(browserColMap)
      .map(([b, i]) => `${b}→${indexToLetter(i)}(${headerRow[i]})`).join(', '));
  }

  // Phải có ít nhất match col
  if (matchIdx < 0) {
    console.error('\n[write-results] ❌ Không tìm được cột tên test case để match.');
    console.error('Headers hiện có:');
    headerRow.forEach((h, i) => console.error(`  ${indexToLetter(i)}: ${h || '(trống)'}`));
    console.error('\nChỉ định: --match-col=<tên header hoặc letter>');
    process.exit(1);
  }

  // Không có cột nào để ghi → warn
  const hasWriteTarget = resultIdx >= 0 || dateIdx >= 0 || noteIdx >= 0
    || testerIdx >= 0 || Object.keys(browserColMap).length > 0;
  if (!hasWriteTarget) {
    console.error('\n[write-results] ⚠️  Không tìm thấy cột nào để ghi (Status/Date/Tester/Browser...)');
    console.error('Headers hiện có:');
    headerRow.forEach((h, i) => console.error(`  ${indexToLetter(i)}: ${h || '(trống)'}`));
    console.error('\nChỉ định ví dụ: --result-col=Status --date-col="Test date" --tester-col=Tester');
    process.exit(1);
  }

  // Đọc kết quả test
  const resultsPath = resolve(
    `${ROOT_DIR}/automation/projects/${args.project}/test-results/runs/${args.runId}/results.json`
  );
  if (!existsSync(resultsPath)) throw new Error(`Không tìm thấy: ${resultsPath}`);
  const playResults = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const tests = extractTests(playResults.suites);
  console.error(`[write-results] ${tests.length} test results (${[...new Set(tests.map(t => t.browser))].join(', ')})`);

  const startDate = playResults.stats?.startTime ? new Date(playResults.stats.startTime) : new Date();
  const dateStr = startDate.toISOString().replace('T', ' ').slice(0, 19);

  // Group test results theo title + browser
  // testMap: Map<rowIdx, { byBrowser: {chromium: status, ...}, worstStatus, worstError }>
  const rowResults = new Map();

  const matched   = [];
  const unmatched = new Set();

  for (const test of tests) {
    let foundRowIdx = -1;
    for (let r = dataStartRow - 1; r < allValues.length; r++) {
      const cellValue = allValues[r][matchIdx] || '';
      if (matchTestToRow(test.title, cellValue)) { foundRowIdx = r; break; }
    }

    if (foundRowIdx < 0) {
      unmatched.add(test.title);
      continue;
    }

    if (!rowResults.has(foundRowIdx)) {
      rowResults.set(foundRowIdx, { byBrowser: {}, worstStatus: '✅ PASS', worstError: '' });
    }
    const entry = rowResults.get(foundRowIdx);
    entry.byBrowser[test.browser] = test.status;

    // Tổng hợp status: FAIL > SKIP > PASS
    if (test.status === '❌ FAIL') {
      entry.worstStatus = '❌ FAIL';
      if (!entry.worstError) entry.worstError = test.error;
    } else if (test.status === '⏭ SKIP' && entry.worstStatus === '✅ PASS') {
      entry.worstStatus = '⏭ SKIP';
    }

    matched.push(`${test.title} [${test.browser}] → row ${foundRowIdx + 1} (${test.status})`);
  }

  // Build batch update data
  const dataToUpdate = [];

  for (const [rowIdx, entry] of rowResults.entries()) {
    const sheetRow = rowIdx + 1; // 1-based
    const ref = `'${tabName}'`;

    // Cột Status/Result tổng hợp
    if (resultIdx >= 0) {
      dataToUpdate.push({ range: `${ref}!${indexToLetter(resultIdx)}${sheetRow}`, values: [[entry.worstStatus]] });
    }

    // Cột browser cụ thể (Chrome, Safari, ...)
    for (const [browser, colIdx] of Object.entries(browserColMap)) {
      const browserStatus = entry.byBrowser[browser];
      if (browserStatus !== undefined) {
        dataToUpdate.push({ range: `${ref}!${indexToLetter(colIdx)}${sheetRow}`, values: [[browserStatus]] });
      }
    }

    // Cột Test date
    if (dateIdx >= 0) {
      dataToUpdate.push({ range: `${ref}!${indexToLetter(dateIdx)}${sheetRow}`, values: [[dateStr]] });
    }

    // Cột Tester
    if (testerIdx >= 0) {
      dataToUpdate.push({ range: `${ref}!${indexToLetter(testerIdx)}${sheetRow}`, values: [[args.tester]] });
    }

    // Cột Notes/Error — ghi error khi fail, CLEAR khi pass (xóa error cũ của run trước)
    if (noteIdx >= 0) {
      dataToUpdate.push({ range: `${ref}!${indexToLetter(noteIdx)}${sheetRow}`, values: [[entry.worstError || '']] });
    }
  }

  if (dataToUpdate.length === 0) {
    console.error('[write-results] ⚠️  Không có cell nào được update');
    if (unmatched.size) {
      console.error('Tests không match:');
      [...unmatched].forEach(t => console.error('  -', t));
    }
    return;
  }

  // Cảnh báo khi nhiều test gộp vào cùng 1 row — thường do generator đặt TC ID sai
  // (vd: TC-30b/TC-30c thay vì TC-31/TC-32) → worst-status ghi đè kết quả thật của row đó
  const rowTestCount = new Map();
  for (const m of matched) {
    const rowNum = m.match(/row (\d+)/)?.[1];
    if (rowNum) rowTestCount.set(rowNum, (rowTestCount.get(rowNum) || 0) + 1);
  }
  for (const [rowNum, count] of rowTestCount.entries()) {
    if (count > 1) {
      console.error(`[write-results] ⚠️  ${count} tests gộp vào row ${rowNum} — kiểm tra TC ID trong test file có khớp sheet không:`);
      matched.filter(m => m.includes(`row ${rowNum}`)).forEach(m => console.error('    -', m));
    }
  }

  await batchUpdateValues(sheetId, dataToUpdate, token);

  const uniqueRows = rowResults.size;
  console.log(`[write-results] ✅ Đã update ${uniqueRows} dòng (${dataToUpdate.length} cells)`);

  // In cột đã ghi
  const cols = [];
  if (resultIdx >= 0) cols.push(`Status(${indexToLetter(resultIdx)})`);
  for (const [b, i] of Object.entries(browserColMap)) cols.push(`${b}(${indexToLetter(i)})`);
  if (dateIdx >= 0)   cols.push(`Date(${indexToLetter(dateIdx)})`);
  if (testerIdx >= 0) cols.push(`Tester(${indexToLetter(testerIdx)})`);
  if (noteIdx >= 0)   cols.push(`Notes(${indexToLetter(noteIdx)})`);
  console.log('  Cột đã ghi:', cols.join(', '));

  if (unmatched.size) {
    console.log(`\n  ⚠️  ${unmatched.size} test không match được dòng nào:`);
    [...unmatched].forEach(t => console.log('    -', t));
    console.log('  → Kiểm tra lại --match-col hoặc tên test case trong sheet');
  }
}

// ─── Mode: TRACKING ──────────────────────────────────────────────────────────

async function modeTracking(args, token) {
  const sheetId = extractSpreadsheetId(args.sheet);

  const resultsPath = resolve(
    `${ROOT_DIR}/automation/projects/${args.project}/test-results/runs/${args.runId}/results.json`
  );
  if (!existsSync(resultsPath)) throw new Error(`Không tìm thấy: ${resultsPath}`);
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const stats = results.stats || {};

  const pass        = stats.expected   || 0;
  const fail        = stats.unexpected || 0;
  const skip        = stats.skipped    || 0;
  const total       = pass + fail + skip;
  const durationSec = Math.round((stats.duration || 0) / 1000);
  const status      = fail > 0 ? '❌ FAIL' : (skip > 0 && pass === 0) ? '⏭ SKIP' : '✅ PASS';
  const startDate   = stats.startTime ? new Date(stats.startTime) : new Date();
  const dateStr     = startDate.toISOString().replace('T', ' ').slice(0, 19);

  const runBase    = `${ROOT_DIR}/automation/projects/${args.project}/test-results/runs/${args.runId}`;
  const reportPath = formatPath(`${runBase}/AI_REPORT.md`);
  const videoPath  = formatPath(`${runBase}/artifacts/full-session.mp4`);

  const row = [dateStr, args.project, args.runId, total, pass, fail, skip,
    args.healed, status, durationSec, reportPath, videoPath, args.notes];

  const existing = await getSheetValues(sheetId, 'A1:A2', token);
  if (!existing || existing.length === 0) {
    console.error('[write-results] Sheet trống — tạo header...');
    await updateRow(sheetId, 'A1', TRACKING_HEADERS, token);
  }

  const appendResult = await appendRow(sheetId, 'A:A', row, token);
  const updatedRange = appendResult.updates?.updatedRange || '?';
  console.log(`[write-results] ✅ Đã append vào sheet: ${updatedRange}`);
  console.log(`  ${status} — Pass: ${pass}, Fail: ${fail}, Skip: ${skip}, Healed: ${args.healed}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = await getAccessToken(args.auth);
  if (args.mode === 'tracking') await modeTracking(args, token);
  else await modeUpdate(args, token);
}

main().catch(e => { console.error(`[write-results] ❌ ${e.message}`); process.exit(1); });
