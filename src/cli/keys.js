'use strict';

const {
  generateKeyPair,
  saveKeyPair,
  loadMeta,
  trustKey,
  listTrustedKeys,
  fingerprintOf,
} = require('../safety/identity.js');

function keygen(peerName, { force = false, out = process.stdout } = {}) {
  const existing = loadMeta(peerName);
  if (existing && !force) {
    out.write(`key already exists for ${peerName} — fingerprint ${existing.fingerprint}\nuse --force to rotate\n`);
    return 1;
  }
  const kp = generateKeyPair();
  const meta = saveKeyPair(peerName, kp);
  out.write(`keygen: ${peerName}\n`);
  out.write(`  algorithm:   ${meta.algorithm}\n`);
  out.write(`  fingerprint: ${meta.fingerprint}\n`);
  out.write(`  created:     ${meta.createdAt}\n`);
  out.write(`  public key:  ${meta.publicKeyBase64Url}\n`);
  return 0;
}

function fingerprint(peerName, { out = process.stdout } = {}) {
  const meta = loadMeta(peerName);
  if (!meta) {
    out.write(`no key for peer "${peerName}"\n`);
    return 1;
  }
  out.write(`${meta.fingerprint}  ${peerName}\n`);
  return 0;
}

function trustAdd({ group, peer, publicKey }, { out = process.stderr } = {}) {
  if (!group || !peer || !publicKey) {
    out.write('trust add: require --group <group> --peer <peer-name> --public-key <base64url>\n');
    return 2;
  }
  let raw;
  try { raw = Buffer.from(publicKey, 'base64url'); }
  catch { out.write('trust add: public key is not valid base64url\n'); return 2; }
  if (raw.length !== 32) {
    out.write(`trust add: expected 32-byte ed25519 public key, got ${raw.length} bytes\n`);
    return 2;
  }
  const fp = fingerprintOf(raw);
  trustKey({ group, peer, publicRaw: raw, fingerprint: fp });
  out.write(`trusted ${peer} in group "${group}" — fingerprint ${fp}\n`);
  return 0;
}

function trustList({ group }, { out = process.stdout } = {}) {
  if (!group) {
    out.write('trust list: require --group <group>\n');
    return 2;
  }
  const entries = listTrustedKeys(group);
  if (entries.length === 0) {
    out.write(`no trusted keys for group "${group}"\n`);
    return 0;
  }
  for (const e of entries) {
    out.write(`  ${e.fingerprint}  ${e.peer}  (trusted ${e.trustedAt})\n`);
  }
  return 0;
}

module.exports = { keygen, fingerprint, trustAdd, trustList };
