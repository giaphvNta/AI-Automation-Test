// Extractor grammar `php` — Laravel: Route::get('/path', ...), Route::post('', ...).
// ⚠️ CHỈ trích cấu trúc route. KHÔNG trích expected value.
import { kebab, unquote, lineOf } from './util.mjs';

const METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'any']);
const Q = `(scoped_call_expression scope: (name) @class name: (name) @method arguments: (arguments) @args) @call`;

// Eloquent: $this->belongsTo(Target::class) → Entity(class) requires Target.
const REL_REQUIRES = new Set(['belongsto', 'belongstomany']);
const DEPS_Q = `(class_declaration name: (name) @entity body: (declaration_list (method_declaration body: (compound_statement (return_statement (member_call_expression object: (variable_name (name) @obj) name: (name) @rel arguments: (arguments (argument (class_constant_access_expression . (name) @target))))))))) `;

export function deps(rootNode, Lang, ctx) {
  const query = Lang.query(DEPS_Q);
  const seen = new Set();
  for (const m of query.matches(rootNode)) {
    const c = Object.fromEntries(m.captures.map((x) => [x.name, x.node]));
    if (ctx.text.slice(c.obj.startIndex, c.obj.endIndex) !== 'this') continue;
    const rel = ctx.text.slice(c.rel.startIndex, c.rel.endIndex).toLowerCase();
    if (!REL_REQUIRES.has(rel)) continue;
    const entity = ctx.text.slice(c.entity.startIndex, c.entity.endIndex);
    const target = ctx.text.slice(c.target.startIndex, c.target.endIndex);
    const eid = `entity-${kebab(entity)}`;
    if (!seen.has(eid)) {
      seen.add(eid);
      ctx.push({ id: eid, type: 'Entity', name: entity, lang: 'php', source: `${ctx.rel}:${lineOf(c.entity)}` });
    }
    ctx.pushEdge({ from: eid, to: `entity-${kebab(target)}`, type: 'requires', source: `${ctx.rel}:${lineOf(c.rel)}` });
  }
}

export function api(rootNode, Lang, ctx) {
  const query = Lang.query(Q);
  for (const m of query.matches(rootNode)) {
    const c = Object.fromEntries(m.captures.map((x) => [x.name, x.node]));
    if (ctx.text.slice(c.class.startIndex, c.class.endIndex) !== 'Route') continue;
    const method = ctx.text.slice(c.method.startIndex, c.method.endIndex).toLowerCase();
    if (!METHODS.has(method)) continue;
    const firstArg = c.args.namedChild(0);       // (argument ...)
    const strNode = firstArg && firstArg.namedChild(0);
    if (!strNode || strNode.type !== 'string') continue; // path động (env(), biến) → bỏ
    const path = unquote(strNode, ctx.text);
    ctx.push({
      id: `ep-${method}-${kebab(path) || 'root'}`,
      type: 'Endpoint',
      name: `${method.toUpperCase()} ${path || '/'}`,
      method: method.toUpperCase(),
      path,
      lang: 'php',
      source: `${ctx.rel}:${lineOf(c.call)}`,
    });
  }
}
