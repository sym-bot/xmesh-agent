'use strict';

const CAT7_FIELDS = Object.freeze([
  'focus', 'issue', 'intent', 'motivation', 'commitment', 'perspective', 'mood',
]);

const DEFAULT_LIMITS = Object.freeze({
  kLineage: 3,
  nOwn: 5,
  nGroup: 10,
  maxContextTokens: 8000,
});

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function renderFields(fields) {
  if (!fields) return '';
  const out = [];
  for (const f of CAT7_FIELDS) {
    const v = fields[f];
    if (!v) continue;
    const text = typeof v === 'string' ? v : v.text;
    if (!text) continue;
    out.push(`  ${f}: ${text}`);
  }
  return out.join('\n');
}

function renderCmb(cmb, { label } = {}) {
  if (!cmb) return '';
  const header = label
    ? `[${label}] ${cmb.id || '?'} from ${cmb.source || '?'}`
    : `${cmb.id || '?'} from ${cmb.source || '?'}`;
  const body = renderFields(cmb.fields);
  return body ? `${header}\n${body}` : header;
}

function rolePreamble(role) {
  if (!role) return '';
  const lines = [`You are peer "${role.name || 'unnamed'}" on the xmesh mesh.`];
  if (role.description) lines.push(role.description);
  if (role.weights) {
    const summary = Object.entries(role.weights)
      .filter(([, w]) => w >= 1.5)
      .map(([f, w]) => `${f}=${w}`)
      .join(', ');
    if (summary) lines.push(`SVAF field priorities: ${summary}.`);
  }
  lines.push('Respond by emitting a CAT7 CMB. Populate fields that serve your role; leave irrelevant fields empty.');
  return lines.join('\n');
}

async function walkLineage(admitted, resolve, depth) {
  const seen = new Set();
  const ordered = [];
  const queue = (admitted.ancestors || []).map((id) => ({ id, d: 1 }));
  while (queue.length > 0) {
    const { id, d } = queue.shift();
    if (d > depth) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const cmb = await resolve(id);
    if (!cmb) continue;
    ordered.push({ cmb, depth: d });
    if (Array.isArray(cmb.ancestors)) {
      for (const parent of cmb.ancestors) queue.push({ id: parent, d: d + 1 });
    }
  }
  ordered.sort((a, b) => a.depth - b.depth);
  return ordered.map(({ cmb }) => cmb);
}

async function assembleContext({ admittedCmb, role, mesh, limits = {} }) {
  if (!admittedCmb) throw new Error('assembleContext: admittedCmb required');
  if (!mesh) throw new Error('assembleContext: mesh adapter required');
  const L = { ...DEFAULT_LIMITS, ...limits };

  const preamble = rolePreamble(role);
  const admittedRender = renderCmb(admittedCmb, { label: 'ADMITTED' });
  const lineageCmbs = await walkLineage(admittedCmb, (id) => mesh.resolveCmb(id), L.kLineage);
  const recentAll = await mesh.recall('');
  const selfName = role?.name;

  const ownRecent = recentAll
    .filter((c) => c.source === selfName)
    .slice(0, L.nOwn);
  const groupRecent = recentAll
    .filter((c) => c.source !== selfName && c.id !== admittedCmb.id)
    .slice(0, L.nGroup);

  const sections = [];
  sections.push({ name: 'preamble', droppable: false, text: preamble });
  sections.push({ name: 'admitted', droppable: false, text: admittedRender });

  if (lineageCmbs.length > 0) {
    sections.push({
      name: 'lineage',
      droppable: true,
      text: ['[LINEAGE ANCESTORS]', ...lineageCmbs.map((c) => renderCmb(c))].join('\n\n'),
    });
  }
  if (ownRecent.length > 0) {
    sections.push({
      name: 'own-recent',
      droppable: true,
      text: ['[OWN RECENT CMBs]', ...ownRecent.map((c) => renderCmb(c))].join('\n\n'),
    });
  }
  if (groupRecent.length > 0) {
    sections.push({
      name: 'group-recent',
      droppable: true,
      text: ['[GROUP RECENT CMBs]', ...groupRecent.map((c) => renderCmb(c))].join('\n\n'),
    });
  }

  sections.push({
    name: 'instruction',
    droppable: false,
    text: 'Respond with a CAT7 CMB. Populate fields that serve your role. Leave irrelevant fields empty.',
  });

  const truncated = _truncate(sections, L.maxContextTokens);
  const systemPrompt = truncated.find((s) => s.name === 'preamble')?.text || '';
  const userContent = truncated
    .filter((s) => s.name !== 'preamble')
    .map((s) => s.text)
    .join('\n\n---\n\n');

  return {
    systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    estimatedTokens: truncated.reduce((sum, s) => sum + estimateTokens(s.text), 0),
    droppedSections: sections.filter((s) => !truncated.includes(s)).map((s) => s.name),
    includedSections: truncated.map((s) => s.name),
  };
}

const DROP_ORDER = ['group-recent', 'own-recent', 'lineage'];

function _truncate(sections, maxTokens) {
  const kept = [...sections];
  let total = kept.reduce((s, x) => s + estimateTokens(x.text), 0);
  for (const dropName of DROP_ORDER) {
    if (total <= maxTokens) break;
    const idx = kept.findIndex((s) => s.name === dropName);
    if (idx === -1) continue;
    total -= estimateTokens(kept[idx].text);
    kept.splice(idx, 1);
  }
  return kept;
}

module.exports = {
  assembleContext,
  estimateTokens,
  renderFields,
  renderCmb,
  rolePreamble,
  walkLineage,
  DEFAULT_LIMITS,
  CAT7_FIELDS,
};
