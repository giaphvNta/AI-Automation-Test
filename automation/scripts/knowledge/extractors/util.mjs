// Tiện ích chung cho extractor.

export function kebab(s) {
  return String(s).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

// Lấy giá trị chuỗi literal, bóc dấu nháy + prefix (f/r/b của Python...). Rỗng → ''.
export function unquote(node, text) {
  let raw = text.slice(node.startIndex, node.endIndex);
  raw = raw.replace(/^[a-zA-Z]*(['"`])/, '$1');
  raw = raw.replace(/^['"`]|['"`]$/g, '');
  return raw;
}

export function lineOf(node) {
  return node.startPosition.row + 1;
}
