'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { WakeBudget } = require('../src/safety/budget.js');

function clock() {
  const c = { t: 1_700_000_000_000 };
  c.now = () => c.t;
  c.advance = (ms) => { c.t += ms; };
  return c;
}

test('WakeBudget: allows first wake within all limits', () => {
  const c = clock();
  const b = new WakeBudget({}, c.now);
  const r = b.tryConsume();
  assert.equal(r.allowed, true);
  assert.equal(r.warn, null);
  assert.deepEqual(r.counts, { minute: 1, hour: 1, day: 1 });
});

test('WakeBudget: blocks at per-minute burst cap', () => {
  const c = clock();
  const b = new WakeBudget({ maxWakesPerMinute: 3 }, c.now);
  assert.equal(b.tryConsume().allowed, true);
  assert.equal(b.tryConsume().allowed, true);
  assert.equal(b.tryConsume().allowed, true);
  const blocked = b.tryConsume();
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'burst');
});

test('WakeBudget: resets burst window after 60s', () => {
  const c = clock();
  const b = new WakeBudget({ maxWakesPerMinute: 2 }, c.now);
  assert.equal(b.tryConsume().allowed, true);
  assert.equal(b.tryConsume().allowed, true);
  assert.equal(b.tryConsume().allowed, false);
  c.advance(61_000);
  assert.equal(b.tryConsume().allowed, true);
});

test('WakeBudget: sustained window catches slow-drip past hour cap', () => {
  const c = clock();
  const b = new WakeBudget({ maxWakesPerMinute: 100, maxWakesPerHour: 5 }, c.now);
  for (let i = 0; i < 5; i += 1) {
    c.advance(30_000);
    assert.equal(b.tryConsume().allowed, true, `wake ${i + 1} should pass`);
  }
  c.advance(30_000);
  const blocked = b.tryConsume();
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'sustained');
});

test('WakeBudget: daily cap fires independently', () => {
  const c = clock();
  const b = new WakeBudget({ maxWakesPerMinute: 1000, maxWakesPerHour: 1000, maxWakesPerDay: 2 }, c.now);
  c.advance(60 * 60 * 1000);
  assert.equal(b.tryConsume().allowed, true);
  c.advance(60 * 60 * 1000);
  assert.equal(b.tryConsume().allowed, true);
  c.advance(60 * 60 * 1000);
  const blocked = b.tryConsume();
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'daily');
});

test('WakeBudget: soft-warn fires at 80% ratio', () => {
  const c = clock();
  const b = new WakeBudget({ maxWakesPerMinute: 10, softWarnRatio: 0.8 }, c.now);
  for (let i = 0; i < 7; i += 1) b.tryConsume();
  const r = b.tryConsume();
  assert.equal(r.allowed, true);
  assert.equal(r.warn, 'burst');
});

test('WakeBudget: peek does not consume', () => {
  const c = clock();
  const b = new WakeBudget({ maxWakesPerMinute: 3 }, c.now);
  b.tryConsume();
  const before = b.peek();
  b.peek();
  b.peek();
  const after = b.peek();
  assert.deepEqual(before, after);
  assert.equal(before.minute, 1);
});
