'use strict';

const DEFAULTS = Object.freeze({
  failureThreshold: 5,
  resetAfterMs: 60_000,
  baseBackoffMs: 1_000,
  maxBackoffMs: 30_000,
});

class CircuitBreaker {
  constructor(opts = {}, now = Date.now) {
    this.opts = { ...DEFAULTS, ...opts };
    this._now = now;
    this._consecutiveFailures = 0;
    this._openedAt = null;
    this._lastFailureTs = null;
  }

  get state() {
    if (this._openedAt === null) return 'closed';
    if (this._now() - this._openedAt >= this.opts.resetAfterMs) return 'half-open';
    return 'open';
  }

  canAttempt() {
    const s = this.state;
    if (s === 'closed') return true;
    if (s === 'half-open') return true;
    return false;
  }

  backoffMs() {
    if (this._consecutiveFailures === 0) return 0;
    const exp = Math.min(
      this.opts.maxBackoffMs,
      this.opts.baseBackoffMs * Math.pow(2, this._consecutiveFailures - 1),
    );
    return exp;
  }

  recordSuccess() {
    this._consecutiveFailures = 0;
    this._openedAt = null;
    this._lastFailureTs = null;
  }

  recordFailure() {
    this._consecutiveFailures += 1;
    this._lastFailureTs = this._now();
    if (this._consecutiveFailures >= this.opts.failureThreshold && this._openedAt === null) {
      this._openedAt = this._now();
    }
  }

  snapshot() {
    return {
      state: this.state,
      consecutiveFailures: this._consecutiveFailures,
      openedAt: this._openedAt,
      lastFailureTs: this._lastFailureTs,
      nextBackoffMs: this.backoffMs(),
    };
  }
}

function isTransientError(err) {
  if (!err) return false;
  const msg = String(err.message || err || '').toLowerCase();
  if (err.status === 429 || err.statusCode === 429) return true;
  if (err.status === 503 || err.statusCode === 503) return true;
  if (err.status === 502 || err.statusCode === 502) return true;
  if (err.status === 504 || err.statusCode === 504) return true;
  if (msg.includes('rate limit')) return true;
  if (msg.includes('429')) return true;
  if (msg.includes('overloaded')) return true;
  if (msg.includes('econnreset')) return true;
  if (msg.includes('etimedout')) return true;
  if (msg.includes('enetunreach')) return true;
  return false;
}

module.exports = { CircuitBreaker, isTransientError, DEFAULTS };
