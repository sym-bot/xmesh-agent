'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer, sendRequest, socketPath } = require('../src/cli/ipc.js');

function tmpRuntimeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-ipc-test-'));
  process.env.XMESH_RUNTIME_DIR = dir;
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

test('IPC: server responds to valid cmd handler', async () => {
  const dir = tmpRuntimeDir();
  try {
    const server = await startServer({
      peerName: 'peer-a',
      handlers: {
        status: () => ({ emitted: 7 }),
      },
    });
    const res = await sendRequest('peer-a', 'status');
    assert.equal(res.ok, true);
    assert.equal(res.emitted, 7);
    await server.close();
  } finally {
    cleanup(dir);
  }
});

test('IPC: unknown command returns error', async () => {
  const dir = tmpRuntimeDir();
  try {
    const server = await startServer({
      peerName: 'peer-b',
      handlers: { status: () => ({}) },
    });
    const res = await sendRequest('peer-b', 'nonsense');
    assert.equal(res.ok, false);
    assert.match(res.error, /unknown-cmd/);
    await server.close();
  } finally {
    cleanup(dir);
  }
});

test('IPC: handler error surfaces as ok=false', async () => {
  const dir = tmpRuntimeDir();
  try {
    const server = await startServer({
      peerName: 'peer-c',
      handlers: {
        boom: () => { throw new Error('kaboom'); },
      },
    });
    const res = await sendRequest('peer-c', 'boom');
    assert.equal(res.ok, false);
    assert.equal(res.error, 'kaboom');
    await server.close();
  } finally {
    cleanup(dir);
  }
});

test('IPC: async handler result resolves correctly', async () => {
  const dir = tmpRuntimeDir();
  try {
    const server = await startServer({
      peerName: 'peer-d',
      handlers: { trace: async (req) => ({ cmbId: req.cmbId, chain: ['a', 'b'] }) },
    });
    const res = await sendRequest('peer-d', 'trace', { cmbId: 'cmb-42' });
    assert.equal(res.ok, true);
    assert.equal(res.cmbId, 'cmb-42');
    assert.deepEqual(res.chain, ['a', 'b']);
    await server.close();
  } finally {
    cleanup(dir);
  }
});

test('IPC: sendRequest fails when no server is running', async () => {
  const dir = tmpRuntimeDir();
  try {
    await assert.rejects(sendRequest('ghost-peer', 'status'), /no running peer/);
  } finally {
    cleanup(dir);
  }
});

test('IPC: prototype-chain method names are rejected as unknown-cmd', async () => {
  const dir = tmpRuntimeDir();
  try {
    const server = await startServer({
      peerName: 'peer-proto',
      handlers: { status: () => ({ emitted: 0 }) },
    });
    for (const malicious of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf']) {
      const res = await sendRequest('peer-proto', malicious);
      assert.equal(res.ok, false, `${malicious} must not dispatch`);
      assert.match(res.error, /unknown-cmd/);
    }
    await server.close();
  } finally {
    cleanup(dir);
  }
});

test('IPC: numeric or non-string cmd rejected', async () => {
  const dir = tmpRuntimeDir();
  try {
    const server = await startServer({
      peerName: 'peer-typed',
      handlers: { status: () => ({}) },
    });
    const conn = require('node:net').createConnection(require('../src/cli/ipc.js').socketPath('peer-typed'));
    const result = await new Promise((resolve, reject) => {
      let buf = '';
      conn.setEncoding('utf8');
      conn.on('data', (c) => {
        buf += c;
        if (buf.includes('\n')) {
          conn.end();
          resolve(JSON.parse(buf.split('\n')[0]));
        }
      });
      conn.on('error', reject);
      conn.on('connect', () => conn.write(JSON.stringify({ cmd: 42 }) + '\n'));
      setTimeout(() => reject(new Error('timeout')), 3000);
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /unknown-cmd/);
    await server.close();
  } finally {
    cleanup(dir);
  }
});

test('IPC: socketPath follows XMESH_RUNTIME_DIR override', () => {
  const dir = tmpRuntimeDir();
  try {
    const p = socketPath('xyz');
    assert.ok(p.startsWith(dir));
    assert.ok(p.endsWith('xyz.sock'));
  } finally {
    cleanup(dir);
  }
});
