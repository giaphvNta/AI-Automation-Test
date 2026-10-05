// Extractor grammar `vue` — Component graph từ <template> của Vue SFC.
// Component = file .vue; renders = child component tag; navigates = <router-link to="/..."> / href.
// ⚠️ <script> của Vue là raw_text (grammar không parse JS) → chỉ dùng template.
// ⚠️ CHỈ trích cấu trúc UI. KHÔNG trích expected value.
import { basename } from 'node:path';
import { kebab, lineOf } from './util.mjs';

const VUE_BUILTIN = new Set(['router-link', 'router-view', 'keep-alive', 'transition',
  'transition-group', 'component', 'slot', 'template', 'teleport', 'suspense']);
const HTML_TAGS = new Set(['div', 'span', 'a', 'p', 'ul', 'ol', 'li', 'button', 'input', 'form',
  'label', 'select', 'option', 'textarea', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'nav', 'header', 'footer', 'main', 'section', 'article',
  'aside', 'i', 'b', 'strong', 'em', 'small', 'br', 'hr', 'pre', 'code', 'svg', 'path', 'g',
  'video', 'audio', 'canvas', 'iframe', 'style', 'script']);

function isComponentTag(name) {
  const lower = name.toLowerCase();
  if (VUE_BUILTIN.has(lower) || HTML_TAGS.has(lower)) return false;
  if (/^[A-Z]/.test(name)) return true;      // PascalCase
  if (name.includes('-')) return true;       // custom kebab
  return false;
}

export function ui(rootNode, Lang, ctx) {
  const compName = basename(ctx.rel).replace(/\.vue$/, '');
  const compId = `comp-${kebab(compName)}`;
  ctx.push({ id: compId, type: 'Component', name: compName, lang: 'vue', source: `${ctx.rel}:1` });

  // 1) child component tags → renders
  const tagQ = Lang.query(`[(start_tag (tag_name) @t) (self_closing_tag (tag_name) @t)]`);
  const seenChild = new Set();
  for (const m of tagQ.matches(rootNode)) {
    const node = m.captures[0].node;
    const name = ctx.text.slice(node.startIndex, node.endIndex);
    if (!isComponentTag(name)) continue;
    const childId = `comp-${kebab(name)}`;
    if (seenChild.has(childId)) continue;   // 1 cặp renders/lần (dòng đầu xuất hiện)
    seenChild.add(childId);
    ctx.pushEdge({ from: compId, to: childId, type: 'renders', source: `${ctx.rel}:${lineOf(node)}` });
  }

  // 2) navigation: attribute `to`/`href` với path bắt đầu bằng "/"
  const attrQ = Lang.query(`(attribute (attribute_name) @an (quoted_attribute_value (attribute_value) @av))`);
  for (const m of attrQ.matches(rootNode)) {
    const c = Object.fromEntries(m.captures.map((x) => [x.name, x.node]));
    const an = ctx.text.slice(c.an.startIndex, c.an.endIndex).toLowerCase();
    if (an !== 'to' && an !== 'href') continue;
    const path = ctx.text.slice(c.av.startIndex, c.av.endIndex);
    if (!path.startsWith('/')) continue;
    ctx.pushEdge({ from: compId, to: `route-${kebab(path) || 'root'}`, type: 'navigates', source: `${ctx.rel}:${lineOf(c.av)}` });
  }
}
