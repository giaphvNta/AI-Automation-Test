// Extractor cho grammar `javascript` (JS/Express-style).
// M2.3: nhận diện route Express: app.get('/x', ...), router.post('/y', ...) → node Endpoint.
// ⚠️ CHỈ trích cấu trúc (method + path + vị trí). KHÔNG trích expected value.

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'all']);

// query: lời gọi <obj>.<method>('<path>', ...)
const API_QUERY = `
(call_expression
  function: (member_expression
    property: (property_identifier) @method)
  arguments: (arguments . (string) @path)) @call
`;

function stringValue(node, text) {
  // string node gồm cả dấu nháy → bóc lớp ngoài
  const raw = text.slice(node.startIndex, node.endIndex);
  return raw.replace(/^['"`]|['"`]$/g, '');
}

function kebab(s) {
  return s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

export function api(rootNode, Lang, ctx) {
  const query = Lang.query(API_QUERY);
  const matches = query.matches(rootNode);
  for (const m of matches) {
    const caps = Object.fromEntries(m.captures.map((c) => [c.name, c.node]));
    if (!caps.method || !caps.path) continue;
    const method = ctx.text.slice(caps.method.startIndex, caps.method.endIndex).toLowerCase();
    if (!HTTP_METHODS.has(method)) continue;
    const path = stringValue(caps.path, ctx.text);
    const line = caps.call.startPosition.row + 1;
    ctx.push({
      id: `ep-${method}-${kebab(path) || 'root'}`,
      type: 'Endpoint',
      name: `${method.toUpperCase()} ${path}`,
      method: method.toUpperCase(),
      path,
      lang: 'javascript',
      source: `${ctx.rel}:${line}`,
    });
  }
}
