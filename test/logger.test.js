'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RotatingJsonLogger, LEVEL_ORDER, sanitise } = require('../src/core/logger.js');

function tmpLogPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-log-test-'));
  return path.join(dir, 'peer.log');
}

class SinkStream {
  constructor() { this.chunks = []; }
  write(s) { this.chunks.push(s); return true; }
  text() { return this.chunks.join(''); }
}

function readLines(p) {
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

test('LEVEL_ORDER: standard severity ordering', () => {
  assert.ok(LEVEL_ORDER.error < LEVEL_ORDER.warn);
  assert.ok(LEVEL_ORDER.warn < LEVEL_ORDER.info);
  assert.ok(LEVEL_ORDER.info < LEVEL_ORDER.debug);
});

test('sanitise: drops raw + cmb keys (noisy dumps)', () => {
  const cleaned = sanitise({ ok: true, raw: 'huge-response', cmb: { fields: {} }, keep: 'x' });
  assert.ok(!('raw' in cleaned));
  assert.ok(!('cmb' in cleaned));
  assert.equal(cleaned.keep, 'x');
  assert.equal(cleaned.ok, true);
});

test('sanitise: recurses into nested objects and arrays', () => {
  const cleaned = sanitise({ a: [{ raw: 'drop', keep: 1 }, { keep: 2 }] });
  assert.deepEqual(cleaned.a, [{ keep: 1 }, { keep: 2 }]);
});

test('RotatingJsonLogger: writes JSON line per event to file and stderr', () => {
  const logPath = tmpLogPath();
  const stderr = new SinkStream();
  const log = new RotatingJsonLogger({ filePath: logPath, peer: 'p1', stderr });
  log.info('started', { a: 1 });
  log.warn('slow', { b: 2 });
  log.close();
  const lines = readLines(logPath);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].evt, 'started');
  assert.equal(lines[0].level, 'info');
  assert.equal(lines[0].peer, 'p1');
  assert.deepEqual(lines[0].data, { a: 1 });
  assert.equal(lines[1].level, 'warn');
  const stderrLines = stderr.text().split('\n').filter(Boolean);
  assert.equal(stderrLines.length, 2);
  assert.equal(JSON.parse(stderrLines[0]).evt, 'started');
});

test('RotatingJsonLogger: honours level filter', () => {
  const logPath = tmpLogPath();
  const log = new RotatingJsonLogger({ filePath: logPath, peer: 'p', level: 'warn', stderr: new SinkStream() });
  log.info('should-drop');
  log.warn('should-keep');
  log.error('should-keep');
  log.close();
  const lines = readLines(logPath);
  assert.equal(lines.length, 2);
  assert.ok(!lines.some((l) => l.evt === 'should-drop'));
});

test('RotatingJsonLogger: Error value is serialised with message + stack', () => {
  const logPath = tmpLogPath();
  const log = new RotatingJsonLogger({ filePath: logPath, peer: 'p', stderr: new SinkStream() });
  log.error('boom', new Error('nope'));
  log.close();
  const lines = readLines(logPath);
  assert.equal(lines[0].data.message, 'nope');
  assert.ok(lines[0].data.stack.includes('Error'));
});

test('RotatingJsonLogger: rotates file when size exceeded', () => {
  const logPath = tmpLogPath();
  const log = new RotatingJsonLogger({
    filePath: logPath,
    peer: 'p',
    maxFileSize: 200,
    keep: 2,
    stderr: new SinkStream(),
  });
  const big = 'x'.repeat(90);
  for (let i = 0; i < 6; i += 1) log.info('fill', { big });
  log.close();
  assert.ok(fs.existsSync(`${logPath}.1`), 'rotated file .1 exists');
  const rotatedSize = fs.statSync(`${logPath}.1`).size;
  assert.ok(rotatedSize > 0, 'rotated file has content');
});

test('RotatingJsonLogger: no file when filePath is null (stderr only)', () => {
  const stderr = new SinkStream();
  const log = new RotatingJsonLogger({ filePath: null, peer: 'p', stderr });
  log.info('stderr-only', { x: 1 });
  log.close();
  assert.ok(stderr.text().includes('stderr-only'));
});
