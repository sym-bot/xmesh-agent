'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const toml = require('@iarna/toml');
const { init, buildToml, parseArgs, ROLE_PRESETS, ADAPTER_DEFAULTS } = require('../src/cli/init.js');

class SinkStream {
  constructor() { this.chunks = []; }
  write(s) { this.chunks.push(s); return true; }
  text() { return this.chunks.join(''); }
}

function tmpCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-init-'));
  const orig = process.cwd();
  process.chdir(dir);
  return { dir, restore: () => process.chdir(orig) };
}

test('parseArgs: defaults when only peer-name given', () => {
  const opts = parseArgs(['my-peer']);
  assert.equal(opts.peerName, 'my-peer');
  assert.equal(opts.role, 'generic');
  assert.equal(opts.group, 'xmesh-default');
  assert.equal(opts.adapter, 'anthropic');
  assert.equal(opts.costCap, 5);
  assert.equal(opts.force, false);
});

test('parseArgs: respects all flags', () => {
  const opts = parseArgs([
    'rev-01',
    '--role', 'reviewer',
    '--group', 'team-a',
    '--adapter', 'openai',
    '--model', 'gpt-4o',
    '--cost-cap', '10',
    '--out', '/tmp/x.toml',
    '--force',
  ]);
  assert.equal(opts.role, 'reviewer');
  assert.equal(opts.group, 'team-a');
  assert.equal(opts.adapter, 'openai');
  assert.equal(opts.model, 'gpt-4o');
  assert.equal(opts.costCap, 10);
  assert.equal(opts.output, '/tmp/x.toml');
  assert.equal(opts.force, true);
});

test('buildToml: produces valid TOML that loadConfig will accept', () => {
  const out = buildToml({
    peerName: 'reviewer-01',
    role: 'reviewer',
    group: 'team-a',
    adapter: 'openai',
    modelName: 'gpt-4o-mini',
    costCap: 5.0,
  });
  const parsed = toml.parse(out);
  assert.equal(parsed.identity.name, 'reviewer-01');
  assert.equal(parsed.identity.role, 'reviewer');
  assert.equal(parsed.mesh.group, 'team-a');
  assert.equal(parsed.model.adapter, 'openai');
  assert.equal(parsed.model.model_name, 'gpt-4o-mini');
  assert.equal(parsed.budget.max_cost_usd_per_run, 5.0);
  assert.equal(parsed.attach.mode, 'headless');
});

test('buildToml: reviewer role gets reviewer α weights', () => {
  const out = buildToml({
    peerName: 'r', role: 'reviewer', group: 'g', adapter: 'anthropic', modelName: 'x', costCap: 5,
  });
  const parsed = toml.parse(out);
  assert.equal(parsed.role_weights.issue, 2.5);
  assert.equal(parsed.role_weights.commitment, 2.0);
});

test('buildToml: unknown role falls back to generic uniform weights', () => {
  const out = buildToml({
    peerName: 'p', role: 'unknown', group: 'g', adapter: 'anthropic', modelName: 'x', costCap: 5,
  });
  const parsed = toml.parse(out);
  assert.equal(parsed.role_weights.focus, 1.0);
  assert.equal(parsed.role_weights.issue, 1.0);
});

test('init: rejects missing peer-name with exit 2', () => {
  const out = new SinkStream(); const err = new SinkStream();
  const code = init([], { out, err });
  assert.equal(code, 2);
  assert.match(err.text(), /missing <peer-name>/);
});

test('init: rejects unsupported adapter with exit 2', () => {
  const out = new SinkStream(); const err = new SinkStream();
  const code = init(['p', '--adapter', 'cohere'], { out, err });
  assert.equal(code, 2);
  assert.match(err.text(), /unsupported adapter "cohere"/);
});

test('init: rejects non-positive cost cap', () => {
  const err = new SinkStream();
  assert.equal(init(['p', '--cost-cap', '0'], { out: new SinkStream(), err }), 2);
  assert.match(err.text(), /must be a positive number/);
});

test('init: writes file to cwd by default', () => {
  const c = tmpCwd();
  try {
    const out = new SinkStream();
    const code = init(['my-peer'], { out, err: new SinkStream() });
    assert.equal(code, 0);
    assert.ok(fs.existsSync('my-peer.toml'));
    assert.match(out.text(), /wrote my-peer\.toml/);
    assert.match(out.text(), /next steps/);
  } finally { c.restore(); fs.rmSync(c.dir, { recursive: true, force: true }); }
});

test('init: refuses overwrite without --force', () => {
  const c = tmpCwd();
  try {
    init(['my-peer'], { out: new SinkStream(), err: new SinkStream() });
    const err = new SinkStream();
    const code = init(['my-peer'], { out: new SinkStream(), err });
    assert.equal(code, 1);
    assert.match(err.text(), /already exists/);
  } finally { c.restore(); fs.rmSync(c.dir, { recursive: true, force: true }); }
});

test('init: --force overwrites', () => {
  const c = tmpCwd();
  try {
    init(['p'], { out: new SinkStream(), err: new SinkStream() });
    const code = init(['p', '--force'], { out: new SinkStream(), err: new SinkStream() });
    assert.equal(code, 0);
  } finally { c.restore(); fs.rmSync(c.dir, { recursive: true, force: true }); }
});

test('init: --out writes to specified path', () => {
  const c = tmpCwd();
  try {
    const target = path.join(c.dir, 'sub', 'custom.toml');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    init(['p', '--out', target], { out: new SinkStream(), err: new SinkStream() });
    assert.ok(fs.existsSync(target));
  } finally { c.restore(); fs.rmSync(c.dir, { recursive: true, force: true }); }
});

test('init: ollama adapter scaffolds base_url comment + no API-key step', () => {
  const c = tmpCwd();
  try {
    const out = new SinkStream();
    init(['local-peer', '--adapter', 'ollama'], { out, err: new SinkStream() });
    const written = fs.readFileSync('local-peer.toml', 'utf8');
    assert.match(written, /# base_url = "http:\/\/localhost:11434"/);
    assert.ok(!written.includes('api_key'), 'no api_key for ollama');
    assert.ok(!out.text().includes('export OLLAMA'), 'no export step needed for ollama');
  } finally { c.restore(); fs.rmSync(c.dir, { recursive: true, force: true }); }
});

test('init: round-trip produces config that loadConfig accepts', () => {
  const c = tmpCwd();
  try {
    init(['rev', '--role', 'reviewer', '--adapter', 'openai'], { out: new SinkStream(), err: new SinkStream() });
    const { loadConfig } = require('../src/cli/config.js');
    const cfg = loadConfig(path.resolve('rev.toml'));
    assert.equal(cfg.identity.name, 'rev');
    assert.equal(cfg.identity.role, 'reviewer');
    assert.equal(cfg.model.adapter, 'openai');
    assert.equal(cfg.roleWeights.issue, 2.5);
  } finally { c.restore(); fs.rmSync(c.dir, { recursive: true, force: true }); }
});

test('ROLE_PRESETS: includes the 6 known roles + generic', () => {
  const expected = ['writer', 'reviewer', 'test-writer', 'auditor', 'generator', 'spec', 'generic'];
  for (const r of expected) assert.ok(ROLE_PRESETS[r], `missing preset for ${r}`);
});

test('ADAPTER_DEFAULTS: covers all three supported adapters with sensible defaults', () => {
  const { SUPPORTED_ADAPTERS } = require('../src/cli/config.js');
  for (const a of SUPPORTED_ADAPTERS) {
    assert.ok(ADAPTER_DEFAULTS[a], `init has no default for adapter ${a}`);
  }
});
