'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentLoop, EMIT_CMB_TOOL, mapPendingToCmbFields } = require('../src/core/loop.js');
const { WakeBudget } = require('../src/safety/budget.js');

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function fakeMesh({ peers = [], storeSeed = new Map() } = {}) {
  const listeners = { cmb: null, col: null };
  const emitted = [];
  const store = new Map(storeSeed);
  let started = false;
  return {
    identity: { name: 'me' },
    emitted,
    store,
    triggerCmb: (c) => listeners.cmb?.(c),
    triggerCollision: (i) => listeners.col?.(i),
    start: async () => { started = true; },
    stop: async () => { started = false; },
    onCmbAccepted: (h) => { listeners.cmb = h; },
    onIdentityCollision: (h) => { listeners.col = h; },
    peers: () => peers,
    resolveCmb: async (id) => store.get(id) || null,
    recall: async () => Array.from(store.values()),
    observe: async ({ fields, parents }) => { emitted.push({ kind: 'observe', fields, parents }); return { key: 'e-' + emitted.length }; },
    send: async ({ to, fields, parents }) => { emitted.push({ kind: 'send', to, fields, parents }); return { key: 'e-' + emitted.length }; },
    get started() { return started; },
  };
}

function fakeModel({ toolCall, text = '', cost = 0.001, inTok = 100, outTok = 50 } = {}) {
  const calls = [];
  const adapter = {
    calls,
    call: async (params) => {
      calls.push(params);
      const response = {
        text,
        usage: { inputTokens: inTok, outputTokens: outTok, costUsd: cost },
        stopReason: toolCall ? 'tool_use' : 'end_turn',
      };
      if (toolCall) response.toolCalls = [toolCall];
      return response;
    },
  };
  return adapter;
}

function cmb({ id, source, fields = {}, ancestors = [] }) {
  return { id, source, fields, ancestors };
}

function makeLoop(overrides = {}) {
  const mesh = overrides.mesh || fakeMesh();
  const model = overrides.model || fakeModel();
  const role = overrides.role || { name: 'reviewer-01', description: 'reviewer', weights: { issue: 2.5 } };
  const loop = new AgentLoop({
    mesh,
    model,
    role,
    budget: overrides.budget,
    contextLimits: { maxContextTokens: 8000 },
    cycleDepth: overrides.cycleDepth ?? 5,
    gatePatterns: overrides.gatePatterns,
    logger: silentLogger,
  });
  return { loop, mesh, model };
}

test('AgentLoop: constructor guards required inputs', () => {
  assert.throws(() => new AgentLoop({ model: fakeModel(), role: { name: 'r' } }));
  assert.throws(() => new AgentLoop({ mesh: fakeMesh(), role: { name: 'r' } }));
  assert.throws(() => new AgentLoop({ mesh: fakeMesh(), model: fakeModel() }));
});

test('AgentLoop: start wires mesh handlers and starts the node', async () => {
  const { loop, mesh } = makeLoop();
  await loop.start();
  assert.equal(mesh.started, true);
  assert.equal(loop.stats.running, true);
  await loop.stop();
  assert.equal(mesh.started, false);
});

test('AgentLoop: emits a CMB via observe when peer unreachable', async () => {
  const toolCall = { id: 't1', name: 'emit_cmb', input: { issue: 'missing test' } };
  const { loop, mesh, model } = makeLoop({
    model: fakeModel({ toolCall }),
    mesh: fakeMesh({ peers: [] }),
  });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'a1', source: 'writer-01', fields: { focus: { text: 'spec' } } }));
  assert.equal(model.calls.length, 1);
  assert.equal(mesh.emitted.length, 1);
  assert.equal(mesh.emitted[0].kind, 'observe');
  assert.equal(mesh.emitted[0].fields.issue.text, 'missing test');
  assert.equal(loop.stats.cmbsEmitted, 1);
});

test('AgentLoop: emits via send when originator is a connected peer', async () => {
  const toolCall = { id: 't1', name: 'emit_cmb', input: { issue: 'x' } };
  const { loop, mesh } = makeLoop({
    model: fakeModel({ toolCall }),
    mesh: fakeMesh({ peers: [{ id: 'p1', name: 'writer-01' }] }),
  });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'a1', source: 'writer-01' }));
  assert.equal(mesh.emitted[0].kind, 'send');
  assert.equal(mesh.emitted[0].to, 'writer-01');
});

test('AgentLoop: suppresses emission when model returns no tool_use', async () => {
  const { loop, mesh } = makeLoop({ model: fakeModel({ text: 'no tool call' }) });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'a1', source: 'x' }));
  assert.equal(mesh.emitted.length, 0);
  assert.equal(loop.stats.cmbsEmitted, 0);
});

