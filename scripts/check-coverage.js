#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const THRESHOLD = parseFloat(process.env.COVERAGE_THRESHOLD || '80');

const proc = spawnSync(
  'node',
  ['--test', '--experimental-test-coverage', ...glob('test/*.test.js')],
  { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] }
);

const output = (proc.stdout || '') + (proc.stderr || '');
process.stdout.write(output);

if (proc.status !== 0) {
  process.exit(proc.status || 1);
}

const summary = output.match(/^#\s*all files\s+\|\s*([\d.]+)\s*\|/m);
if (!summary) {
  console.error('check-coverage: could not parse "all files" summary line from --test-coverage output');
  process.exit(1);
}

const linePct = parseFloat(summary[1]);
console.log(`\ncheck-coverage: line coverage ${linePct.toFixed(2)}% (threshold ${THRESHOLD}%)`);

if (linePct < THRESHOLD) {
  console.error(`::error::line coverage ${linePct.toFixed(2)}% is below threshold ${THRESHOLD}%`);
  process.exit(1);
}

function glob(pattern) {
  // Tiny shell-free glob — only handles "dir/*.suffix" patterns we use here.
  const m = pattern.match(/^([^*]+)\/\*\.(.+)$/);
  if (!m) return [pattern];
  const fs = require('node:fs');
  const path = require('node:path');
  const [, dir, suffix] = m;
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.' + suffix))
    .map((f) => path.join(dir, f))
    .sort();
}
