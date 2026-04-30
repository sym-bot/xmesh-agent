'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { baseDir, keysDir, trustedKeysDir, stateDir, socketsDir } = require('../runtime/paths.js');
const { loadMeta } = require('../safety/identity.js');
const { loadState } = require('../core/state-store.js');

const NODE_VERSION = process.versions.node;
const NODE_MAJOR = parseInt(NODE_VERSION.split('.')[0], 10);

function listIfDir(p) {
  try { return fs.readdirSync(p); }
  catch { return []; }
}

async function pingSocket(sockPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(sockPath)) return resolve({ alive: false, reason: 'socket file missing' });
    const conn = net.createConnection(sockPath);
    const timeout = setTimeout(() => { conn.destroy(); resolve({ alive: false, reason: 'no response (5s timeout)' }); }, 5000);
    conn.setEncoding('utf8');
    let buf = '';
    conn.on('connect', () => conn.write(JSON.stringify({ cmd: 'status' }) + '\n'));
    conn.on('data', (chunk) => {
      buf += chunk;
      if (buf.includes('\n')) {
        clearTimeout(timeout);
        conn.end();
        try {
          const r = JSON.parse(buf.split('\n')[0]);
          resolve({ alive: r.ok, peer: r.peer, group: r.group, model: r.model, stats: r.stats });
        } catch (e) { resolve({ alive: false, reason: 'invalid response: ' + e.message }); }
      }
    });
    conn.on('error', (err) => { clearTimeout(timeout); resolve({ alive: false, reason: err.code || err.message }); });
  });
}

async function doctor({ out = process.stdout, err = process.stderr } = {}) {
  out.write('xmesh-agent doctor — local mesh health check\n\n');

  out.write(`runtime\n`);
  out.write(`  node:    v${NODE_VERSION}${NODE_MAJOR < 18 ? '  ⚠ requires >=18' : ''}\n`);
  out.write(`  baseDir: ${baseDir()}\n`);
  out.write(`  exists:  ${fs.existsSync(baseDir()) ? 'yes' : 'no (no peers configured yet)'}\n\n`);

  const keyFiles = listIfDir(keysDir()).filter((f) => f.endsWith('.key'));
  out.write(`identity keys (~/.xmesh/keys/)\n`);
  if (keyFiles.length === 0) {
    out.write('  no keys found\n');
    out.write('  (Phase 1: keys are not yet wire-required; generate with `xmesh-agent keygen <peer>`)\n\n');
  } else {
    for (const f of keyFiles) {
      const peer = f.replace(/\.key$/, '');
      const meta = loadMeta(peer);
      const stat = fs.statSync(path.join(keysDir(), f));
      const mode = (stat.mode & 0o777).toString(8);
      const fpr = meta?.fingerprint || '?';
      const modeWarn = mode !== '600' ? `  ⚠ permissions ${mode} (expected 600)` : '';
      out.write(`  ${peer}  keyprint=${fpr}  mode=${mode}${modeWarn}\n`);
    }
    out.write('\n');
  }

  out.write(`trusted-keys (~/.xmesh/trusted-keys/<group>/)\n`);
  const groups = listIfDir(trustedKeysDir());
  if (groups.length === 0) {
    out.write('  no trusted-key groups configured\n\n');
  } else {
    for (const g of groups) {
      const trusted = listIfDir(path.join(trustedKeysDir(), g)).filter((f) => f.endsWith('.json'));
      out.write(`  group "${g}": ${trusted.length} trusted peer(s)\n`);
    }
    out.write('\n');
  }

  out.write(`persistent state (~/.xmesh/state/)\n`);
  const stateFiles = listIfDir(stateDir()).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'));
  if (stateFiles.length === 0) {
    out.write('  no peers have run yet\n\n');
  } else {
    for (const f of stateFiles) {
      const peer = f.replace(/\.json$/, '');
      const s = loadState(peer);
      const t = s.totals;
      out.write(`  ${peer}  runs=${t.runs}  emitted=${t.cmbsEmitted}  cost=$${t.costUsdTotal.toFixed(6)}  first-seen=${s.firstSeenIso || 'never'}\n`);
    }
    out.write('\n');
  }

  out.write(`running peers (IPC sockets in ${socketsDir()})\n`);
  const sockFiles = listIfDir(socketsDir()).filter((f) => f.endsWith('.sock'));
  if (sockFiles.length === 0) {
    out.write('  no peers running\n\n');
  } else {
    for (const f of sockFiles) {
      const peer = f.replace(/\.sock$/, '');
      const sockPath = path.join(socketsDir(), f);
      const result = await pingSocket(sockPath);
      if (result.alive) {
        const s = result.stats || {};
        out.write(`  ${peer}  ALIVE  group=${result.group} model=${result.model} emitted=${s.cmbsEmitted ?? '?'} cost=$${(s.costUsdTotal ?? 0).toFixed(6)}\n`);
      } else {
        out.write(`  ${peer}  STALE  ${result.reason}  ⚠ stop+remove the socket: \`rm ${sockPath}\`\n`);
      }
    }
    out.write('\n');
  }

  out.write(`environment\n`);
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MISTRAL_API_KEY', 'OLLAMA_HOST', 'SYM_RELAY_URL', 'SYM_RELAY_TOKEN']) {
    const present = process.env[k];
    out.write(`  ${k}: ${present ? `set (${present.length} chars)` : 'not set'}\n`);
  }
  out.write('\n');

  const issues = [];
  if (NODE_MAJOR < 18) issues.push('upgrade Node to >=18');
  for (const f of keyFiles) {
    const stat = fs.statSync(path.join(keysDir(), f));
    if ((stat.mode & 0o777) !== 0o600) issues.push(`tighten ~/.xmesh/keys/${f} to mode 600`);
  }
  for (const f of sockFiles) {
    const result = await pingSocket(path.join(socketsDir(), f));
    if (!result.alive) issues.push(`stale socket: rm ${path.join(socketsDir(), f)}`);
  }

  if (issues.length === 0) {
    out.write('summary: HEALTHY\n');
    return { ok: true, issues: [] };
  }
  out.write(`summary: ${issues.length} issue(s) to address:\n`);
  for (const i of issues) out.write(`  - ${i}\n`);
  err.write('\nrun the suggested fixes and re-run `xmesh-agent doctor` to verify\n');
  return { ok: false, issues };
}

module.exports = { doctor };
