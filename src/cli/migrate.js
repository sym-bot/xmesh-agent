'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { baseDir, legacyBaseDir } = require('../runtime/paths.js');

function detectMigration() {
  const target = baseDir();
  const source = legacyBaseDir();
  const targetExists = fs.existsSync(target);
  const sourceExists = fs.existsSync(source);
  return {
    source,
    target,
    sourceExists,
    targetExists,
    needed: sourceExists && !targetExists,
    conflict: sourceExists && targetExists,
    nothing: !sourceExists && !targetExists,
  };
}

function inventory(source) {
  const counts = { keys: 0, trustedKeys: 0, state: 0, sockets: 0, other: 0 };
  if (!fs.existsSync(source)) return counts;
  walk(source, (rel) => {
    if (rel.startsWith('keys/')) counts.keys += 1;
    else if (rel.startsWith('trusted-keys/')) counts.trustedKeys += 1;
    else if (rel.startsWith('state/')) counts.state += 1;
    else if (rel.endsWith('.sock')) counts.sockets += 1;
    else counts.other += 1;
  });
  return counts;
}

function walk(dir, visit, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), visit, rel);
    else visit(rel);
  }
}

function migrate({ apply = false, out = process.stdout, err = process.stderr } = {}) {
  const det = detectMigration();
  if (det.nothing) {
    out.write('migrate: nothing to do — no legacy or current runtime dir found\n');
    return 0;
  }
  if (det.targetExists && !det.sourceExists) {
    out.write(`migrate: nothing to do — already on ${det.target}\n`);
    return 0;
  }
  if (det.conflict) {
    err.write(`migrate: conflict — both ${det.source} AND ${det.target} exist.\n`);
    err.write('  Refusing to merge automatically. Resolve manually:\n');
    err.write(`    1. Inspect both directories\n`);
    err.write(`    2. Move any keys/trusted-keys/state from ${det.source} into ${det.target}\n`);
    err.write(`    3. Remove ${det.source} when satisfied\n`);
    return 1;
  }

  const counts = inventory(det.source);
  out.write(`migrate plan:\n`);
  out.write(`  from: ${det.source}\n`);
  out.write(`  to:   ${det.target}\n`);
  out.write(`  contents: keys=${counts.keys} trustedKeys=${counts.trustedKeys} state=${counts.state} sockets=${counts.sockets} other=${counts.other}\n`);

  if (!apply) {
    out.write('\nthis was a dry-run — pass --apply to perform the rename\n');
    out.write(`equivalent shell command: mv ${det.source} ${det.target}\n`);
    return 0;
  }

  if (counts.sockets > 0) {
    err.write(`migrate: refusing to move while ${counts.sockets} socket file(s) present in ${det.source} — stop running peers first\n`);
    return 1;
  }

  fs.mkdirSync(path.dirname(det.target), { recursive: true });
  try {
    fs.renameSync(det.source, det.target);
  } catch (e) {
    err.write(`migrate: rename failed: ${e.message}\n`);
    return 1;
  }
  out.write('\nmigrate: ok — rename complete\n');
  return 0;
}

module.exports = { migrate, detectMigration, inventory };
