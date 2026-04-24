'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkGates } = require('../src/safety/gates.js');

test('checkGates: passes clean CMB', () => {
  const r = checkGates({ fields: { focus: { text: 'refactor the cache key' } } });
  assert.equal(r.passed, true);
  assert.deepEqual(r.hits, []);
});

test('checkGates: blocks git push in intent', () => {
  const r = checkGates({ fields: { intent: { text: 'run git push origin main' } } });
  assert.equal(r.passed, false);
  assert.ok(r.hits.some((h) => h.field === 'intent'));
});

test('checkGates: blocks .env in commitment', () => {
  const r = checkGates({ fields: { commitment: { text: 'update .env with new token' } } });
  assert.equal(r.passed, false);
  assert.ok(r.hits.some((h) => h.field === 'commitment'));
});

test('checkGates: blocks multiple patterns', () => {
  const r = checkGates({
    fields: {
      intent: { text: 'deploy and publish to prod' },
      commitment: { text: 'rotate secrets' },
    },
  });
  assert.equal(r.passed, false);
  assert.ok(r.hits.length >= 2);
});

test('checkGates: empty fields pass', () => {
  const r = checkGates({ fields: {} });
  assert.equal(r.passed, true);
});

test('checkGates: missing cmb is treated as passing (no-op)', () => {
  const r = checkGates(null);
  assert.equal(r.passed, true);
});
