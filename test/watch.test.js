'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { formatRow, formatHeader, formatUptime, listPeerNames, watchOnce } = require('../src/cli/watch.js');

function tmpRuntime() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-watch-'));
  process.env.XMESH_RUNTIME_DIR = dir;
  return dir;
}

function cleanup(dir) {
  delete process.env.XMESH_RUNTIME_DIR;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

class SinkStream {
  constructor() { this.chunks = []; }
  write(s) { this.chunks.push(s); return true; }
  text() { return this.chunks.join(''); }
}

test('formatUptime: human-readable spans', () => {
  assert.equal(formatUptime(45_000), '45s');
  assert.equal(formatUptime(120_000), '2m');
  assert.equal(formatUptime(7_200_000), '2.0h');
  assert.equal(formatUptime(172_800_000), '2.0d');
  assert.equal(formatUptime(0), '?');
  assert.equal(formatUptime(undefined), '?');
});

test('formatRow: alive peer renders all columns', () => {
  const row = formatRow({
    name: 'reviewer-01',
    status: 'alive',
    group: 'demo',
    model: 'gpt-4o-mini',
    uptimeMs: 90_000,
    emitted: 5,
    suppressed: 1,
    cost: 0.001234,
    budget: { minute: 2, hour: 5, day: 12 },
    breaker: 'closed',
  }, { color: false });
  assert.match(row, /reviewer-01/);
  assert.match(row, /gpt-4o-mini/);
  assert.match(row, /demo/);
  assert.match(row, /1m/);   // uptime
  assert.match(row, /E5\/S1/);
  assert.match(row, /\$0\.001234/);
  assert.match(row, /2m\/5h\/12d/);
  assert.match(row, /closed/);
});

test('formatRow: stale peer renders STALE marker', () => {
  const row = formatRow(
    { name: 'ghost', status: 'stale', error: 'no response' },
    { color: false },
  );
  assert.match(row, /ghost/);
  assert.match(row, /STALE/);
  assert.match(row, /no response/);
});

test('formatRow: error peer renders ERROR marker', () => {
  const row = formatRow(
    { name: 'broken', status: 'error', error: 'invalid response' },
    { color: false },
  );
  assert.match(row, /ERROR/);
});

test('formatRow: open breaker rendered (yellow but coloring off here)', () => {
  const row = formatRow({
    name: 'p', status: 'alive', group: 'g', model: 'm', uptimeMs: 1000,
    emitted: 0, suppressed: 0, cost: 0, budget: {}, breaker: 'open',
  }, { color: false });
  assert.match(row, /open/);
});

test('formatHeader: column titles present', () => {
  const h = formatHeader({ color: false });
  for (const col of ['PEER', 'MODEL', 'GROUP', 'UPTIME', 'CMBs', 'COST', 'BUDGET', 'BREAKER']) {
    assert.ok(h.includes(col), `missing column: ${col}`);
  }
});

test('listPeerNames: returns empty when sockets dir absent', () => {
  const dir = tmpRuntime();
  try { assert.deepEqual(listPeerNames(), []); }
  finally { cleanup(dir); }
});

test('listPeerNames: lists *.sock files only', () => {
  const dir = tmpRuntime();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.sock'), '');
    fs.writeFileSync(path.join(dir, 'b.sock'), '');
    fs.writeFileSync(path.join(dir, 'not-a-sock.txt'), '');
    const names = listPeerNames().sort();
    assert.deepEqual(names, ['a', 'b']);
  } finally { cleanup(dir); }
});

test('watchOnce: prints "no peers running" message when empty', async () => {
  const dir = tmpRuntime();
  try {
    const out = new SinkStream();
    await watchOnce({ out, color: false });
    assert.match(out.text(), /no peers running/);
  } finally { cleanup(dir); }
});

test('watchOnce: shows STALE for an orphaned socket', async () => {
  const dir = tmpRuntime();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'orphan.sock'), '');
    const out = new SinkStream();
    await watchOnce({ out, color: false });
    assert.match(out.text(), /orphan/);
    assert.match(out.text(), /STALE/);
  } finally { cleanup(dir); }
});

test('watchOnce: header is printed when peers exist', async () => {
  const dir = tmpRuntime();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'p.sock'), '');
    const out = new SinkStream();
    await watchOnce({ out, color: false });
    assert.match(out.text(), /PEER/);
    assert.match(out.text(), /MODEL/);
  } finally { cleanup(dir); }
});
