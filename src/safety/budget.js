'use strict';

const DEFAULTS = Object.freeze({
  maxWakesPerMinute: 10,
  maxWakesPerHour: 100,
  maxWakesPerDay: 1000,
  softWarnRatio: 0.8,
});

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

class WakeBudget {
  constructor(opts = {}, now = Date.now) {
    this.limits = { ...DEFAULTS, ...opts };
    this._now = now;
    this._wakes = [];
  }

  tryConsume() {
    this._prune();
    const nowMs = this._now();
    const preCounts = this._countsAtOrAfter(nowMs);
    const over = this._overLimit(preCounts);
    if (over) return { allowed: false, reason: over, counts: preCounts };
    this._wakes.push(nowMs);
    const postCounts = {
      minute: preCounts.minute + 1,
      hour: preCounts.hour + 1,
      day: preCounts.day + 1,
    };
    const warn = this._warning(postCounts);
    return { allowed: true, warn, counts: postCounts };
  }

  peek() {
    this._prune();
    return this._countsAtOrAfter(this._now());
  }

  _countsAtOrAfter(nowMs) {
    const minuteFloor = nowMs - MINUTE_MS;
    const hourFloor = nowMs - HOUR_MS;
    const dayFloor = nowMs - DAY_MS;
    let minute = 0;
    let hour = 0;
    let day = 0;
    for (const t of this._wakes) {
      if (t > minuteFloor) minute += 1;
      if (t > hourFloor) hour += 1;
      if (t > dayFloor) day += 1;
    }
    return { minute, hour, day };
  }

  _overLimit(counts) {
    if (counts.minute >= this.limits.maxWakesPerMinute) return 'burst';
    if (counts.hour >= this.limits.maxWakesPerHour) return 'sustained';
    if (counts.day >= this.limits.maxWakesPerDay) return 'daily';
    return null;
  }

  _warning(counts) {
    const w = this.limits.softWarnRatio;
    if (counts.minute >= this.limits.maxWakesPerMinute * w) return 'burst';
    if (counts.hour >= this.limits.maxWakesPerHour * w) return 'sustained';
    if (counts.day >= this.limits.maxWakesPerDay * w) return 'daily';
    return null;
  }

  _prune() {
    const cutoff = this._now() - DAY_MS;
    while (this._wakes.length > 0 && this._wakes[0] <= cutoff) {
      this._wakes.shift();
    }
  }
}

module.exports = { WakeBudget, DEFAULTS };
