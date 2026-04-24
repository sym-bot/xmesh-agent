'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CircuitBreaker, isTransientError, DEFAULTS } = require('../src/safety/circuit-breaker.js');

function clock() {
  const c = { t: 1_700_000_000_000 };
  c.now = () => c.t;
  c.advance = (ms) => { c.t += ms; };
  return c;
}

test('CircuitBreaker: starts closed with zero failures', () => {
  const c = clock();
  const b = new CircuitBreaker({}, c.now);
  assert.equal(b.state, 'closed');
  assert.equal(b.canAttempt(), true);
  assert.equal(b.backoffMs(), 0);
});

test('CircuitBreaker: opens after failureThreshold consecutive failures', () => {
  const c = clock();
  const b = new CircuitBreaker({ failureThreshold: 3 }, c.now);
  b.recordFailure();
  b.recordFailure();
  assert.equal(b.state, 'closed');
  b.recordFailure();
  assert.equal(b.state, 'open');
  assert.equal(b.canAttempt(), false);
});

test('CircuitBreaker: success before threshold resets counter', () => {
  const c = clock();
  const b = new CircuitBreaker({ failureThreshold: 3 }, c.now);
  b.recordFailure();
  b.recordFailure();
  b.recordSuccess();
  b.recordFailure();
  b.recordFailure();
  assert.equal(b.state, 'closed');
});

test('CircuitBreaker: half-open after resetAfterMs passes', () => {
  const c = clock();
  const b = new CircuitBreaker({ failureThreshold: 2, resetAfterMs: 5_000 }, c.now);
  b.recordFailure(); b.recordFailure();
  assert.equal(b.state, 'open');
  c.advance(6_000);
  assert.equal(b.state, 'half-open');
  assert.equal(b.canAttempt(), true);
});

test('CircuitBreaker: exponential backoff up to max', () => {
  const c = clock();
  const b = new CircuitBreaker({ baseBackoffMs: 100, maxBackoffMs: 1_000 }, c.now);
  b.recordFailure();
  assert.equal(b.backoffMs(), 100);
  b.recordFailure();
  assert.equal(b.backoffMs(), 200);
  b.recordFailure();
  assert.equal(b.backoffMs(), 400);
  b.recordFailure();
  assert.equal(b.backoffMs(), 800);
  b.recordFailure();
  assert.equal(b.backoffMs(), 1_000);
});

test('CircuitBreaker: snapshot exposes expected shape', () => {
  const c = clock();
  const b = new CircuitBreaker({}, c.now);
  b.recordFailure();
  const s = b.snapshot();
  assert.equal(s.state, 'closed');
  assert.equal(s.consecutiveFailures, 1);
  assert.ok(s.nextBackoffMs > 0);
});

test('isTransientError: 429 rate limits detected by status', () => {
  assert.equal(isTransientError({ status: 429, message: 'too fast' }), true);
  assert.equal(isTransientError({ statusCode: 429 }), true);
});

test('isTransientError: overloaded messages detected', () => {
  assert.equal(isTransientError(new Error('anthropic overloaded, try later')), true);
  assert.equal(isTransientError(new Error('rate limit exceeded')), true);
  assert.equal(isTransientError(new Error('ECONNRESET')), true);
});

test('isTransientError: non-transient errors return false', () => {
  assert.equal(isTransientError(new Error('invalid API key')), false);
  assert.equal(isTransientError({ status: 401 }), false);
  assert.equal(isTransientError(null), false);
  assert.equal(isTransientError(undefined), false);
});

test('isTransientError: 502/503/504 detected', () => {
  assert.equal(isTransientError({ status: 502 }), true);
  assert.equal(isTransientError({ status: 503 }), true);
  assert.equal(isTransientError({ status: 504 }), true);
});

test('DEFAULTS: sane production values', () => {
  assert.equal(DEFAULTS.failureThreshold, 5);
  assert.ok(DEFAULTS.resetAfterMs >= 30_000);
  assert.ok(DEFAULTS.maxBackoffMs >= DEFAULTS.baseBackoffMs);
});
