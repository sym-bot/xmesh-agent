'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { stateDir } = require('../runtime/paths.js');

const SCHEMA_VERSION = 1;

function defaultDir() { return stateDir(); }

function statePath(peerName, baseDir = defaultDir()) {
  return path.join(baseDir, `${peerName}.json`);
}

function emptyState(peerName) {
  return {
    schemaVersion: SCHEMA_VERSION,
    peer: peerName,
    firstSeenIso: null,
    lastUpdatedIso: null,
    totals: {
      cmbsEmitted: 0,
      cmbsSuppressed: 0,
      costUsdTotal: 0,
      runs: 0,
      modelCalls: 0,
    },
    lastRun: null,
  };
}

function loadState(peerName, baseDir) {
  const p = statePath(peerName, baseDir);
  if (!fs.existsSync(p)) return emptyState(peerName);
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      return { ...emptyState(peerName), migratedFromVersion: parsed.schemaVersion };
    }
    return { ...emptyState(peerName), ...parsed };
  } catch {
    return emptyState(peerName);
  }
}

function saveState(state, baseDir) {
  const p = statePath(state.peer, baseDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, p);
}

class StateStore {
  constructor({ peerName, baseDir = defaultDir() } = {}) {
    this.peerName = peerName;
    this.baseDir = baseDir;
    this.state = loadState(peerName, baseDir);
  }

  onRunStart({ configPath, model, group, startedIso }) {
    const now = startedIso || new Date().toISOString();
    if (!this.state.firstSeenIso) this.state.firstSeenIso = now;
    this.state.totals.runs += 1;
    this.state.lastRun = {
      startedIso: now,
      stoppedIso: null,
      configPath,
      model,
      group,
      cmbsEmitted: 0,
      cmbsSuppressed: 0,
      costUsdRun: 0,
      modelCalls: 0,
      stopReason: null,
    };
    this._touch();
  }

  recordStats(stats, extras = {}) {
    if (!this.state.lastRun) return;
    const prevRunEmit = this.state.lastRun.cmbsEmitted;
    const prevRunSupp = this.state.lastRun.cmbsSuppressed;
    const prevRunCost = this.state.lastRun.costUsdRun;
    const prevRunCalls = this.state.lastRun.modelCalls;

    const deltaEmit = Math.max(0, stats.cmbsEmitted - prevRunEmit);
    const deltaSupp = Math.max(0, stats.cmbsSuppressed - prevRunSupp);
    const deltaCost = Math.max(0, stats.costUsdTotal - prevRunCost);
    const deltaCalls = Math.max(0, (extras.modelCalls ?? 0) - prevRunCalls);

    this.state.lastRun.cmbsEmitted = stats.cmbsEmitted;
    this.state.lastRun.cmbsSuppressed = stats.cmbsSuppressed;
    this.state.lastRun.costUsdRun = stats.costUsdTotal;
    if (extras.modelCalls !== undefined) this.state.lastRun.modelCalls = extras.modelCalls;

    this.state.totals.cmbsEmitted += deltaEmit;
    this.state.totals.cmbsSuppressed += deltaSupp;
    this.state.totals.costUsdTotal += deltaCost;
    this.state.totals.modelCalls += deltaCalls;
    this._touch();
  }

  onRunStop({ stoppedIso, reason }) {
    if (!this.state.lastRun) return;
    this.state.lastRun.stoppedIso = stoppedIso || new Date().toISOString();
    this.state.lastRun.stopReason = reason || 'stop';
    this._touch();
  }

  totals() { return { ...this.state.totals }; }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }

  _touch() {
    this.state.lastUpdatedIso = new Date().toISOString();
    saveState(this.state, this.baseDir);
  }
}

module.exports = { StateStore, loadState, saveState, statePath, emptyState, SCHEMA_VERSION };
