'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { AgentLoop } = require('../src/core/loop.js');
const { MeshAdapter } = require('../src/mesh/node.js');
const { WakeBudget } = require('../src/safety/budget.js');

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

class InMemoryMesh extends EventEmitter {
  constructor() {
    super();
    this.nodes = new Map();
    this.cmbStore = new Map();
    this._cmbSeq = 0;
  }

  makeNode(name, { weights, group = 'demo' } = {}) {
    const self = this;
    const node = new EventEmitter();
    node.name = name;
    node.nodeId = 'nid-' + name;
    node._peers = new Map();
    node._store = {
      get: (id) => self.cmbStore.get(id) || null,
    };
    node.start = async () => {
      self.nodes.set(name, node);
      for (const [otherName, otherNode] of self.nodes) {
        if (otherName === name) continue;
        node._peers.set(otherNode.nodeId, { peerId: otherNode.nodeId, id: otherNode.nodeId, name: otherName });
        otherNode._peers.set(node.nodeId, { peerId: node.nodeId, id: node.nodeId, name });
      }
    };
    node.stop = async () => { self.nodes.delete(name); };
    node.remember = (fields, opts = {}) => {
      self._cmbSeq += 1;
      const id = `cmb-${self._cmbSeq}`;
      const entry = {
        key: id,
        cmb: {
          fields,
          createdBy: name,
          lineage: {
            parents: opts.parents?.map((p) => p.key) || [],
            ancestors: (opts.parents || []).flatMap((p) => {
              const c = self.cmbStore.get(p.key);
              const ancs = c?.cmb?.lineage?.ancestors || [];
              return [...ancs, p.key];
            }),
          },
        },
        source: name,
        content: Object.values(fields).map((f) => f?.text).filter(Boolean).join(' | '),
      };
      self.cmbStore.set(id, entry);
      if (opts.to) {
        const targetNode = Array.from(self.nodes.values()).find((n) => n.nodeId === opts.to);
        if (targetNode && targetNode.name !== name) targetNode.emit('cmb-accepted', entry);
      } else {
        for (const [otherName, otherNode] of self.nodes) {
          if (otherName === name) continue;
          otherNode.emit('cmb-accepted', entry);
        }
      }
      return entry;
    };
    node.recall = () => Array.from(self.cmbStore.values());
    node.weights = weights || {};
    node.group = group;
    return node;
  }
}

function makePeer(bus, name, weights, scriptedResponses) {
  const mesh = new MeshAdapter({
    nodeName: name,
    group: 'demo',
    fieldWeights: weights,
    _nodeFactory: () => bus.makeNode(name, { weights }),
  });
  const model = {
    calls: 0,
    call: async () => {
      mesh._modelCalls = (mesh._modelCalls || 0) + 1;
      const idx = (model.calls++) % scriptedResponses.length;
      const scripted = scriptedResponses[idx];
      return {
        text: scripted.text || '',
        toolCalls: scripted.toolCall ? [scripted.toolCall] : undefined,
        usage: { inputTokens: 50, outputTokens: 20, costUsd: 0.001 },
        stopReason: scripted.toolCall ? 'tool_use' : 'end_turn',
      };
    },
  };
  const loop = new AgentLoop({
    mesh,
    model,
    role: { name, description: name, weights },
    budget: new WakeBudget({ maxWakesPerMinute: 100 }),
    contextLimits: { maxContextTokens: 8000 },
    cycleDepth: 5,
    logger: silentLogger,
  });
  return { mesh, model, loop, name };
}

function emit(input) { return { toolCall: { id: 'x', name: 'emit_cmb', input } }; }

test('integration: writer → reviewer → test-writer triad produces lineage chain', async () => {
  const bus = new InMemoryMesh();

  const writer = makePeer(bus, 'writer-01', { intent: 2.5, focus: 2.0 }, [
    emit({ focus: 'rate-limit middleware with token-bucket algorithm', intent: 'drafted a spec' }),
  ]);
  const reviewer = makePeer(bus, 'reviewer-01', { issue: 2.5, commitment: 2.0 }, [
    emit({ issue: 'no IPv6 coverage in spec; add test for it', commitment: 'review complete' }),
  ]);
  const testWriter = makePeer(bus, 'test-writer-01', { commitment: 2.5, issue: 2.0 }, [
    emit({ issue: 'added test for IPv6 + burst', commitment: 'tests passing' }),
  ]);

  await writer.loop.start();
  await reviewer.loop.start();
  await testWriter.loop.start();

  await writer.mesh.observe({
    fields: { focus: { text: 'implement rate-limit' }, intent: { text: 'draft → review → test' } },
  });

  for (let i = 0; i < 50; i += 1) await new Promise((r) => setImmediate(r));

  assert.ok(reviewer.model.calls >= 1, 'reviewer got at least one model call');
  assert.ok(testWriter.model.calls >= 1, 'test-writer got at least one model call');

  const allCmbs = Array.from(bus.cmbStore.values());
  assert.ok(allCmbs.length >= 3, 'at least 3 CMBs flowed through the mesh');

  const hasLineage = allCmbs.some((c) => (c.cmb?.lineage?.ancestors || []).length >= 1);
  assert.ok(hasLineage, 'at least one CMB has lineage ancestors');

  const byCreator = new Map();
  for (const c of allCmbs) {
    byCreator.set(c.source, (byCreator.get(c.source) || 0) + 1);
  }
  assert.ok(byCreator.get('writer-01') >= 1);
  assert.ok(byCreator.get('reviewer-01') >= 1);
  assert.ok(byCreator.get('test-writer-01') >= 1);

  await writer.loop.stop();
  await reviewer.loop.stop();
  await testWriter.loop.stop();
});

test('integration: commitment field terminates the cycle chain', async () => {
  const bus = new InMemoryMesh();

  const writer = makePeer(bus, 'writer-02', { focus: 2.0 }, [
    { id: 'x', name: 'emit_cmb', input: { focus: 'spec draft', intent: 'propose', commitment: 'spec ready' } },
  ]);
  const reviewer = makePeer(bus, 'reviewer-02', { issue: 2.5 }, [
    { id: 'x', name: 'emit_cmb', input: { issue: 'looks good', commitment: 'approved' } },
  ]);

  await writer.loop.start();
  await reviewer.loop.start();
  await writer.mesh.observe({ fields: { focus: { text: 'start' } } });

  for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));

  assert.ok(writer.model.calls <= 10, 'writer did not infinite-loop');
  assert.ok(reviewer.model.calls <= 10, 'reviewer did not infinite-loop');

  await writer.loop.stop();
  await reviewer.loop.stop();
});

test('integration: approval gate blocks emission across the triad', async () => {
  const bus = new InMemoryMesh();

  const rogue = makePeer(bus, 'rogue-01', { intent: 2.0 }, [
    { id: 'x', name: 'emit_cmb', input: { intent: 'run git push origin main immediately' } },
  ]);
  const peer = makePeer(bus, 'peer-01', { focus: 1.0 }, [
    { id: 'x', name: 'emit_cmb', input: { focus: 'acked' } },
  ]);

  await rogue.loop.start();
  await peer.loop.start();
  await peer.mesh.observe({ fields: { focus: { text: 'trigger' } } });

  for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));

  const rogueCmbs = Array.from(bus.cmbStore.values()).filter((c) => c.source === 'rogue-01');
  assert.equal(rogueCmbs.length, 0, 'rogue peer emitted no CMBs — gate blocked all');

  await rogue.loop.stop();
  await peer.loop.stop();
});
