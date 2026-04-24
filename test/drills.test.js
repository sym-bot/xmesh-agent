'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { AgentLoop } = require('../src/core/loop.js');
const { MeshAdapter } = require('../src/mesh/node.js');
const { WakeBudget } = require('../src/safety/budget.js');

const silent = { info: () => {}, warn: () => {}, error: () => {} };
const collectingLogger = () => {
  const events = [];
  return {
    events,
    info: (e, d) => events.push({ lvl: 'info', e, d }),
    warn: (e, d) => events.push({ lvl: 'warn', e, d }),
    error: (e, d) => events.push({ lvl: 'error', e, d }),
  };
};

function cmb({ id, source, fields = {}, ancestors = [] }) {
  return { id, source, fields, ancestors };
}

function makeMesh({ peers = [], store = new Map() } = {}) {
  const listeners = { cmb: null, col: null };
  const emitted = [];
  let started = false;
  return {
    identity: { name: 'drill-peer' },
    emitted,
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

function makeModel({ toolInput = { focus: 'ack' }, cost = 0.01 } = {}) {
  const m = {
    calls: 0,
    call: async () => {
      m.calls += 1;
      return {
        text: '',
        toolCalls: [{ id: 'x', name: 'emit_cmb', input: toolInput }],
        usage: { inputTokens: 1000, outputTokens: 500, costUsd: cost },
        stopReason: 'tool_use',
      };
    },
  };
  return m;
}

function makeLoop({ mesh, model, budget, logger, role = { name: 'drill-peer' }, cycleDepth = 5 } = {}) {
  return new AgentLoop({
    mesh: mesh || makeMesh(),
    model: model || makeModel(),
    role,
    budget,
    contextLimits: { maxContextTokens: 8000 },
    cycleDepth,
    logger: logger || silent,
  });
}

test('drill 1 — budget-exhaust: auto-stops before burst cap allows infinite burn', async () => {
  const logger = collectingLogger();
  const mesh = makeMesh();
  const budget = new WakeBudget({ maxWakesPerMinute: 3 });
  const loop = makeLoop({ mesh, budget, logger });
  await loop.start();
  for (let i = 0; i < 10; i += 1) {
    await loop._handleAdmission(cmb({ id: 'a' + i, source: 'peer' }));
  }
  assert.equal(loop.stats.cmbsEmitted, 3);
  const blocked = logger.events.filter((e) => e.e === 'wake-budget-exceeded');
  assert.ok(blocked.length >= 1, 'budget-exceeded was logged');
  await loop.stop();
});

test('drill 2 — cycle-attack: two-peer naive mirror cannot loop past depth', async () => {
  const store = new Map();
  const mesh = makeMesh({ store });
  const logger = collectingLogger();
  const loop = makeLoop({ mesh, logger, role: { name: 'me' } });
  await loop.start();

  store.set('mine-1', { id: 'mine-1', source: 'me', ancestors: [] });
  store.set('peer-1', { id: 'peer-1', source: 'peer', ancestors: ['mine-1'] });

  const admitted = cmb({ id: 'peer-1', source: 'peer', ancestors: ['mine-1'] });
  await loop._handleAdmission(admitted);
  assert.equal(loop.stats.cmbsEmitted, 0);
  assert.equal(loop.stats.cmbsSuppressed, 1);
  assert.ok(logger.events.some((e) => e.e === 'cycle-suspect'));
  await loop.stop();
});

test('drill 3 — malformed CMB: empty fields + missing ancestors are skipped cleanly', async () => {
  const logger = collectingLogger();
  const loop = makeLoop({ logger });
  await loop.start();

  await loop._handleAdmission(cmb({ id: 'mal-1', source: 'peer', fields: null, ancestors: null }));
  await loop._handleAdmission(cmb({ id: 'mal-2', source: 'peer' }));
  await loop._handleAdmission({});

  assert.ok(loop.stats.running, 'loop did not crash on malformed CMBs');
  await loop.stop();
});

test('drill 4 — network-partition: observe after peer-list empty falls back to broadcast', async () => {
  const mesh = makeMesh({ peers: [] });
  const loop = makeLoop({ mesh });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'part-1', source: 'offline-peer' }));
  assert.equal(mesh.emitted.length, 1);
  assert.equal(mesh.emitted[0].kind, 'observe');
  await loop.stop();
});

test('drill 5 — identity-collision: loop stops accepting work', async () => {
  const mesh = makeMesh();
  const logger = collectingLogger();
  const loop = makeLoop({ mesh, logger });
  await loop.start();
  assert.equal(loop.stats.running, true);
  mesh.triggerCollision({ nodeId: 'x', name: 'drill-peer' });
  assert.equal(loop.stats.running, false);
  await loop._handleAdmission(cmb({ id: 'post-col-1', source: 'peer' }));
  assert.equal(loop.stats.cmbsEmitted, 0);
  assert.ok(logger.events.some((e) => e.e === 'identity-collision'));
});

test('drill 6 — approval-gate: dangerous intent blocked and logged', async () => {
  const logger = collectingLogger();
  const mesh = makeMesh();
  const model = makeModel({ toolInput: { intent: 'git push origin main to deploy the fix' } });
  const loop = makeLoop({ mesh, model, logger });
  await loop.start();
  await loop._handleAdmission(cmb({ id: 'danger-1', source: 'peer' }));
  assert.equal(mesh.emitted.length, 0);
  assert.equal(loop.stats.cmbsSuppressed, 1);
  assert.ok(logger.events.some((e) => e.e === 'approval-gate-blocked'));
  await loop.stop();
});

test('drill 7 — stress: 1000 admissions bounded by wake-budget + cost cap in practice', async () => {
  const mesh = makeMesh();
  const budget = new WakeBudget({ maxWakesPerMinute: 1000, maxWakesPerHour: 50 });
  const loop = makeLoop({ mesh, budget });
  await loop.start();
  for (let i = 0; i < 1000; i += 1) {
    await loop._handleAdmission(cmb({ id: 's' + i, source: 'peer' }));
  }
  assert.ok(loop.stats.cmbsEmitted <= 50, 'hourly cap enforced');
  await loop.stop();
});
