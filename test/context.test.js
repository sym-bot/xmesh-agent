'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assembleContext,
  estimateTokens,
  renderFields,
  renderCmb,
  rolePreamble,
  walkLineage,
} = require('../src/core/context.js');

function fakeMesh({ store = new Map(), recallAll = [] } = {}) {
  return {
    resolveCmb: async (id) => store.get(id) || null,
    recall: async () => recallAll.slice(),
  };
}

function cmb({ id, source, fields = {}, ancestors = [] }) {
  return { id, source, fields, ancestors };
}

test('estimateTokens: roughly 4 chars per token', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('a'.repeat(400)), 100);
});

test('renderFields: prints only populated CAT7 fields in canonical order', () => {
  const out = renderFields({
    mood: { text: 'tired' },
    focus: 'cache invalidation',
    unknown: { text: 'ignored' },
  });
  const lines = out.split('\n');
  assert.equal(lines[0].trim(), 'focus: cache invalidation');
  assert.equal(lines[1].trim(), 'mood: tired');
});

test('renderCmb: header + body with label', () => {
  const out = renderCmb(cmb({ id: 'c1', source: 'alice', fields: { focus: 'x' } }), { label: 'ADMITTED' });
  assert.ok(out.startsWith('[ADMITTED] c1 from alice'));
  assert.ok(out.includes('focus: x'));
});

test('rolePreamble: emphasises high-weight fields only', () => {
  const p = rolePreamble({
    name: 'reviewer-01',
    description: 'Engineering reviewer.',
    weights: { focus: 1.0, issue: 2.5, commitment: 2.0, mood: 0.6 },
  });
  assert.ok(p.includes('reviewer-01'));
  assert.ok(p.includes('issue=2.5'));
  assert.ok(p.includes('commitment=2'));
  assert.ok(!p.includes('mood'));
});

test('walkLineage: returns ancestors up to depth limit', async () => {
  const store = new Map([
    ['c1', cmb({ id: 'c1', source: 'a', ancestors: [] })],
    ['c2', cmb({ id: 'c2', source: 'b', ancestors: ['c1'] })],
    ['c3', cmb({ id: 'c3', source: 'c', ancestors: ['c2'] })],
  ]);
  const admitted = cmb({ id: 'c4', source: 'd', ancestors: ['c3'] });
  const resolve = async (id) => store.get(id);
  const walked = await walkLineage(admitted, resolve, 2);
  assert.equal(walked.length, 2);
  assert.equal(walked[0].id, 'c3');
  assert.equal(walked[1].id, 'c2');
});

test('walkLineage: diamond DAG does not re-enqueue visited nodes', async () => {
  const store = new Map([
    ['root', cmb({ id: 'root', source: 'r', ancestors: [] })],
    ['l', cmb({ id: 'l', source: 'x', ancestors: ['root'] })],
    ['r', cmb({ id: 'r', source: 'y', ancestors: ['root'] })],
    ['tip', cmb({ id: 'tip', source: 'z', ancestors: ['l', 'r'] })],
  ]);
  const admitted = cmb({ id: 'top', source: 'me', ancestors: ['tip'] });
  const walked = await walkLineage(admitted, async (id) => store.get(id), 10);
  const ids = walked.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('root'));
});

test('assembleContext: produces systemPrompt + user message with admitted CMB', async () => {
  const mesh = fakeMesh();
  const admittedCmb = cmb({ id: 'inc-1', source: 'writer-01', fields: { focus: { text: 'spec draft' } } });
  const ctx = await assembleContext({
    admittedCmb,
    role: { name: 'reviewer-01', description: 'reviewer', weights: { issue: 2.5 } },
    mesh,
  });
  assert.ok(ctx.systemPrompt.includes('reviewer-01'));
  assert.equal(ctx.messages.length, 1);
  assert.ok(ctx.messages[0].content.includes('inc-1'));
  assert.ok(ctx.messages[0].content.includes('spec draft'));
  assert.ok(ctx.includedSections.includes('admitted'));
  assert.ok(ctx.includedSections.includes('instruction'));
});

