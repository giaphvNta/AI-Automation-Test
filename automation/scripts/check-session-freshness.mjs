#!/usr/bin/env node
// Advisory check: phát hiện phiên Claude Code quá dài trước khi chạy /ai-test.
// Không bao giờ block pipeline; lỗi đọc log hoặc fresh=false đều exit 0.
//
// Usage:
//   node scripts/check-session-freshness.mjs [--threshold-tokens=3000000] [--threshold-messages=300] [--session=<file.jsonl>]
//   --session: đo 1 phiên cụ thể thay vì luôn "mới nhất" (hữu ích khi debug/kiểm tra 1 phiên cũ).

import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOMATION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_THRESHOLD_TOKENS = 3_000_000;
const DEFAULT_THRESHOLD_MESSAGES = 300;

function parseArgs(argv) {
  const args = {
    thresholdTokens: DEFAULT_THRESHOLD_TOKENS,
    thresholdMessages: DEFAULT_THRESHOLD_MESSAGES,
    session: '',
  };
  for (const arg of argv) {
    if (arg.startsWith('--threshold-tokens=')) {
      args.thresholdTokens = Number(arg.slice('--threshold-tokens='.length)) || DEFAULT_THRESHOLD_TOKENS;
    } else if (arg.startsWith('--threshold-messages=')) {
      args.thresholdMessages = Number(arg.slice('--threshold-messages='.length)) || DEFAULT_THRESHOLD_MESSAGES;
    } else if (arg.startsWith('--session=')) {
      args.session = arg.slice('--session='.length);
    } else if (arg === '--help') {
      console.log('Usage: check-session-freshness.mjs [--threshold-tokens=3000000] [--threshold-messages=300] [--session=<file.jsonl>]');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function durationMin(first, last) {
  if (!first || !last) return null;
  const a = Date.parse(first);
  const b = Date.parse(last);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round(((b - a) / 60000) * 10) / 10;
}

function freshOpen(args, reason = '') {
  return {
    fresh: true,
    total_billed: 0,
    messages: 0,
    session_duration_min: null,
    threshold_tokens: args.thresholdTokens,
    threshold_messages: args.thresholdMessages,
    advisory: true,
    reason,
  };
}

function checkFreshness(args) {
  try {
    const target = args.session || '--latest';
    const out = execFileSync('node', [join(AUTOMATION_DIR, 'scripts/measure-tokens.mjs'), target, '--json'], {
      cwd: AUTOMATION_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const measured = JSON.parse(out);
    const total = Number(measured.total_billed || 0);
    const messages = Number(measured.messages || 0);
    const fresh = total <= args.thresholdTokens && messages <= args.thresholdMessages;
    const result = {
      fresh,
      total_billed: total,
      messages,
      session_duration_min: durationMin(measured.first, measured.last),
      threshold_tokens: args.thresholdTokens,
      threshold_messages: args.thresholdMessages,
    };
    if (!fresh) {
      console.error(
        `⚠️ Phiên hiện tại đã tích lũy ${total.toLocaleString('en-US')} token / ${messages.toLocaleString('en-US')} message — cache_read sẽ phình to khi chạy authoring/heal trong phiên này. Khuyến nghị: /clear hoặc mở phiên mới rồi resume bằng .run-checklist.md + .run-state.json.`
      );
    }
    return result;
  } catch (e) {
    return freshOpen(args, e?.message || 'measure-tokens failed');
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = checkFreshness(args);
  console.log(JSON.stringify(result, null, 2));
}

main();
