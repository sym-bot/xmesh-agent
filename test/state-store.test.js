'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StateStore, loadState, saveState, statePath, emptyState, SCHEMA_VERSION } = require('../src/core/state-store.js');

function tmpBase() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-state-'));
}

test('emptyState: zeroed totals + null lastRun', () => {
  const s = emptyState('peer-a');
  assert.equal(s.peer, 'peer-a');
  assert.equal(s.totals.runs, 0);
  assert.equal(s.totals.costUsdTotal, 0);
  assert.equal(s.lastRun, null);
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
});

test('loadState: absent file returns empty state', () => {
  const base = tmpBase();
  const s = loadState('ghost', base);
  assert.equal(s.totals.runs, 0);
});

test('saveState + loadState: round-trip', () => {
  const base = tmpBase();
  const s = emptyState('peer-b');
  s.totals.costUsdTotal = 0.12345;
  s.totals.runs = 3;
  saveState(s, base);
  const loaded = loadState('peer-b', base);
  assert.equal(loaded.totals.costUsdTotal, 0.12345);
  assert.equal(loaded.totals.runs, 3);
});

test('loadState: older schema version returns fresh state marked with migratedFromVersion', () => {
  const base = tmpBase();
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(statePath('peer-c', base), JSON.stringify({ schemaVersion: 0, totals: { runs: 999 } }));
  const loaded = loadState('peer-c', base);
  assert.equal(loaded.migratedFromVersion, 0);
  assert.equal(loaded.totals.runs, 0);
});

test('loadState: malformed JSON returns empty state (no throw)', () => {
  const base = tmpBase();
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(statePath('peer-d', base), '{not json');
  const loaded = loadState('peer-d', base);
  assert.equal(loaded.totals.runs, 0);
});

test('StateStore: onRunStart increments runs, sets firstSeenIso on first run only', () => {
  const base = tmpBase();
  const s = new StateStore({ peerName: 'peer-e', baseDir: base });
  s.onRunStart({ configPath: '/a.toml', model: 'anthropic/claude-opus-4-7', group: 'g' });
  assert.equal(s.state.totals.runs, 1);
  const firstSeen = s.state.firstSeenIso;
  assert.ok(firstSeen);
  s.onRunStart({ configPath: '/a.toml', model: 'x', group: 'g' });
  assert.equal(s.state.totals.runs, 2);
  assert.equal(s.state.firstSeenIso, firstSeen);
});

test('StateStore: recordStats accumulates deltas into lifetime totals', () => {
  const base = tmpBase();
  const s = new StateStore({ peerName: 'peer-f', baseDir: base });
  s.onRunStart({ configPath: '', model: 'x', group: 'g' });
  s.recordStats({ cmbsEmitted: 3, cmbsSuppressed: 1, costUsdTotal: 0.05 });
  s.recordStats({ cmbsEmitted: 7, cmbsSuppressed: 1, costUsdTotal: 0.10 });
  assert.equal(s.state.totals.cmbsEmitted, 7);
  assert.equal(s.state.totals.cmbsSuppressed, 1);
  assert.ok(Math.abs(s.state.totals.costUsdTotal - 0.10) < 1e-9);
});

test('StateStore: multi-run totals persist across StateStore instances', () => {
  const base = tmpBase();
  const s1 = new StateStore({ peerName: 'peer-g', baseDir: base });
  s1.onRunStart({ configPath: '', model: 'x', group: 'g' });
  s1.recordStats({ cmbsEmitted: 10, cmbsSuppressed: 2, costUsdTotal: 0.50 });
  s1.onRunStop({ reason: 'test' });

  const s2 = new StateStore({ peerName: 'peer-g', baseDir: base });
  assert.equal(s2.state.totals.runs, 1);
  assert.equal(s2.state.totals.cmbsEmitted, 10);
  assert.equal(s2.state.totals.costUsdTotal, 0.50);

  s2.onRunStart({ configPath: '', model: 'x', group: 'g' });
  s2.recordStats({ cmbsEmitted: 5, cmbsSuppressed: 0, costUsdTotal: 0.25 });
  assert.equal(s2.state.totals.runs, 2);
  assert.equal(s2.state.totals.cmbsEmitted, 15, '10 prior + 5 this run');
  assert.ok(Math.abs(s2.state.totals.costUsdTotal - 0.75) < 1e-9, '$0.50 prior + $0.25 this run');
});

test('StateStore: decreasing stats (new run starts fresh) do not decrement totals', () => {
  const base = tmpBase();
  const s = new StateStore({ peerName: 'peer-h', baseDir: base });
  s.onRunStart({ configPath: '', model: 'x', group: 'g' });
  s.recordStats({ cmbsEmitted: 20, cmbsSuppressed: 5, costUsdTotal: 1.0 });
  s.onRunStop({ reason: 'stop' });
  s.onRunStart({ configPath: '', model: 'x', group: 'g' });
  s.recordStats({ cmbsEmitted: 0, cmbsSuppressed: 0, costUsdTotal: 0 });
  assert.equal(s.state.totals.cmbsEmitted, 20, 'lifetime total unchanged');
});

test('StateStore: onRunStop records stoppedIso + reason', () => {
  const base = tmpBase();
  const s = new StateStore({ peerName: 'peer-i', baseDir: base });
  s.onRunStart({ configPath: '', model: 'x', group: 'g' });
  s.onRunStop({ reason: 'SIGTERM' });
  assert.equal(s.state.lastRun.stopReason, 'SIGTERM');
  assert.ok(s.state.lastRun.stoppedIso);
});
