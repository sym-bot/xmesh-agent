'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { doctor } = require('../src/cli/doctor.js');

class SinkStream {
  constructor() { this.chunks = []; }
  write(s) { this.chunks.push(s); return true; }
  text() { return this.chunks.join(''); }
}

function tmpRuntime() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-doctor-'));
  process.env.XMESH_RUNTIME_DIR = dir;
  return dir;
}

function cleanup(dir) {
  delete process.env.XMESH_RUNTIME_DIR;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

test('doctor: empty environment reports HEALTHY summary', async () => {
  const dir = tmpRuntime();
  try {
    const out = new SinkStream();
    const result = await doctor({ out, err: new SinkStream() });
    assert.equal(result.ok, true);
    assert.deepEqual(result.issues, []);
    assert.match(out.text(), /HEALTHY/);
    assert.match(out.text(), /no peers configured yet|no peers have run yet|no peers running/);
  } finally { cleanup(dir); }
});

test('doctor: includes runtime + node version + base dir lines', async () => {
  const dir = tmpRuntime();
  try {
    const out = new SinkStream();
    await doctor({ out, err: new SinkStream() });
    const text = out.text();
    assert.match(text, /node:\s+v\d+/);
    assert.match(text, /baseDir:/);
    assert.match(text, /identity keys/);
    assert.match(text, /trusted-keys/);
    assert.match(text, /persistent state/);
    assert.match(text, /running peers/);
    assert.match(text, /environment/);
  } finally { cleanup(dir); }
});

test('doctor: lists keys with fingerprint when present', async () => {
  const dir = tmpRuntime();
  try {
    const { generateKeyPair, saveKeyPair } = require('../src/safety/identity.js');
    const kp = generateKeyPair();
    const meta = saveKeyPair('alice', kp);
    const out = new SinkStream();
    await doctor({ out, err: new SinkStream() });
    assert.match(out.text(), new RegExp('alice\\s+keyprint=' + meta.fingerprint));
  } finally { cleanup(dir); }
});

test('doctor: warns on insecure key file mode', async () => {
  const dir = tmpRuntime();
  try {
    const { generateKeyPair, saveKeyPair } = require('../src/safety/identity.js');
    const kp = generateKeyPair();
    saveKeyPair('alice', kp);
    fs.chmodSync(path.join(dir, 'keys', 'alice.key'), 0o644);
    const result = await doctor({ out: new SinkStream(), err: new SinkStream() });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.includes('alice.key') && i.includes('600')));
  } finally { cleanup(dir); }
});

test('doctor: lists state totals when peer state exists', async () => {
  const dir = tmpRuntime();
  try {
    const { StateStore } = require('../src/core/state-store.js');
    const s = new StateStore({ peerName: 'reviewer-01', baseDir: path.join(dir, 'state') });
    s.onRunStart({ configPath: '/x.toml', model: 'openai/gpt-4o', group: 'g' });
    s.recordStats({ cmbsEmitted: 5, cmbsSuppressed: 1, costUsdTotal: 0.05 });
    s.onRunStop({ reason: 'test' });
    const out = new SinkStream();
    await doctor({ out, err: new SinkStream() });
    assert.match(out.text(), /reviewer-01\s+runs=1\s+emitted=5\s+cost=\$0\.050000/);
  } finally { cleanup(dir); }
});

test('doctor: stale-socket detection adds an issue + suggestion', async () => {
  const dir = tmpRuntime();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const sockPath = path.join(dir, 'ghost-peer.sock');
    fs.writeFileSync(sockPath, '');
    const result = await doctor({ out: new SinkStream(), err: new SinkStream() });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.includes('stale socket') && i.includes('ghost-peer.sock')));
  } finally { cleanup(dir); }
});

test('doctor: env section reports all six known env vars (incl. Mistral)', async () => {
  const dir = tmpRuntime();
  try {
    const out = new SinkStream();
    await doctor({ out, err: new SinkStream() });
    const text = out.text();
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MISTRAL_API_KEY', 'OLLAMA_HOST', 'SYM_RELAY_URL', 'SYM_RELAY_TOKEN']) {
      assert.match(text, new RegExp(k + ':'));
    }
  } finally { cleanup(dir); }
});
