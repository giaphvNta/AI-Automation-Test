#!/usr/bin/env node
// Phân loại độ khó T từ spec markdown (deterministic, 0 token AI).
//
// Usage:
//   node scripts/classify-difficulty.mjs projects/<name>/specs/<slug>.md
//
// Output JSON:
//   { summary: { simple, medium, hard, blocked, total }, cases: [...] }

import { readFile } from 'node:fs/promises';

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((s) => s.trim().replace(/<br\s*\/?>/gi, ' '));
}

function isSeparator(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addFeature(features, score, name, value) {
  if (value) {
    features.push(name);
    return score + value;
  }
  return score;
}

function classifyCase(tc) {
  const text = normalize([tc.title, tc.precondition, tc.steps, tc.expected, tc.screen].join(' '));
  const features = [];
  let score = 0;

  score = addFeature(features, score, 'third_party_captcha', /\b(hcaptcha|captcha|recaptcha)\b/.test(text) ? 8 : 0);
  score = addFeature(features, score, 'rate_limit', /\b(429|too many requests|gio|hour|day|ngay|lan thu|>\s*\d+|\d+\s*lan)\b/.test(text) ? 4 : 0);
  score = addFeature(features, score, 'drag_drop', /\b(drag|drop|keo|tha|sort_id|sap xep|thu tu)\b/.test(text) ? 4 : 0);
  score = addFeature(features, score, 'db_or_seed', /\b(db|database|bang|record|seed|ip address|data tuong ung|co data|khong co data)\b/.test(text) ? 3 : 0);
  score = addFeature(features, score, 'mutation', /\b(xoa|delete|dang ky|register|submit|insert|update|create|edit|confirm)\b/.test(text) ? 3 : 0);
  score = addFeature(features, score, 'modal', /\b(modal|popup|dialog)\b|xac nhan xoa/.test(text) ? 2 : 0);
  score = addFeature(features, score, 'search_filter', /\b(search|filter|tim kiem|kiem tra ket qua)\b/.test(text) ? 2 : 0);
  score = addFeature(features, score, 'navigation_or_layout', /\b(layout|hien thi|dieu huong|menu|sidebar|truy cap link)\b/.test(text) ? 1 : 0);
  score = addFeature(features, score, 'api_http', /\b(api|http status|status code|endpoint|request|response)\b/.test(text) ? 1 : 0);

  const stepCount = (tc.steps.match(/\b\d+\./g) || []).length;
  if (stepCount >= 5) score = addFeature(features, score, 'many_steps', 2);
  else if (stepCount >= 3) score = addFeature(features, score, 'multi_step', 1);

  let tier = 'simple';
  let recommended = 'script-or-fable';
  if (features.includes('third_party_captcha')) {
    tier = 'blocked';
    recommended = 'block-or-mock';
  } else if (features.includes('drag_drop') || features.includes('rate_limit') || score >= 8) {
    tier = 'hard';
    recommended = 'sonnet-generator; advisor-on-stuck';
  } else if (score >= 4) {
    tier = 'medium';
    recommended = 'sonnet-or-reuse-screens';
  }

  return { ...tc, tier, score, features, recommended };
}

// Cột đích + từ khóa header nhận diện (đa ngôn ngữ: EN/VI/JP) — sheet khác nhau đặt cột khác vị trí.
const HEADER_PATTERNS = {
  id: /^(id|no\.?|so|stt|番号)$/,
  service: /(service|category|loai|dich vu|サービス)/,
  screen: /(screen|man hinh|page|画面|機能名)/,
  title: /(title|case name|objective|ten case|test case|ケース名)/,
  precondition: /(pre.?condition|dieu kien|前提条件)/,
  steps: /(test step|steps|cac buoc|thao tac|テスト内容)/,
  expected: /(expected|ket qua|期待結果)/,
};
const ESSENTIAL_FIELDS = ['id', 'title', 'steps', 'expected'];

// Dò cột theo TỪ KHÓA header (chịu được sheet khác thứ tự cột), yêu cầu khớp đủ 4 cột cốt lõi
// mới tin dùng — nếu không (header generic kiểu "Column 1", hoặc thiếu) → trả null để caller
// fallback về vị trí cứng (tương thích ngược với sheet không có header rõ).
function detectHeaderMap(rows) {
  let best = null;
  let bestScore = -1;
  for (const cells of rows) {
    const map = {};
    for (let i = 0; i < cells.length; i++) {
      const norm = normalize(cells[i]);
      if (!norm) continue;
      for (const [field, pattern] of Object.entries(HEADER_PATTERNS)) {
        if (map[field] === undefined && pattern.test(norm)) map[field] = i;
      }
    }
    const score = ESSENTIAL_FIELDS.filter((f) => map[f] !== undefined).length;
    if (score > bestScore) { bestScore = score; best = map; }
  }
  return bestScore >= ESSENTIAL_FIELDS.length ? best : null;
}

function parseTableCases(markdown) {
  const rows = markdown
    .split(/\r?\n/)
    .filter((line) => /^\s*\|/.test(line))
    .map(splitMarkdownRow)
    .filter((cells) => !isSeparator(cells));

  const headerMap = detectHeaderMap(rows);
  const mapping = headerMap || {}; // thiếu field nào thì dùng vị trí cứng cũ (fallback) cho field đó
  const idx = {
    id: mapping.id ?? 0,
    service: mapping.service ?? 1,
    screen: mapping.screen ?? 2,
    title: mapping.title ?? 3,
    precondition: mapping.precondition ?? 4,
    steps: mapping.steps ?? 5,
    expected: mapping.expected ?? 6,
  };

  const cases = [];
  for (const cells of rows) {
    if (!/^\d+[a-z]?$/i.test(cells[idx.id] || '')) continue;
    cases.push({
      id: `T-${cells[idx.id]}`,
      service: cells[idx.service] || '',
      screen: cells[idx.screen] || '',
      title: cells[idx.title] || '',
      precondition: cells[idx.precondition] || '',
      steps: cells[idx.steps] || '',
      expected: cells[idx.expected] || '',
      mapping: headerMap ? 'header' : 'positional-fallback',
    });
  }
  return cases;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: classify-difficulty.mjs <spec.md>');
    process.exit(1);
  }

  const markdown = await readFile(file, 'utf8');
  const cases = parseTableCases(markdown).map(classifyCase);
  const summary = { total: cases.length, simple: 0, medium: 0, hard: 0, blocked: 0 };
  for (const tc of cases) summary[tc.tier] += 1;
  console.log(JSON.stringify({ summary, cases }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
