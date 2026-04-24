'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const {
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
} = require('../src/runtime/paths.js');

function clearEnv() {
  delete process.env[ENV_OVERRIDE];
  delete process.env[LEGACY_ENV_OVERRIDE];
}

function withEnv(name, value, fn) {
  const prev = process.env[name];
  process.env[name] = value;
  try { fn(); }
  finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

test('USER_FACING_BRAND: matches xmesh.dev brand hierarchy (CMO Q3)', () => {
  assert.equal(USER_FACING_BRAND, 'xmesh');
});

test('baseDir: defaults to ~/.xmesh when no env override', () => {
  clearEnv();
  assert.equal(baseDir(), path.join(os.homedir(), '.xmesh'));
});

test('baseDir: respects XMESH_RUNTIME_DIR primary env var', () => {
  clearEnv();
  withEnv(ENV_OVERRIDE, '/tmp/x-test', () => {
    assert.equal(baseDir(), '/tmp/x-test');
  });
});

test('baseDir: falls back to legacy XMESH_AGENT_RUNTIME_DIR if primary not set', () => {
  clearEnv();
  withEnv(LEGACY_ENV_OVERRIDE, '/tmp/legacy', () => {
    assert.equal(baseDir(), '/tmp/legacy');
  });
});

test('baseDir: primary env var wins over legacy when both set', () => {
  clearEnv();
  withEnv(ENV_OVERRIDE, '/tmp/primary', () => {
    withEnv(LEGACY_ENV_OVERRIDE, '/tmp/legacy', () => {
      assert.equal(baseDir(), '/tmp/primary');
    });
  });
});

test('keysDir: subdir of baseDir', () => {
  clearEnv();
  withEnv(ENV_OVERRIDE, '/tmp/x', () => {
    assert.equal(keysDir(), '/tmp/x/keys');
  });
});

test('trustedKeysDir: subdir of baseDir', () => {
  clearEnv();
  withEnv(ENV_OVERRIDE, '/tmp/x', () => {
    assert.equal(trustedKeysDir(), '/tmp/x/trusted-keys');
  });
});

test('stateDir: subdir of baseDir', () => {
  clearEnv();
  withEnv(ENV_OVERRIDE, '/tmp/x', () => {
    assert.equal(stateDir(), '/tmp/x/state');
  });
});

test('socketsDir: same as baseDir', () => {
  clearEnv();
  withEnv(ENV_OVERRIDE, '/tmp/x', () => {
    assert.equal(socketsDir(), '/tmp/x');
  });
});

test('legacyBaseDir: ~/.xmesh-agent regardless of env', () => {
  clearEnv();
  withEnv(ENV_OVERRIDE, '/tmp/x', () => {
    assert.equal(legacyBaseDir(), path.join(os.homedir(), '.xmesh-agent'));
  });
});

test('shouldAdviseLegacyMigration: returns false when env override present', () => {
  clearEnv();
  withEnv(ENV_OVERRIDE, '/tmp/anything', () => {
    assert.equal(shouldAdviseLegacyMigration(), false);
  });
});

test('shouldAdviseLegacyMigration: returns true only when legacy exists + new does not', () => {
  clearEnv();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-paths-'));
  const fakeHome = tmp;
  const origHome = os.homedir();
  Object.defineProperty(os, 'homedir', { value: () => fakeHome, configurable: true });
  try {
    fs.mkdirSync(path.join(fakeHome, '.xmesh-agent'), { recursive: true });
    assert.equal(shouldAdviseLegacyMigration(), true);
    fs.mkdirSync(path.join(fakeHome, '.xmesh'), { recursive: true });
    assert.equal(shouldAdviseLegacyMigration(), false);
  } finally {
    Object.defineProperty(os, 'homedir', { value: () => origHome, configurable: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('legacyMigrationAdvisory: human-readable migration command', () => {
  clearEnv();
  const msg = legacyMigrationAdvisory();
  assert.match(msg, /legacy runtime dir/);
  assert.match(msg, /\.xmesh-agent/);
  assert.match(msg, /\.xmesh/);
  assert.match(msg, /mv /);
});
