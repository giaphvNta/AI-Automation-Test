// Extractor grammar `ruby` — Rails routes.rb: get "path", to: "...";  resources :users.
// ⚠️ CHỉ trích cấu trúc route. KHÔNG trích expected value.
import { kebab, unquote, lineOf } from './util.mjs';

const METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);
const RESOURCE = new Set(['resources', 'resource']);
const Q = `(call method: (identifier) @method arguments: (argument_list) @args) @call`;

// Rails model: belongs_to :country → Entity(class) requires country.
const REL_REQUIRES_RB = new Set(['belongs_to']);
const DEPS_Q = `(class name: (constant) @entity body: (body_statement (call method: (identifier) @rel arguments: (argument_list (simple_symbol) @target)))) `;

export function deps(rootNode, Lang, ctx) {
  const query = Lang.query(DEPS_Q);
  const seen = new Set();
  for (const m of query.matches(rootNode)) {
    const c = Object.fromEntries(m.captures.map((x) => [x.name, x.node]));
    const rel = ctx.text.slice(c.rel.startIndex, c.rel.endIndex).toLowerCase();
    if (!REL_REQUIRES_RB.has(rel)) continue;
    const entity = ctx.text.slice(c.entity.startIndex, c.entity.endIndex);
    const target = ctx.text.slice(c.target.startIndex, c.target.endIndex).replace(/^:/, '');
    const eid = `entity-${kebab(entity)}`;
    if (!seen.has(eid)) {
      seen.add(eid);
      ctx.push({ id: eid, type: 'Entity', name: entity, lang: 'ruby', source: `${ctx.rel}:${lineOf(c.entity)}` });
    }
    ctx.pushEdge({ from: eid, to: `entity-${kebab(target)}`, type: 'requires', source: `${ctx.rel}:${lineOf(c.rel)}` });
  }
}

export function api(rootNode, Lang, ctx) {
  const query = Lang.query(Q);
  for (const m of query.matches(rootNode)) {
    const c = Object.fromEntries(m.captures.map((x) => [x.name, x.node]));
    const method = ctx.text.slice(c.method.startIndex, c.method.endIndex).toLowerCase();
    const firstArg = c.args.namedChild(0);
    if (!firstArg) continue;

    if (METHODS.has(method) && firstArg.type === 'string') {
      const path = unquote(firstArg, ctx.text);
      ctx.push({
        id: `ep-${method}-${kebab(path) || 'root'}`,
        type: 'Endpoint',
        name: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        lang: 'ruby',
        source: `${ctx.rel}:${lineOf(c.call)}`,
      });
    } else if (RESOURCE.has(method) && firstArg.type === 'simple_symbol') {
      const name = ctx.text.slice(firstArg.startIndex, firstArg.endIndex).replace(/^:/, '');
      ctx.push({
        id: `route-resources-${kebab(name)}`,
        type: 'Route',
        name: `resources ${name}`,
        path: `/${name}`,
        lang: 'ruby',
        source: `${ctx.rel}:${lineOf(c.call)}`,
      });
    }
  }
}
