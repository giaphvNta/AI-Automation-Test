// Dispatcher extractor theo grammar. Mỗi grammar = 1 module ./<grammar>.mjs
// export { api?, ui?, deps? }, mỗi hàm nhận (rootNode, Lang, ctx) và đẩy vào graph part.
//
// ctx = { rel, push(node), pushEdge(edge), text }  (rel = "relPath" để build source "rel:line")
// Chưa có module cho grammar nào → bỏ qua (an toàn, output rỗng phần đó).

const loaded = new Map();

async function loadModule(grammar) {
  if (loaded.has(grammar)) return loaded.get(grammar);
  let mod = null;
  try { mod = await import(`./${grammar}.mjs`); }
  catch { mod = null; } // chưa hiện thực grammar này
  loaded.set(grammar, mod);
  return mod;
}

// kind: 'api' | 'ui' | 'deps'
export async function runExtractor(kind, grammar, rootNode, Lang, ctx) {
  const mod = await loadModule(grammar);
  if (mod && typeof mod[kind] === 'function') mod[kind](rootNode, Lang, ctx);
}
