'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  generateKeyPair,
  saveKeyPair,
  loadKeyPair,
  loadMeta,
  fingerprintOf,
  signEnvelope,
  verifyEnvelope,
  canonicalise,
  stableStringify,
  trustKey,
  listTrustedKeys,
  defaultKeyDir,
} = require('../src/safety/identity.js');

function tmpRuntimeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-id-'));
  process.env.XMESH_RUNTIME_DIR = dir;
  return dir;
}

function cleanup(dir) {
  delete process.env.XMESH_RUNTIME_DIR;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

test('generateKeyPair: produces ed25519 keypair with 32-byte raw public key', () => {
  const kp = generateKeyPair();
  assert.equal(kp.publicRaw.length, 32);
  assert.ok(kp.privateKey.asymmetricKeyType === 'ed25519');
  assert.ok(kp.publicKey.asymmetricKeyType === 'ed25519');
});

test('fingerprintOf: deterministic 16-hex prefix of SHA-256 over raw public key', () => {
  const kp = generateKeyPair();
  const a = fingerprintOf(kp.publicRaw);
  const b = fingerprintOf(kp.publicRaw);
  assert.equal(a, b);
  assert.equal(a.length, 16);
  assert.match(a, /^[0-9a-f]{16}$/);
});

test('saveKeyPair + loadKeyPair: round-trip with correct permissions on POSIX', () => {
  const dir = tmpRuntimeDir();
  try {
    const kp = generateKeyPair();
    const meta = saveKeyPair('alice', kp);
    assert.equal(meta.peer, 'alice');
    assert.equal(meta.algorithm, 'ed25519');
    const privStat = fs.statSync(path.join(defaultKeyDir(), 'alice.key'));
    assert.equal(privStat.mode & 0o777, 0o600);
    const pubStat = fs.statSync(path.join(defaultKeyDir(), 'alice.pub'));
    assert.equal(pubStat.mode & 0o777, 0o644);
    const loaded = loadKeyPair('alice');
    assert.equal(loaded.publicRaw.toString('hex'), kp.publicRaw.toString('hex'));
  } finally { cleanup(dir); }
});

test('loadKeyPair: missing peer throws with explicit path', () => {
  const dir = tmpRuntimeDir();
  try {
    assert.throws(() => loadKeyPair('ghost'), /no private key for peer "ghost"/);
  } finally { cleanup(dir); }
});

test('loadMeta: missing returns null', () => {
  const dir = tmpRuntimeDir();
  try {
    assert.equal(loadMeta('nobody'), null);
  } finally { cleanup(dir); }
});

test('stableStringify: sorts keys deterministically at every level', () => {
  const a = stableStringify({ b: 1, a: 2, c: { y: 3, x: 4 } });
  const b = stableStringify({ c: { x: 4, y: 3 }, a: 2, b: 1 });
  assert.equal(a, b);
});

test('canonicalise: drops signature + raw fields', () => {
  const env = { a: 1, signature: 'sig', raw: { heavy: 'blob' } };
  const c = canonicalise(env);
  assert.ok(!c.includes('signature'));
  assert.ok(!c.includes('heavy'));
  assert.ok(c.includes('"a":1'));
});

test('signEnvelope + verifyEnvelope: round-trip with matching key', () => {
  const dir = tmpRuntimeDir();
  try {
    const kp = generateKeyPair();
    saveKeyPair('signer', kp);
    const envelope = {
      version: '0.3.0',
      timestamp: 1700000000000,
      createdBy: 'signer',
      fields: { focus: { text: 'hello' } },
    };
    const sig = signEnvelope(envelope, kp.privateKey);
    assert.ok(typeof sig === 'string');
    assert.ok(sig.length > 0);
    assert.equal(verifyEnvelope(envelope, sig, kp.publicKey), true);
  } finally { cleanup(dir); }
});

test('verifyEnvelope: fails for tampered payload', () => {
  const kp = generateKeyPair();
  const envelope = { fields: { focus: 'original' } };
  const sig = signEnvelope(envelope, kp.privateKey);
  const tampered = { fields: { focus: 'MITM' } };
  assert.equal(verifyEnvelope(tampered, sig, kp.publicKey), false);
});

test('verifyEnvelope: fails for wrong public key', () => {
  const kpA = generateKeyPair();
  const kpB = generateKeyPair();
  const envelope = { a: 1 };
  const sig = signEnvelope(envelope, kpA.privateKey);
  assert.equal(verifyEnvelope(envelope, sig, kpB.publicKey), false);
});

test('verifyEnvelope: malformed signature returns false, does not throw', () => {
  const kp = generateKeyPair();
  const envelope = { a: 1 };
  assert.equal(verifyEnvelope(envelope, 'not-a-valid-sig', kp.publicKey), false);
  assert.equal(verifyEnvelope(envelope, '', kp.publicKey), false);
});

test('trustKey + listTrustedKeys: round-trip with fingerprint', () => {
  const dir = tmpRuntimeDir();
  try {
    const kp = generateKeyPair();
    trustKey({ group: 'demo', peer: 'alice', publicRaw: kp.publicRaw });
    const list = listTrustedKeys('demo');
    assert.equal(list.length, 1);
    assert.equal(list[0].peer, 'alice');
    assert.equal(list[0].fingerprint, fingerprintOf(kp.publicRaw));
    assert.equal(list[0].algorithm, 'ed25519');
  } finally { cleanup(dir); }
});

test('listTrustedKeys: unknown group returns empty array', () => {
  const dir = tmpRuntimeDir();
  try {
    assert.deepEqual(listTrustedKeys('ghost-group'), []);
  } finally { cleanup(dir); }
});

test('end-to-end: alice signs, bob verifies via trusted-keys pinning', () => {
  const dir = tmpRuntimeDir();
  try {
    const aliceKp = generateKeyPair();
    saveKeyPair('alice', aliceKp);
    trustKey({ group: 'demo', peer: 'alice', publicRaw: aliceKp.publicRaw });

    const envelope = {
      version: '0.3.0',
      timestamp: Date.now(),
      createdBy: 'alice',
      fields: { focus: { text: 'signed CMB' }, intent: { text: 'verify' } },
      lineage: { parents: [], ancestors: [] },
      identity: {
        publicKey: aliceKp.publicRaw.toString('base64url'),
        keyId: fingerprintOf(aliceKp.publicRaw).slice(0, 8),
      },
    };
    const sig = signEnvelope(envelope, aliceKp.privateKey);

    const trusted = listTrustedKeys('demo');
    const aliceEntry = trusted.find((e) => e.peer === 'alice');
    assert.ok(aliceEntry);

    const crypto = require('node:crypto');
    const pubDer = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(aliceEntry.publicKeyBase64Url, 'base64url'),
    ]);
    const recoveredKey = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });
    assert.equal(verifyEnvelope(envelope, sig, recoveredKey), true);
  } finally { cleanup(dir); }
});
