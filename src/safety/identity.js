'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { keysDir, trustedKeysDir } = require('../runtime/paths.js');

function defaultKeyDir() { return keysDir(); }
function defaultTrustDir() { return trustedKeysDir(); }

function privKeyPath(peerName, dir = defaultKeyDir()) {
  return path.join(dir, `${peerName}.key`);
}
function pubKeyPath(peerName, dir = defaultKeyDir()) {
  return path.join(dir, `${peerName}.pub`);
}
function metaPath(peerName, dir = defaultKeyDir()) {
  return path.join(dir, `${peerName}.json`);
}

function generateKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKey,
    privateDer: privateKey.export({ type: 'pkcs8', format: 'der' }),
    publicDer: publicKey.export({ type: 'spki', format: 'der' }),
    publicRaw: rawPublicKeyFromSpki(publicKey),
  };
}

function rawPublicKeyFromSpki(publicKey) {
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  return spki.slice(spki.length - 32);
}

function fullFingerprintOf(publicRaw) {
  return crypto.createHash('sha256').update(publicRaw).digest('hex');
}

function fingerprintOf(publicRaw) {
  return fullFingerprintOf(publicRaw).slice(0, 16);
}

function saveKeyPair(peerName, kp, dir = defaultKeyDir()) {
  fs.mkdirSync(dir, { recursive: true });
  const privPath = privKeyPath(peerName, dir);
  const pubPath = pubKeyPath(peerName, dir);
  const mPath = metaPath(peerName, dir);

  fs.writeFileSync(privPath, kp.privateDer);
  fs.chmodSync(privPath, 0o600);

  fs.writeFileSync(pubPath, kp.publicDer);
  fs.chmodSync(pubPath, 0o644);

  const meta = {
    peer: peerName,
    algorithm: 'ed25519',
    createdAt: new Date().toISOString(),
    fingerprint: fingerprintOf(kp.publicRaw),
    publicKeyBase64Url: kp.publicRaw.toString('base64url'),
  };
  fs.writeFileSync(mPath, JSON.stringify(meta, null, 2));
  fs.chmodSync(mPath, 0o644);
  return meta;
}

function loadKeyPair(peerName, dir = defaultKeyDir()) {
  const privPath = privKeyPath(peerName, dir);
  const pubPath = pubKeyPath(peerName, dir);
  if (!fs.existsSync(privPath)) throw new Error(`no private key for peer "${peerName}" at ${privPath}`);
  const privDer = fs.readFileSync(privPath);
  const pubDer = fs.readFileSync(pubPath);
  const privateKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
  const publicKey = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });
  return {
    privateKey,
    publicKey,
    publicRaw: rawPublicKeyFromSpki(publicKey),
  };
}

function loadMeta(peerName, dir = defaultKeyDir()) {
  const p = metaPath(peerName, dir);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function canonicalise(envelope) {
  const clean = { ...envelope };
  delete clean.signature;
  delete clean.raw;
  return stableStringify(clean);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function signEnvelope(envelope, privateKey) {
  const canonical = canonicalise(envelope);
  const digest = crypto.createHash('sha256').update(canonical).digest();
  return crypto.sign(null, digest, privateKey).toString('base64url');
}

function verifyEnvelope(envelope, signatureB64, publicKey) {
  try {
    const canonical = canonicalise(envelope);
    const digest = crypto.createHash('sha256').update(canonical).digest();
    const sig = Buffer.from(signatureB64, 'base64url');
    return crypto.verify(null, digest, publicKey, sig);
  } catch {
    return false;
  }
}

function trustKey({ group, peer, publicRaw, fingerprint, baseDir = defaultTrustDir() }) {
  const groupDir = path.join(baseDir, group);
  fs.mkdirSync(groupDir, { recursive: true });
  const out = {
    peer,
    group,
    algorithm: 'ed25519',
    fingerprint: fingerprint || fingerprintOf(publicRaw),
    publicKeyBase64Url: publicRaw.toString('base64url'),
    trustedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(groupDir, `${peer}.json`), JSON.stringify(out, null, 2));
  return out;
}

function listTrustedKeys(group, baseDir = defaultTrustDir()) {
  const groupDir = path.join(baseDir, group);
  if (!fs.existsSync(groupDir)) return [];
  return fs.readdirSync(groupDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(groupDir, f), 'utf8')));
}

module.exports = {
  generateKeyPair,
  saveKeyPair,
  loadKeyPair,
  loadMeta,
  fingerprintOf,
  fullFingerprintOf,
  signEnvelope,
  verifyEnvelope,
  canonicalise,
  stableStringify,
  trustKey,
  listTrustedKeys,
  defaultKeyDir,
  defaultTrustDir,
  privKeyPath,
  pubKeyPath,
  metaPath,
  rawPublicKeyFromSpki,
};
