'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectCycle } = require('../src/safety/cycle.js');

function buildStore(cmbs) {
  const byId = new Map(cmbs.map((c) => [c.id, c]));
  return (id) => byId.get(id);
}

test('detectCycle: clean chain without self-ancestor', () => {
  const resolve = buildStore([
    { id: 'a1', createdBy: 'peer-a', ancestors: [] },
    { id: 'b1', createdBy: 'peer-b', ancestors: ['a1'] },
  ]);
  const r = detectCycle({
    proposed: { ancestors: ['b1'], fields: {} },
    resolveAncestors: resolve,
    selfName: 'peer-c',
  });
  assert.equal(r.suspect, false);
  assert.equal(r.reason, 'clean');
});

test('detectCycle: suspects when own CMB appears in ancestor chain', () => {
  const resolve = buildStore([
    { id: 'mine1', createdBy: 'me', ancestors: [] },
    { id: 'other1', createdBy: 'peer', ancestors: ['mine1'] },
  ]);
  const r = detectCycle({
    proposed: { ancestors: ['other1'], fields: {} },
    resolveAncestors: resolve,
    selfName: 'me',
  });
  assert.equal(r.suspect, true);
  assert.equal(r.reason, 'self-ancestor');
  assert.equal(r.hitId, 'mine1');
  assert.equal(r.hitDepth, 2);
});

test('detectCycle: commitment exception bypasses check', () => {
  const resolve = buildStore([
    { id: 'mine1', createdBy: 'me', ancestors: [] },
  ]);
  const r = detectCycle({
    proposed: { ancestors: ['mine1'], fields: { commitment: { text: 'done' } } },
    resolveAncestors: resolve,
    selfName: 'me',
  });
  assert.equal(r.suspect, false);
  assert.equal(r.reason, 'commitment-exception');
});

test('detectCycle: respects depth limit', () => {
  const resolve = buildStore([
    { id: 'mine1', createdBy: 'me', ancestors: [] },
    { id: 'p1', createdBy: 'x', ancestors: ['mine1'] },
    { id: 'p2', createdBy: 'x', ancestors: ['p1'] },
    { id: 'p3', createdBy: 'x', ancestors: ['p2'] },
    { id: 'p4', createdBy: 'x', ancestors: ['p3'] },
    { id: 'p5', createdBy: 'x', ancestors: ['p4'] },
    { id: 'p6', createdBy: 'x', ancestors: ['p5'] },
  ]);
  const shallow = detectCycle({
    proposed: { ancestors: ['p6'], fields: {} },
    resolveAncestors: resolve,
    selfName: 'me',
    depth: 3,
  });
  assert.equal(shallow.suspect, false);
  const deep = detectCycle({
    proposed: { ancestors: ['p6'], fields: {} },
    resolveAncestors: resolve,
    selfName: 'me',
    depth: 10,
  });
  assert.equal(deep.suspect, true);
});

test('detectCycle: no ancestors means clean', () => {
  const resolve = buildStore([]);
  const r = detectCycle({
    proposed: { ancestors: [], fields: {} },
    resolveAncestors: resolve,
    selfName: 'me',
  });
  assert.equal(r.suspect, false);
  assert.equal(r.reason, 'no-ancestors');
});

test('detectCycle: handles diamond DAG without infinite loop', () => {
  const resolve = buildStore([
    { id: 'root', createdBy: 'me', ancestors: [] },
    { id: 'l', createdBy: 'x', ancestors: ['root'] },
    { id: 'r', createdBy: 'x', ancestors: ['root'] },
    { id: 'tip', createdBy: 'x', ancestors: ['l', 'r'] },
  ]);
  const result = detectCycle({
    proposed: { ancestors: ['tip'], fields: {} },
    resolveAncestors: resolve,
    selfName: 'me',
  });
  assert.equal(result.suspect, true);
  assert.equal(result.hitId, 'root');
});

test('detectCycle: missing ancestor lookup is treated as clean edge', () => {
  const resolve = () => null;
  const r = detectCycle({
    proposed: { ancestors: ['ghost'], fields: {} },
    resolveAncestors: resolve,
    selfName: 'me',
  });
  assert.equal(r.suspect, false);
  assert.equal(r.reason, 'clean');
});
