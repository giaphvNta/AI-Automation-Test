#!/usr/bin/env node
// ⚠️  CHƯA TEST — viết xong nhưng chưa chạy thực tế. Cần verify trước khi dùng production.
// Load Google Docs document → markdown text
// Usage:
//   node scripts/load-google-doc.mjs <doc-url-or-id> [--out=path]
//   node scripts/load-google-doc.mjs "https://docs.google.com/document/d/<ID>/edit" --out=specs/input.md

import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DOCS_SCOPE = 'https://www.googleapis.com/auth/documents.readonly';

function parseArgs(argv) {
  const args = { input: '', auth: `${ROOT_DIR}/service-auth.json`, out: '' };
  for (const arg of argv) {
    if (arg.startsWith('--auth=')) args.auth = arg.slice(7);
    else if (arg.startsWith('--out=')) args.out = arg.slice(6);
    else if (!args.input) args.input = arg;
  }
  if (!args.input) { console.error('Usage: load-google-doc.mjs <doc-url-or-id> [--out=path]'); process.exit(2); }
  return args;
}

function extractDocId(input) {
  const m = input.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input;
}

function base64url(v) {
  return Buffer.from(v).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function getAccessToken(authPath, scope) {
  const key = JSON.parse(readFileSync(resolve(authPath), 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: key.client_email, scope, aud: TOKEN_URL, exp: now + 3600, iat: now };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const sig = signer.sign(key.private_key, 'base64url');
  const assertion = `${unsigned}.${sig}`;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Auth failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

async function fetchDoc(docId, token) {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Fetch doc failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// Extract plain text from Google Docs structural elements
function extractText(elements) {
  if (!elements) return '';
  const lines = [];
  for (const el of elements) {
    if (el.paragraph) {
      const style = el.paragraph.paragraphStyle?.namedStyleType || '';
      const text = (el.paragraph.elements || [])
        .map(e => e.textRun?.content || '')
        .join('');
      const trimmed = text.replace(/\n$/, '');
      if (!trimmed) { lines.push(''); continue; }
      if (style === 'HEADING_1') lines.push(`# ${trimmed}`);
      else if (style === 'HEADING_2') lines.push(`## ${trimmed}`);
      else if (style === 'HEADING_3') lines.push(`### ${trimmed}`);
      else if (style === 'HEADING_4') lines.push(`#### ${trimmed}`);
      else lines.push(trimmed);
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        const cells = (row.tableCells || []).map(cell =>
          extractText(cell.content).replace(/\n+/g, ' ').trim()
        );
        lines.push(`| ${cells.join(' | ')} |`);
      }
    } else if (el.sectionBreak) {
      lines.push('\n---\n');
    }
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const docId = extractDocId(args.input);
  const token = await getAccessToken(args.auth, DOCS_SCOPE);
  const doc = await fetchDoc(docId, token);
  const content = extractText(doc.body?.content);
  const output = `# Google Doc: ${doc.title}\n\nSource: ${args.input}\n\n---\n\n${content}\n`;
  if (args.out) { writeFileSync(resolve(args.out), output); console.error(`[load-google-doc] Saved to ${args.out}`); }
  else process.stdout.write(output);
}

main().catch(e => { console.error(`[load-google-doc] ${e.message}`); process.exit(1); });
