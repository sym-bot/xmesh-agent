'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dryRun } = require('../src/cli/dry-run.js');

class SinkStream {
  constructor() { this.chunks = []; }
  write(s) { this.chunks.push(s); return true; }
  text() { return this.chunks.join(''); }
}

function writeToml(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-dry-'));
  const p = path.join(dir, 'agent.toml');
  fs.writeFileSync(p, contents);
  return p;
}

function baseToml(adapter, extra = '') {
  return `
[identity]
name = "dry-peer"

[mesh]
group = "dry-group"

[role_weights]
focus = 1
issue = 1
intent = 1
motivation = 1
commitment = 1
perspective = 1
mood = 1

[model]
adapter = "${adapter}"
${extra}
`;
}

test('dryRun: passes with ollama adapter (no API key needed)', async () => {
  const p = writeToml(baseToml('ollama', 'model_name = "llama3.2:3b"'));
  const out = new SinkStream();
  const err = new SinkStream();
  const result = await dryRun(p, { out, err });
  assert.equal(result.ok, true);
  assert.ok(out.text().includes('PASS'));
  assert.ok(result.checks.find((c) => c.name === 'model adapter').ok);
});

test('dryRun: flags missing ANTHROPIC_API_KEY for anthropic adapter', async () => {
  const p = writeToml(baseToml('anthropic'));
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const out = new SinkStream();
    const result = await dryRun(p, { out, err: new SinkStream() });
    assert.equal(result.ok, false);
    assert.ok(result.checks.find((c) => c.name === 'model adapter' && !c.ok));
  } finally {
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  }
});

test('dryRun: passes with anthropic adapter when key is present', async () => {
  const p = writeToml(baseToml('anthropic'));
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake';
  try {
    const result = await dryRun(p, { out: new SinkStream(), err: new SinkStream() });
    assert.equal(result.ok, true);
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  }
});

test('dryRun: flags invalid config as load failure', async () => {
  const p = writeToml('# missing required sections');
  const out = new SinkStream();
  const result = await dryRun(p, { out, err: new SinkStream() });
  assert.equal(result.ok, false);
  assert.ok(result.checks[0].name === 'load config' && !result.checks[0].ok);
});

test('dryRun: flags missing SVAF field weight at load config (CAT7 completeness check)', async () => {
  const toml = `
[identity]
name = "p"
[mesh]
group = "g"
[role_weights]
focus = 1
issue = 1
intent = 1
motivation = 1
commitment = 1
perspective = 1
# mood missing
[model]
adapter = "ollama"
`;
  const p = writeToml(toml);
  const result = await dryRun(p, { out: new SinkStream(), err: new SinkStream() });
  assert.equal(result.ok, false);
  const w = result.checks.find((c) => c.name === 'load config');
  assert.ok(w && !w.ok);
  assert.match(w.detail, /mood/, 'error message names the missing field');
  assert.match(w.detail, /mood/);
});

test('dryRun: records peer/group/adapter on load-config line', async () => {
  const p = writeToml(baseToml('ollama'));
  const out = new SinkStream();
  await dryRun(p, { out, err: new SinkStream() });
  assert.match(out.text(), /peer=dry-peer/);
  assert.match(out.text(), /group=dry-group/);
  assert.match(out.text(), /adapter=ollama/);
});
