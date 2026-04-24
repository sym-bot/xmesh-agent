'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrate, inventory } = require('../src/cli/migrate.js');

class SinkStream {
  constructor() { this.chunks = []; }
  write(s) { this.chunks.push(s); return true; }
  text() { return this.chunks.join(''); }
}

function tmpHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-migrate-'));
  const orig = os.homedir();
  Object.defineProperty(os, 'homedir', { value: () => dir, configurable: true });
  delete process.env.XMESH_RUNTIME_DIR;
  delete process.env.XMESH_AGENT_RUNTIME_DIR;
  return { dir, restore: () => Object.defineProperty(os, 'homedir', { value: () => orig, configurable: true }) };
}

function seed(dir, layout) {
  for (const [rel, contents] of Object.entries(layout)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
}

test('inventory: counts files by category', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-inv-'));
  try {
    seed(tmp, {
      'keys/alice.key': 'k1',
      'keys/alice.pub': 'k2',
      'keys/alice.json': 'k3',
      'trusted-keys/demo/alice.json': 't1',
      'state/alice.json': 's1',
      'alice.sock': 'sock',
      'something-else.txt': 'other',
    });
    const counts = inventory(tmp);
    assert.equal(counts.keys, 3);
    assert.equal(counts.trustedKeys, 1);
    assert.equal(counts.state, 1);
    assert.equal(counts.sockets, 1);
    assert.equal(counts.other, 1);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('migrate: nothing to do when neither dir exists', () => {
  const { dir, restore } = tmpHome();
  try {
    const out = new SinkStream();
    const code = migrate({ out, err: new SinkStream() });
    assert.equal(code, 0);
    assert.match(out.text(), /nothing to do/);
  } finally { restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('migrate: nothing to do when already on target', () => {
  const { dir, restore } = tmpHome();
  try {
    fs.mkdirSync(path.join(dir, '.xmesh'), { recursive: true });
    const out = new SinkStream();
    const code = migrate({ out, err: new SinkStream() });
    assert.equal(code, 0);
    assert.match(out.text(), /already on/);
  } finally { restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('migrate: dry-run shows plan + does not move', () => {
  const { dir, restore } = tmpHome();
  try {
    seed(path.join(dir, '.xmesh-agent'), {
      'keys/alice.key': 'k',
      'keys/alice.pub': 'p',
      'state/alice.json': '{}',
    });
    const out = new SinkStream();
    const code = migrate({ out, err: new SinkStream() });
    assert.equal(code, 0);
    assert.match(out.text(), /migrate plan/);
    assert.match(out.text(), /from:.*\.xmesh-agent/);
    assert.match(out.text(), /to:.*\.xmesh/);
    assert.match(out.text(), /keys=2/);
    assert.match(out.text(), /state=1/);
    assert.match(out.text(), /this was a dry-run/);
    assert.ok(fs.existsSync(path.join(dir, '.xmesh-agent')), 'source still exists');
    assert.ok(!fs.existsSync(path.join(dir, '.xmesh')), 'target not created');
  } finally { restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('migrate: --apply performs the rename', () => {
  const { dir, restore } = tmpHome();
  try {
    seed(path.join(dir, '.xmesh-agent'), {
      'keys/alice.key': 'k',
      'state/alice.json': '{}',
    });
    const out = new SinkStream();
    const code = migrate({ apply: true, out, err: new SinkStream() });
    assert.equal(code, 0);
    assert.match(out.text(), /migrate: ok/);
    assert.ok(!fs.existsSync(path.join(dir, '.xmesh-agent')), 'source removed');
    assert.ok(fs.existsSync(path.join(dir, '.xmesh', 'keys', 'alice.key')), 'target has data');
  } finally { restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('migrate: refuses to apply when sockets present (running peers)', () => {
  const { dir, restore } = tmpHome();
  try {
    seed(path.join(dir, '.xmesh-agent'), {
      'keys/alice.key': 'k',
      'alice.sock': 'sock',
    });
    const err = new SinkStream();
    const code = migrate({ apply: true, out: new SinkStream(), err });
    assert.equal(code, 1);
    assert.match(err.text(), /socket file/);
    assert.ok(fs.existsSync(path.join(dir, '.xmesh-agent')), 'no rename when sockets present');
  } finally { restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('migrate: conflict — both dirs exist refuses with manual instructions', () => {
  const { dir, restore } = tmpHome();
  try {
    fs.mkdirSync(path.join(dir, '.xmesh-agent', 'keys'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.xmesh', 'keys'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.xmesh-agent', 'keys', 'a.key'), 'old');
    fs.writeFileSync(path.join(dir, '.xmesh', 'keys', 'b.key'), 'new');
    const err = new SinkStream();
    const code = migrate({ apply: true, out: new SinkStream(), err });
    assert.equal(code, 1);
    assert.match(err.text(), /conflict/);
    assert.match(err.text(), /Refusing to merge/);
  } finally { restore(); fs.rmSync(dir, { recursive: true, force: true }); }
});
