'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const USER_FACING_BRAND = 'xmesh';
const LEGACY_BRAND = 'xmesh-agent';
const ENV_OVERRIDE = 'XMESH_RUNTIME_DIR';
const LEGACY_ENV_OVERRIDE = 'XMESH_AGENT_RUNTIME_DIR';

function baseDir() {
  if (process.env[ENV_OVERRIDE]) return process.env[ENV_OVERRIDE];
  if (process.env[LEGACY_ENV_OVERRIDE]) return process.env[LEGACY_ENV_OVERRIDE];
  return path.join(os.homedir(), `.${USER_FACING_BRAND}`);
}

function keysDir() { return path.join(baseDir(), 'keys'); }
function trustedKeysDir() { return path.join(baseDir(), 'trusted-keys'); }
function stateDir() { return path.join(baseDir(), 'state'); }
function socketsDir() { return baseDir(); }

function legacyBaseDir() {
  return path.join(os.homedir(), `.${LEGACY_BRAND}`);
}

function shouldAdviseLegacyMigration() {
  if (process.env[ENV_OVERRIDE] || process.env[LEGACY_ENV_OVERRIDE]) return false;
  const current = path.join(os.homedir(), `.${USER_FACING_BRAND}`);
  const legacy = legacyBaseDir();
  try {
    return fs.existsSync(legacy) && !fs.existsSync(current);
  } catch {
    return false;
  }
}

function legacyMigrationAdvisory() {
  return (
    `legacy runtime dir detected at ${legacyBaseDir()}; ` +
    `xmesh-agent 0.1.0-alpha.13+ uses ${baseDir()}. ` +
    `To migrate: mv ${legacyBaseDir()} ${baseDir()}  (no data loss; no writes until done)`
  );
}

module.exports = {
  baseDir,
  keysDir,
  trustedKeysDir,
  stateDir,
  socketsDir,
  legacyBaseDir,
  shouldAdviseLegacyMigration,
  legacyMigrationAdvisory,
  USER_FACING_BRAND,
  ENV_OVERRIDE,
  LEGACY_ENV_OVERRIDE,
};
