'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { MeshAdapter, resolveServiceType } = require('../src/mesh/node.js');

class FakeSymNode extends EventEmitter {
  constructor(cfg) {
    super();
    this.name = cfg.name;
    this.nodeId = 'fake-' + Math.random().toString(36).slice(2, 10);
    this.cfg = cfg;
    this.started = false;
    this.stopped = false;
    this.remembered = [];
    this._store = new Map();
    this._peers = new Map();
  }
  async start() { this.started = true; }
  async stop() { this.stopped = true; this.started = false; }
  remember(fields, opts = {}) {
    const entry = {
      key: 'cmb-' + this.remembered.length,
      cmb: { fields, createdBy: this.name, lineage: { parents: opts.parents?.map((p) => p.key) || [], ancestors: [] } },
      source: this.name,
    };
    this.remembered.push({ fields, opts, entry });
    this._store.set(entry.key, entry);
    return entry;
  }
  recall() { return Array.from(this._store.values()); }
}

function makeAdapter({ peers = [], storeSeed = [] } = {}) {
  let nodeRef;
  const adapter = new MeshAdapter({
    nodeName: 'test-peer',
    group: 'test-group',
    fieldWeights: { focus: 1, issue: 1, intent: 1, motivation: 1, commitment: 1, perspective: 1, mood: 1 },
    _nodeFactory: (cfg) => {
      const n = new FakeSymNode(cfg);
      for (const p of peers) n._peers.set(p.id, p);
      for (const e of storeSeed) n._store.set(e.key, e);
      nodeRef = n;
      return n;
    },
  });
  return { adapter, getNode: () => nodeRef };
}

test('resolveServiceType: default group maps to _sym._tcp', () => {
  assert.equal(resolveServiceType('default'), '_sym._tcp');
  assert.equal(resolveServiceType(null), '_sym._tcp');
  assert.equal(resolveServiceType('xmesh-dev-demo'), '_xmesh-dev-demo._tcp');
});

test('MeshAdapter: cannot operate before start()', async () => {
  const { adapter } = makeAdapter();
  await assert.rejects(adapter.observe({ fields: { focus: { text: 'x' } } }));
  await assert.rejects(adapter.send({ to: 'other', fields: { focus: { text: 'x' } } }));
  await assert.rejects(adapter.resolveCmb('anything'));
});

test('MeshAdapter: start wires a SymNode and reports identity', async () => {
  const { adapter, getNode } = makeAdapter();
  const id = await adapter.start();
  assert.equal(id.name, 'test-peer');
  assert.equal(id.group, 'test-group');
  assert.equal(id.started, true);
  assert.ok(getNode().started);
  await adapter.stop();
  assert.equal(adapter.identity.started, false);
});

test('MeshAdapter: observe broadcasts with no `to`', async () => {
  const { adapter, getNode } = makeAdapter();
  await adapter.start();
  const result = await adapter.observe({ fields: { focus: { text: 'hello' } } });
  assert.equal(getNode().remembered.length, 1);
  assert.equal(getNode().remembered[0].opts.to, undefined);
  assert.ok(result?.key?.startsWith('cmb-'));
});

test('MeshAdapter: send resolves peer name to peerId and targets it', async () => {
  const { adapter, getNode } = makeAdapter({
    peers: [
      { id: 'peer-id-1', peerId: 'peer-id-1', name: 'reviewer-01' },
      { id: 'peer-id-2', peerId: 'peer-id-2', name: 'writer-01' },
    ],
  });
  await adapter.start();
  await adapter.send({ to: 'reviewer-01', fields: { intent: { text: 'review' } } });
  assert.equal(getNode().remembered[0].opts.to, 'peer-id-1');
});

test('MeshAdapter: send throws on unknown peer', async () => {
  const { adapter } = makeAdapter({ peers: [] });
  await adapter.start();
  await assert.rejects(
    adapter.send({ to: 'ghost', fields: { focus: { text: 'x' } } }),
    /unknown peer: ghost/,
  );
});

test('MeshAdapter: onCmbAccepted fires for peer CMBs only, not own', async () => {
  const { adapter, getNode } = makeAdapter();
  await adapter.start();
  const received = [];
  adapter.onCmbAccepted((cmb) => received.push(cmb));

  getNode().emit('cmb-accepted', {
    key: 'cmb-peer-1',
    source: 'other-peer',
    cmb: { createdBy: 'other-peer', fields: { focus: { text: 'peer wrote this' } }, lineage: { ancestors: [] } },
  });
  getNode().emit('cmb-accepted', {
    key: 'cmb-own-1',
    source: 'test-peer',
    cmb: { createdBy: 'test-peer', fields: { focus: { text: 'own echo' } }, lineage: { ancestors: [] } },
  });

  assert.equal(received.length, 1);
  assert.equal(received[0].source, 'other-peer');
  assert.equal(received[0].id, 'cmb-peer-1');
});

test('MeshAdapter: resolveCmb returns normalized shape', async () => {
  const seed = { key: 'cmb-42', cmb: { fields: { focus: { text: 'seed' } }, createdBy: 'peer', lineage: { parents: [], ancestors: ['cmb-0', 'cmb-1'] } }, source: 'peer' };
  const { adapter, getNode } = makeAdapter({ storeSeed: [seed] });
  await adapter.start();
  const node = getNode();
  node._store.set('cmb-42', seed);
  const out = await adapter.resolveCmb('cmb-42');
  assert.equal(out.id, 'cmb-42');
  assert.deepEqual(out.ancestors, ['cmb-0', 'cmb-1']);
  assert.equal(out.fields.focus.text, 'seed');
});

test('MeshAdapter: onIdentityCollision fires on collision event', async () => {
  const { adapter, getNode } = makeAdapter();
  await adapter.start();
  let got = null;
  adapter.onIdentityCollision((info) => { got = info; });
  getNode().emit('identity-collision', { nodeId: 'x', name: 'test-peer' });
  assert.equal(got.name, 'test-peer');
});

test('MeshAdapter: peers() returns connected peer list', async () => {
  const { adapter } = makeAdapter({
    peers: [
      { id: 'p1', peerId: 'p1', name: 'a' },
      { id: 'p2', peerId: 'p2', name: 'b' },
    ],
  });
  await adapter.start();
  const list = adapter.peers();
  assert.equal(list.length, 2);
  assert.ok(list.find((p) => p.name === 'a'));
});
