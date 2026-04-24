'use strict';

const {
  generateKeyPair,
  saveKeyPair,
  loadMeta,
  trustKey,
  listTrustedKeys,
  fingerprintOf,
  fullFingerprintOf,
} = require('../safety/identity.js');

function keygen(peerName, { force = false, out = process.stdout } = {}) {
  const existing = loadMeta(peerName);
  if (existing && !force) {
    out.write(`key already exists for ${peerName} — keyprint ${existing.fingerprint}\nuse --force to rotate\n`);
    return 1;
  }
  const kp = generateKeyPair();
  const meta = saveKeyPair(peerName, kp);
  const full = fullFingerprintOf(kp.publicRaw);
  out.write(`keygen: ${peerName}\n`);
  out.write(`  algorithm:   ${meta.algorithm}\n`);
  out.write(`  keyprint:    ${meta.fingerprint}  (16-hex short form)\n`);
  out.write(`  fingerprint: ${full}  (64-hex full form — use this for trust add)\n`);
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
  const fullHex = Buffer.from(meta.publicKeyBase64Url, 'base64url');
  const full = fullFingerprintOf(fullHex);
  out.write(`peer:        ${peerName}\n`);
  out.write(`keyprint:    ${meta.fingerprint}\n`);
  out.write(`fingerprint: ${full}\n`);
  out.write(`public key:  ${meta.publicKeyBase64Url}\n`);
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
  const keyprint = fingerprintOf(raw);
  const full = fullFingerprintOf(raw);
  trustKey({ group, peer, publicRaw: raw, fingerprint: keyprint });
  out.write(`trusted ${peer} in group "${group}"\n`);
  out.write(`  keyprint:    ${keyprint}\n`);
  out.write(`  fingerprint: ${full}\n`);
  out.write(`  ^ verify this matches the peer's reported full fingerprint before sharing CMBs.\n`);
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
