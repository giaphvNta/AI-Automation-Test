#!/usr/bin/env node
// ⚠️  CHƯA TEST — viết xong nhưng chưa chạy thực tế. Cần verify trước khi dùng production.
// Load Confluence page → markdown text
// Usage:
//   node scripts/load-confluence.mjs <page-url-or-id> [--out=path]
//
// Auth (chọn 1 trong 2 cách):
//   1. Env vars: CONFLUENCE_EMAIL + CONFLUENCE_TOKEN (API token từ id.atlassian.com)
//   2. Flag: --email=<email> --token=<api-token>
//
// Ví dụ URL hỗ trợ:
//   https://<domain>.atlassian.net/wiki/spaces/<SPACE>/pages/<id>/<title>
//   https://<domain>.atlassian.net/wiki/spaces/<SPACE>/pages/<id>
//   https://confluence.example.com/display/<SPACE>/<title>

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = {
    input: '',
    email: process.env.CONFLUENCE_EMAIL || '',
    token: process.env.CONFLUENCE_TOKEN || '',
    out: '',
  };
  for (const arg of argv) {
    if (arg.startsWith('--email=')) args.email = arg.slice(8);
    else if (arg.startsWith('--token=')) args.token = arg.slice(8);
    else if (arg.startsWith('--out=')) args.out = arg.slice(6);
    else if (!args.input) args.input = arg;
  }
  if (!args.input) {
    console.error('Usage: load-confluence.mjs <page-url> [--email=<email>] [--token=<api-token>] [--out=path]');
    console.error('Auth env vars: CONFLUENCE_EMAIL, CONFLUENCE_TOKEN');
    process.exit(2);
  }
  return args;
}

function parseConfluenceUrl(url) {
  // Cloud: https://<domain>.atlassian.net/wiki/spaces/<SPACE>/pages/<id>/<title>
  const cloudMatch = url.match(/https:\/\/([^/]+\.atlassian\.net)\/wiki\/.*\/pages\/(\d+)/);
  if (cloudMatch) return { baseUrl: `https://${cloudMatch[1]}/wiki`, pageId: cloudMatch[2], type: 'cloud' };

  // Cloud v2 with just page id as last segment
  const cloudMatch2 = url.match(/https:\/\/([^/]+\.atlassian\.net)\/wiki\/.*\/(\d{6,})/);
  if (cloudMatch2) return { baseUrl: `https://${cloudMatch2[1]}/wiki`, pageId: cloudMatch2[2], type: 'cloud' };

  // Server/DC: https://confluence.example.com/display/<SPACE>/<title>?pageId=<id>
  const pageIdParam = new URL(url).searchParams.get('pageId');
  if (pageIdParam) {
    const base = new URL(url).origin;
    return { baseUrl: base, pageId: pageIdParam, type: 'server' };
  }

  throw new Error(`Không nhận diện được URL Confluence: ${url}\nHỗ trợ: *.atlassian.net/wiki/... hoặc confluence.*/display/... ?pageId=<id>`);
}

// Convert Confluence storage format (HTML-like) to markdown
function storageToMarkdown(html) {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1')
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, cells) => {
      const cols = [...cells.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
      return `| ${cols.join(' | ')} |`;
    })
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<ac:structured-macro[^>]*ac:name="([^"]*)"[^>]*>[\s\S]*?<\/ac:structured-macro>/gi, '[macro: $1]')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ').replace(/&#[0-9]+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchPage(baseUrl, pageId, email, token, type) {
  const authHeader = email && token
    ? `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
    : '';
  const headers = authHeader ? { authorization: authHeader, accept: 'application/json' } : { accept: 'application/json' };

  // Try Confluence Cloud REST API v1 (most compatible)
  const apiUrl = type === 'cloud'
    ? `${baseUrl}/rest/api/content/${pageId}?expand=body.storage,title,version,space`
    : `${baseUrl}/rest/api/content/${pageId}?expand=body.storage,title`;

  const res = await fetch(apiUrl, { headers });
  if (!res.ok) throw new Error(`Fetch Confluence page failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { baseUrl, pageId, type } = parseConfluenceUrl(args.input);
  const page = await fetchPage(baseUrl, pageId, args.email, args.token, type);

  const title = page.title || 'Confluence Page';
  const spaceKey = page.space?.key || '';
  const storageHtml = page.body?.storage?.value || '';
  const markdownBody = storageToMarkdown(storageHtml);

  const output = `# ${title}${spaceKey ? ` (${spaceKey})` : ''}\n\nSource: ${args.input}\n\n---\n\n${markdownBody}\n`;

  if (args.out) { writeFileSync(resolve(args.out), output); console.error(`[load-confluence] Saved: ${args.out}`); }
  else process.stdout.write(output);
}

main().catch(e => { console.error(`[load-confluence] ${e.message}`); process.exit(1); });
