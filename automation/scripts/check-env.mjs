#!/usr/bin/env node
// Check môi trường trước khi chạy test (Bước 2) — deterministic, 0 token AI.
// Gộp: Docker daemon, 3 agent file, node_modules — 1 lệnh thay vài lượt bash rời rạc.
// Output JSON để AI đọc thẳng, không cần tự suy luận từ text log.

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTOMATION_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function dockerUp() {
  try { execSync('docker info', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function main() {
  const agentFiles = ['playwright-test-planner.md', 'playwright-test-generator.md', 'playwright-test-healer.md']
    .map((f) => join(AUTOMATION_DIR, '.claude', 'agents', f));
  const missingAgents = agentFiles.filter((f) => !existsSync(f)).map((f) => f.split('/').pop());

  const isDockerUp = dockerUp();
  const result = {
    docker_up: isDockerUp,
    agents_ok: missingAgents.length === 0,
    missing_agents: missingAgents,
    node_modules_ok: existsSync(join(AUTOMATION_DIR, 'node_modules')),
    ok: isDockerUp && missingAgents.length === 0 && existsSync(join(AUTOMATION_DIR, 'node_modules')),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main();
