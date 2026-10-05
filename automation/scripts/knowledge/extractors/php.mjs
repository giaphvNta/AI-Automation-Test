// Extractor grammar `php` — Laravel routes + Eloquent deps.
// ⚠️ CHỉ trích cấu trúc route/quan hệ. KHÔNG trích expected value.
//
// api(): walk đệ quy để resolve prefix của Route::group(['prefix'=>...]) (lồng nhau) → full path,
// và capture handler (Controller@method). Xử lý Route::get/post/...(path, handler)[->name()...].
import { kebab, unquote, lineOf } from './util.mjs';

const METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'any']);

// --- helpers ---------------------------------------------------------------
// value nodes của arguments (bóc lớp 'argument')
function argValues(argsNode) {
  if (!argsNode) return [];
  return argsNode.namedChildren.map((a) => (a.type === 'argument' ? a.namedChild(0) : a)).filter(Boolean);
}

// node là Route::<name>(...) ? → trả {name, args} ; else null
function scopedRouteCall(node, text) {
  if (node.type !== 'scoped_call_expression') return null;
  const scope = node.childForFieldName('scope');
  const name = node.childForFieldName('name');
  const args = node.childForFieldName('arguments');
  if (!scope || !name) return null;
  if (text.slice(scope.startIndex, scope.endIndex) !== 'Route') return null;
  return { name: text.slice(name.startIndex, name.endIndex), args };
}

// từ array_creation_expression lấy 'prefix' => 'X'
function readArrayPrefix(arrayNode, text) {
  for (const el of arrayNode.namedChildren) {
    if (el.type !== 'array_element_initializer') continue;
    const kids = el.namedChildren;
    if (kids.length >= 2 && kids[0].type === 'string') {
      if (unquote(kids[0], text) === 'prefix' && kids[1].type === 'string') return unquote(kids[1], text);
    }
  }
  return null;
}

// handler: 'Ctrl@method' | [Ctrl::class,'method'] | closure
function readHandler(valNode, text) {
  if (!valNode) return null;
  if (valNode.type === 'string') return unquote(valNode, text);
  if (valNode.type === 'array_creation_expression') {
    const els = valNode.namedChildren.filter((e) => e.type === 'array_element_initializer');
    if (els.length >= 2) {
      const cls = els[0].namedChild(0), mth = els[1].namedChild(0);
      const clsName = cls && cls.type === 'class_constant_access_expression' ? cls.namedChild(0) : cls;
      const c = clsName ? text.slice(clsName.startIndex, clsName.endIndex) : '?';
      const m = mth && mth.type === 'string' ? unquote(mth, text) : '?';
      return `${c}@${m}`;
    }
  }
  if (isClosure(valNode)) return 'closure';
  return null;
}

function isClosure(v) {
  return v.type === 'anonymous_function_creation_expression' || v.type === 'anonymous_function' || v.type === 'arrow_function';
}

function buildPath(stack, rel) {
  const parts = [...stack, rel].join('/').split('/').filter(Boolean);
  return '/' + parts.join('/');
}

function findClosure(vals) {
  return vals.find(isClosure) || null;
}

// --- api extractor ---------------------------------------------------------
export function api(rootNode, Lang, ctx) {
  const seen = new Set();

  function emit(method, fullPath, handler, callNode) {
    const id = `ep-${method}-${kebab(fullPath) || 'root'}`;
    if (seen.has(id)) return;
    seen.add(id);
    const node = {
      id, type: 'Endpoint', name: `${method.toUpperCase()} ${fullPath}`,
      method: method.toUpperCase(), path: fullPath, lang: 'php', source: `${ctx.rel}:${lineOf(callNode)}`,
    };
    if (handler) node.handler = handler;
    ctx.push(node);
  }

  // process 1 node với prefix stack hiện tại. return true nếu đã "tiêu thụ" subtree.
  function process(node, stack) {
    const rc = scopedRouteCall(node, ctx.text);
    if (!rc) return false;
    const name = rc.name.toLowerCase();
    const vals = argValues(rc.args);

    if (name === 'group') {
      let prefix = null;
      for (const v of vals) if (v.type === 'array_creation_expression') { const p = readArrayPrefix(v, ctx.text); if (p) prefix = p; }
      const closure = findClosure(vals);
      const newStack = prefix ? [...stack, prefix] : stack;
      if (closure) walk(closure, newStack);
      return true;
    }
    if (METHODS.has(name)) {
      const pathNode = vals[0];
      if (!pathNode || pathNode.type !== 'string') return true; // path động → bỏ, nhưng đã tiêu thụ
      const full = buildPath(stack, unquote(pathNode, ctx.text));
      emit(name, full, readHandler(vals[1], ctx.text), node);
      return true;
    }
    return false; // Route::prefix/middleware/... — để walk đi tiếp (chain khác chưa xử lý)
  }

  function walk(node, stack) {
    for (const child of node.namedChildren) {
      if (!process(child, stack)) walk(child, stack);
    }
  }
  walk(rootNode, []);
}

// --- deps extractor (giữ nguyên) -------------------------------------------
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
