'use strict';

const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const { socketsDir } = require('../runtime/paths.js');

function socketDir() {
  const base = socketsDir();
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function socketPath(peerName) {
  return path.join(socketDir(), `${peerName}.sock`);
}

function listAvailablePeers() {
  try {
    return fs.readdirSync(socketDir())
      .filter((f) => f.endsWith('.sock'))
      .map((f) => f.replace(/\.sock$/, ''))
      .sort();
  } catch {
    return [];
  }
}

function writeJson(conn, obj) {
  conn.write(JSON.stringify(obj) + '\n');
}

function startServer({ peerName, handlers }) {
  const sockPath = socketPath(peerName);
  try { fs.unlinkSync(sockPath); } catch {}
  const connections = new Set();
  const server = net.createServer((conn) => {
    connections.add(conn);
    let buf = '';
    conn.setEncoding('utf8');
    conn.on('close', () => connections.delete(conn));
    conn.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        let req;
        try { req = JSON.parse(line); }
        catch {
          writeJson(conn, { ok: false, error: 'invalid-json' });
          continue;
        }
        if (typeof req.cmd !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, req.cmd)) {
          writeJson(conn, { ok: false, error: `unknown-cmd: ${req.cmd}` });
          continue;
        }
        const handler = handlers[req.cmd];
        if (typeof handler !== 'function') {
          writeJson(conn, { ok: false, error: `unknown-cmd: ${req.cmd}` });
          continue;
        }
        (async () => handler(req))()
          .then((res) => writeJson(conn, { ok: true, ...res }))
          .catch((err) => writeJson(conn, { ok: false, error: err.message }));
      }
    });
    conn.on('error', () => {});
  });
  server.unref();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(sockPath, () => {
      try { fs.chmodSync(sockPath, 0o600); } catch {}
      resolve({
        server,
        sockPath,
        close: () => new Promise((res) => {
          for (const c of connections) c.destroy();
          connections.clear();
          server.close(() => {
            try { fs.unlinkSync(sockPath); } catch {}
            res();
          });
        }),
      });
    });
  });
}

async function sendRequest(peerName, cmd, args = {}) {
  const sockPath = socketPath(peerName);
  if (!fs.existsSync(sockPath)) {
    const available = listAvailablePeers();
    let hint;
    if (available.length === 0) {
      hint = '  no peers are currently running on this host\n' +
             '  start one: `xmesh-agent run --config <agent.toml>`';
    } else {
      hint = `  available peers on this host: ${available.join(', ')}\n` +
             '  see live status: `xmesh-agent watch`';
    }
    throw new Error(`no running peer named "${peerName}" (looked at ${sockPath})\n${hint}`);
  }
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(sockPath);
    let buf = '';
    const timeout = setTimeout(() => {
      conn.destroy();
      reject(new Error('ipc timeout'));
    }, 5000);
    conn.setEncoding('utf8');
    conn.on('data', (chunk) => {
      buf += chunk;
      const idx = buf.indexOf('\n');
      if (idx !== -1) {
        clearTimeout(timeout);
        const line = buf.slice(0, idx);
        conn.end();
        try { resolve(JSON.parse(line)); }
        catch (err) { reject(err); }
      }
    });
    conn.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    conn.on('connect', () => writeJson(conn, { cmd, ...args }));
  });
}

module.exports = { startServer, sendRequest, socketPath, socketDir, listAvailablePeers };