test('AgentLoop: suppresses empty-fields CMB', async () => {
  const toolCall = { id: 't1', name: 'emit_cmb', input: {} };
  const { loop, mesh } = makeLoop({ model: fakeModel({ toolCall }) });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'a1', source: 'x' }));
  assert.equal(mesh.emitted.length, 0);
  assert.equal(loop.stats.cmbsSuppressed, 1);
});

test('AgentLoop: blocks at wake-budget exhaustion', async () => {
  const toolCall = { id: 't1', name: 'emit_cmb', input: { issue: 'x' } };
  const { loop, mesh } = makeLoop({
    model: fakeModel({ toolCall }),
    budget: new WakeBudget({ maxWakesPerMinute: 2 }),
  });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'a1', source: 'x' }));
  await loop._handleAdmission(cmb({ id: 'a2', source: 'x' }));
  await loop._handleAdmission(cmb({ id: 'a3', source: 'x' }));
  assert.equal(mesh.emitted.length, 2);
});

test('AgentLoop: cycle detection suppresses self-ancestor loop', async () => {
  const toolCall = { id: 't1', name: 'emit_cmb', input: { issue: 'reply' } };
  const seedStore = new Map([
    ['mine-1', cmb({ id: 'mine-1', source: 'reviewer-01', ancestors: [] })],
    ['peer-1', cmb({ id: 'peer-1', source: 'writer-01', ancestors: ['mine-1'] })],
  ]);
  const { loop, mesh } = makeLoop({
    model: fakeModel({ toolCall }),
    mesh: fakeMesh({ storeSeed: seedStore }),
  });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'peer-1', source: 'writer-01', ancestors: ['mine-1'] }));
  assert.equal(mesh.emitted.length, 0);
  assert.equal(loop.stats.cmbsSuppressed, 1);
});

test('AgentLoop: approval gate blocks intent: git push', async () => {
  const toolCall = { id: 't1', name: 'emit_cmb', input: { intent: 'run git push origin main' } };
  const { loop, mesh } = makeLoop({ model: fakeModel({ toolCall }) });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'a1', source: 'x' }));
  assert.equal(mesh.emitted.length, 0);
  assert.equal(loop.stats.cmbsSuppressed, 1);
});

test('AgentLoop: accumulates cost across calls', async () => {
  const toolCall = { id: 't1', name: 'emit_cmb', input: { issue: 'x' } };
  const { loop } = makeLoop({ model: fakeModel({ toolCall, cost: 0.005 }) });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'a1', source: 'x' }));
  await loop._handleAdmission(cmb({ id: 'a2', source: 'x' }));
  assert.ok(Math.abs(loop.stats.costUsdTotal - 0.010) < 1e-9);
});

test('AgentLoop: forwards EMIT_CMB_TOOL to the model', async () => {
  const toolCall = { id: 't1', name: 'emit_cmb', input: { issue: 'y' } };
  const { loop, model } = makeLoop({ model: fakeModel({ toolCall }) });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'a1', source: 'x' }));
  const tools = model.calls[0].tools;
  assert.ok(Array.isArray(tools));
  assert.equal(tools[0].name, 'emit_cmb');
});

test('mapPendingToCmbFields: only maps populated CAT7 fields', () => {
  const out = mapPendingToCmbFields({ focus: 'x', mood: '  ', unknown: 'skip' });
  assert.ok(out.focus);
  assert.equal(out.mood, undefined);
  assert.equal(out.unknown, undefined);
});

test('EMIT_CMB_TOOL: schema has all CAT7 fields', () => {
  const keys = Object.keys(EMIT_CMB_TOOL.input_schema.properties);
  assert.deepEqual(
    keys.sort(),
    ['commitment', 'focus', 'intent', 'issue', 'mood', 'motivation', 'perspective'],
  );
});

test('AgentLoop: identity-collision stops running flag', async () => {
  const { loop, mesh } = makeLoop();
  await loop.start();
  mesh.triggerCollision({ nodeId: 'x', name: 'me' });
  assert.equal(loop.stats.running, false);
});

test('AgentLoop: cmb-accepted from mesh triggers handler and emits', async () => {
  const toolCall = { id: 't1', name: 'emit_cmb', input: { issue: 'from-handler' } };
  const { loop, mesh } = makeLoop({ model: fakeModel({ toolCall }) });
  await loop.start();
  mesh.triggerCmb(cmb({ id: 'a1', source: 'x' }));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(mesh.emitted.length, 1);
});
