'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { keygen, fingerprint, trustAdd, trustList } = require('../src/cli/keys.js');
const { generateKeyPair, fullFingerprintOf } = require('../src/safety/identity.js');

class SinkStream {
  constructor() { this.chunks = []; }
  write(s) { this.chunks.push(s); return true; }
  text() { return this.chunks.join(''); }
}

function tmpRuntime() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-keycli-'));
  process.env.XMESH_RUNTIME_DIR = dir;
  return dir;
}

function cleanup(dir) {
  delete process.env.XMESH_RUNTIME_DIR;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

test('keygen: prints both keyprint (16-hex) and full fingerprint (64-hex) per CMO Q4', () => {
  const dir = tmpRuntime();
  try {
    const out = new SinkStream();
    const code = keygen('alice', { out });
    assert.equal(code, 0);
    const text = out.text();
    assert.match(text, /keyprint:\s+[0-9a-f]{16}\s+\(16-hex short form\)/);
    assert.match(text, /fingerprint:\s+[0-9a-f]{64}\s+\(64-hex full form/);
    assert.match(text, /use this for trust add/);
  } finally { cleanup(dir); }
});

test('keygen: refuses overwrite without --force', () => {
  const dir = tmpRuntime();
  try {
    keygen('alice', { out: new SinkStream() });
    const out = new SinkStream();
    const code = keygen('alice', { out });
    assert.equal(code, 1);
    assert.match(out.text(), /already exists/);
    assert.match(out.text(), /use --force/);
  } finally { cleanup(dir); }
});

test('keygen: --force rotates the key', () => {
  const dir = tmpRuntime();
  try {
    const out1 = new SinkStream();
    keygen('alice', { out: out1 });
    const fp1 = out1.text().match(/fingerprint:\s+([0-9a-f]{64})/)[1];
    const out2 = new SinkStream();
    keygen('alice', { force: true, out: out2 });
    const fp2 = out2.text().match(/fingerprint:\s+([0-9a-f]{64})/)[1];
    assert.notEqual(fp1, fp2, 'rotation produces a new key');
  } finally { cleanup(dir); }
});

test('fingerprint: prints peer + keyprint + full fingerprint + public key', () => {
  const dir = tmpRuntime();
  try {
    keygen('bob', { out: new SinkStream() });
    const out = new SinkStream();
    const code = fingerprint('bob', { out });
    assert.equal(code, 0);
    const text = out.text();
    assert.match(text, /peer:\s+bob/);
    assert.match(text, /keyprint:\s+[0-9a-f]{16}/);
    assert.match(text, /fingerprint:\s+[0-9a-f]{64}/);
    assert.match(text, /public key:\s+[A-Za-z0-9_-]+/);
  } finally { cleanup(dir); }
});

test('fingerprint: missing peer returns exit 1', () => {
  const dir = tmpRuntime();
  try {
    const out = new SinkStream();
    const code = fingerprint('ghost', { out });
    assert.equal(code, 1);
    assert.match(out.text(), /no key for peer "ghost"/);
  } finally { cleanup(dir); }
});

test('trustAdd: shows full fingerprint and verification advisory per CMO Q4', () => {
  const dir = tmpRuntime();
  try {
    const kp = generateKeyPair();
    const pubB64 = kp.publicRaw.toString('base64url');
    const out = new SinkStream();
    const code = trustAdd({ group: 'demo', peer: 'alice', publicKey: pubB64 }, { out });
    assert.equal(code, 0);
    const text = out.text();
    assert.match(text, /trusted alice in group "demo"/);
    assert.match(text, /keyprint:\s+[0-9a-f]{16}/);
    assert.match(text, new RegExp(`fingerprint:\\s+${fullFingerprintOf(kp.publicRaw)}`));
    assert.match(text, /verify this matches the peer's reported full fingerprint/);
  } finally { cleanup(dir); }
});

test('trustAdd: rejects missing args with exit 2', () => {
  const out = new SinkStream();
  const code = trustAdd({}, { out });
  assert.equal(code, 2);
  assert.match(out.text(), /require --group/);
});

test('trustAdd: rejects non-32-byte public key with exit 2', () => {
  const shortKey = Buffer.from('not-a-real-key').toString('base64url');
  const out = new SinkStream();
  const code = trustAdd({ group: 'g', peer: 'p', publicKey: shortKey }, { out });
  assert.equal(code, 2);
  assert.match(out.text(), /expected 32-byte ed25519 public key/);
});

test('trustList: prints empty group cleanly', () => {
  const dir = tmpRuntime();
  try {
    const out = new SinkStream();
    const code = trustList({ group: 'never-seen' }, { out });
    assert.equal(code, 0);
    assert.match(out.text(), /no trusted keys/);
  } finally { cleanup(dir); }
});

test('trustList: lists trusted entries with keyprint + peer + trustedAt', () => {
  const dir = tmpRuntime();
  try {
    const kp = generateKeyPair();
    trustAdd(
      { group: 'demo', peer: 'alice', publicKey: kp.publicRaw.toString('base64url') },
      { out: new SinkStream() },
    );
    const out = new SinkStream();
    trustList({ group: 'demo' }, { out });
    assert.match(out.text(), /[0-9a-f]{16}\s+alice/);
    assert.match(out.text(), /trusted 20\d\d-/);
  } finally { cleanup(dir); }
});

test('trustList: rejects missing --group with exit 2', () => {
  const out = new SinkStream();
  const code = trustList({}, { out });
  assert.equal(code, 2);
});
