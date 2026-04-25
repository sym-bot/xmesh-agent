'use strict';

const fs = require('node:fs');
const { socketsDir } = require('../runtime/paths.js');
const { sendRequest } = require('./ipc.js');

const ANSI = {
  clear: '\x1b[2J\x1b[H',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function pad(s, n) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

function listPeerNames() {
  try {
    return fs.readdirSync(socketsDir())
      .filter((f) => f.endsWith('.sock'))
      .map((f) => f.replace(/\.sock$/, ''));
  } catch {
    return [];
  }
}

async function pollPeer(name) {
  try {
    const res = await sendRequest(name, 'status');
    if (!res.ok) return { name, status: 'error', error: res.error };
    return {
      name,
      status: 'alive',
      group: res.group,
      model: res.model,
      uptimeMs: res.uptimeMs,
      emitted: res.stats?.cmbsEmitted ?? 0,
      suppressed: res.stats?.cmbsSuppressed ?? 0,
      cost: res.stats?.costUsdTotal ?? 0,
      budget: res.budget?.currentCounts || {},
      breaker: res.stats?.breaker?.state || 'closed',
    };
  } catch (e) {
    return { name, status: 'stale', error: e.message };
  }
}

function formatRow(r, opts = {}) {
  const colour = opts.color !== false;
  const c = (code) => (colour ? code : '');
  if (r.status === 'stale') {
    return `${c(ANSI.red)}${pad(r.name, 28)}  STALE  ${r.error}${c(ANSI.reset)}`;
  }
  if (r.status === 'error') {
    return `${c(ANSI.yellow)}${pad(r.name, 28)}  ERROR  ${r.error}${c(ANSI.reset)}`;
  }
  const breakerColour = r.breaker === 'closed' ? c(ANSI.green) : c(ANSI.yellow);
  const uptime = formatUptime(r.uptimeMs);
  const budget = `${r.budget.minute || 0}m/${r.budget.hour || 0}h/${r.budget.day || 0}d`;
  return [
    `${c(ANSI.bold)}${pad(r.name, 28)}${c(ANSI.reset)}`,
    `${c(ANSI.cyan)}${pad(r.model || '?', 32)}${c(ANSI.reset)}`,
    pad(r.group || '?', 18),
    pad(uptime, 8),
    pad(`E${r.emitted}/S${r.suppressed}`, 10),
    pad(`$${r.cost.toFixed(6)}`, 12),
    pad(budget, 14),
    `${breakerColour}${r.breaker}${c(ANSI.reset)}`,
  ].join('  ');
}

function formatUptime(ms) {
  if (!ms || ms < 0) return '?';
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return (s / 3600).toFixed(1) + 'h';
  return (s / 86400).toFixed(1) + 'd';
}

function formatHeader(opts = {}) {
  const colour = opts.color !== false;
  const c = (code) => (colour ? code : '');
  return [
    `${c(ANSI.dim)}${pad('PEER', 28)}`,
    pad('MODEL', 32),
    pad('GROUP', 18),
    pad('UPTIME', 8),
    pad('CMBs', 10),
    pad('COST', 12),
    pad('BUDGET m/h/d', 14),
    `BREAKER${c(ANSI.reset)}`,
  ].join('  ');
}

async function watch({ intervalMs = 2000, maxIterations = Infinity, out = process.stdout, color = true } = {}) {
  let iteration = 0;
  while (iteration < maxIterations) {
    const peers = listPeerNames();
    const results = await Promise.all(peers.map(pollPeer));
    const screen = [];
    screen.push(color ? ANSI.clear : '');
    screen.push(`xmesh-agent watch — ${peers.length} peer(s) — refresh ${intervalMs}ms — Ctrl+C to exit\n\n`);
    if (peers.length === 0) {
      screen.push('  no peers running. start one with `xmesh-agent run --config <path>`.\n');
    } else {
      screen.push(formatHeader({ color }) + '\n');
      for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) {
        screen.push(formatRow(r, { color }) + '\n');
      }
    }
    out.write(screen.join(''));
    iteration += 1;
    if (iteration >= maxIterations) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function watchOnce(opts = {}) {
  return watch({ ...opts, maxIterations: 1 });
}

module.exports = { watch, watchOnce, pollPeer, formatRow, formatHeader, formatUptime, listPeerNames };
