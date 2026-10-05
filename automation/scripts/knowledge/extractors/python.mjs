// Extractor grammar `python` — FastAPI/Flask decorator: @router.get("/path"), @app.post("/x").
// ⚠️ CHỈ trích cấu trúc route. KHÔNG trích expected value.
// Lưu ý: path là tương đối theo prefix router (mount ở nơi khác) — ghi path decorator as-is.
import { kebab, unquote, lineOf } from './util.mjs';

const METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'route']);
const Q = `(decorator (call function: (attribute attribute: (identifier) @method) arguments: (argument_list) @args)) @dec`;

export function api(rootNode, Lang, ctx) {
  const query = Lang.query(Q);
  for (const m of query.matches(rootNode)) {
    const c = Object.fromEntries(m.captures.map((x) => [x.name, x.node]));
    const method = ctx.text.slice(c.method.startIndex, c.method.endIndex).toLowerCase();
    if (!METHODS.has(method)) continue;
    const firstArg = c.args.namedChild(0);
    if (!firstArg || firstArg.type !== 'string') continue;
    const path = unquote(firstArg, ctx.text);
    const verb = method === 'route' ? 'ANY' : method.toUpperCase();
    ctx.push({
      id: `ep-${verb.toLowerCase()}-${kebab(path) || 'root'}`,
      type: 'Endpoint',
      name: `${verb} ${path}`,
      method: verb,
      path,
      lang: 'python',
      source: `${ctx.rel}:${lineOf(c.dec)}`,
    });
  }
}