test('assembleContext: includes lineage ancestors when present', async () => {
  const store = new Map([['anc-1', cmb({ id: 'anc-1', source: 'alice', fields: { focus: { text: 'ancestor' } }, ancestors: [] })]]);
  const mesh = fakeMesh({ store });
  const admittedCmb = cmb({ id: 'c2', source: 'bob', ancestors: ['anc-1'], fields: { intent: { text: 'review' } } });
  const ctx = await assembleContext({
    admittedCmb,
    role: { name: 'me' },
    mesh,
  });
  assert.ok(ctx.messages[0].content.includes('anc-1'));
  assert.ok(ctx.includedSections.includes('lineage'));
});

test('assembleContext: separates own vs group recent CMBs', async () => {
  const recallAll = [
    cmb({ id: 'o1', source: 'me', fields: { focus: { text: 'own-1' } } }),
    cmb({ id: 'o2', source: 'me', fields: { focus: { text: 'own-2' } } }),
    cmb({ id: 'g1', source: 'peer', fields: { focus: { text: 'group-1' } } }),
  ];
  const mesh = fakeMesh({ recallAll });
  const admittedCmb = cmb({ id: 'trig', source: 'other', fields: { focus: { text: 'trigger' } } });
  const ctx = await assembleContext({
    admittedCmb,
    role: { name: 'me' },
    mesh,
  });
  assert.ok(ctx.includedSections.includes('own-recent'));
  assert.ok(ctx.includedSections.includes('group-recent'));
  assert.ok(ctx.messages[0].content.includes('own-1'));
  assert.ok(ctx.messages[0].content.includes('group-1'));
});

test('assembleContext: excludes admitted CMB from group-recent to avoid double-render', async () => {
  const admittedCmb = cmb({ id: 'dup', source: 'peer', fields: { focus: { text: 'only once' } } });
  const recallAll = [admittedCmb, cmb({ id: 'other', source: 'peer2', fields: { focus: { text: 'different' } } })];
  const mesh = fakeMesh({ recallAll });
  const ctx = await assembleContext({
    admittedCmb,
    role: { name: 'me' },
    mesh,
  });
  const matches = ctx.messages[0].content.match(/dup/g) || [];
  assert.equal(matches.length, 1, 'admitted CMB appears exactly once');
});

test('assembleContext: truncates in drop order when over budget', async () => {
  const bigText = 'x'.repeat(4000);
  const recallAll = [
    cmb({ id: 'o1', source: 'me', fields: { focus: { text: bigText } } }),
    cmb({ id: 'g1', source: 'peer', fields: { focus: { text: bigText } } }),
  ];
  const store = new Map([['anc-1', cmb({ id: 'anc-1', source: 'alice', fields: { focus: { text: bigText } } })]]);
  const mesh = fakeMesh({ recallAll, store });
  const admittedCmb = cmb({ id: 'c2', source: 'bob', fields: { focus: { text: 'short' } }, ancestors: ['anc-1'] });

  const ctx = await assembleContext({
    admittedCmb,
    role: { name: 'me' },
    mesh,
    limits: { maxContextTokens: 500 },
  });
  assert.ok(ctx.includedSections.includes('admitted'));
  assert.ok(ctx.includedSections.includes('preamble'));
  assert.ok(ctx.includedSections.includes('instruction'));
  assert.ok(ctx.droppedSections.length > 0);
  assert.ok(ctx.droppedSections.includes('group-recent') || ctx.droppedSections.includes('own-recent'));
});

test('assembleContext: rejects missing admittedCmb or mesh', async () => {
  await assert.rejects(assembleContext({ mesh: fakeMesh() }));
  await assert.rejects(assembleContext({ admittedCmb: cmb({ id: 'x', source: 'y' }) }));
});
