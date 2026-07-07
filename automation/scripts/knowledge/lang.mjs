// Nhận diện ngôn ngữ theo đuôi file + nạp Tree-sitter grammar (WASM) động.
// Grammar-agnostic: thêm ngôn ngữ = thêm 1 dòng EXT_TO_GRAMMAR + (tùy chọn) 1 file query .scm.
// WASM lấy từ package `tree-sitter-wasms` (prebuilt, không cần build native trong Docker).

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

// đuôi file -> tên grammar (khớp tên file wasm trong tree-sitter-wasms/out/tree-sitter-<name>.wasm)
export const EXT_TO_GRAMMAR = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.vue': 'vue',
  '.java': 'java',
  '.php': 'php',
  '.py': 'python',
  '.go': 'go',
  '.rb': 'ruby',
  '.cs': 'c_sharp',
};

// thư mục chứa các file .wasm của tree-sitter-wasms
function wasmDir() {
  const pkg = require.resolve('tree-sitter-wasms/package.json');
  return join(dirname(pkg), 'out');
}

export function grammarForFile(path) {
  const ext = path.slice(path.lastIndexOf('.'));
  return EXT_TO_GRAMMAR[ext] || null;
}

// nạp & cache Language theo tên grammar. `Parser` là class web-tree-sitter đã Parser.init().
export function makeLanguageLoader(Parser) {
  const cache = new Map();
  const dir = wasmDir();
  return async function loadLanguage(grammar) {
    if (cache.has(grammar)) return cache.get(grammar);
    const wasmPath = join(dir, `tree-sitter-${grammar}.wasm`);
    if (!existsSync(wasmPath)) {
      throw new Error(`Chưa có grammar wasm cho "${grammar}" tại ${wasmPath}`);
    }
    const Lang = await Parser.Language.load(wasmPath);
    cache.set(grammar, Lang);
    return Lang;
  };
}
