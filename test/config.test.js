'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadConfig } = require('../src/cli/config.js');

function writeToml(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmesh-agent-test-'));
  const p = path.join(dir, 'agent.toml');
  fs.writeFileSync(p, contents);
  return p;
}

test('loadConfig: parses a minimal valid config', () => {
  const p = writeToml(`
[identity]
name = "reviewer-01"

[mesh]
group = "xmesh-dev"

[role_weights]
focus = 1.0
issue = 2.0
intent = 1.5
motivation = 1.0
commitment = 1.5
perspective = 0.5
mood = 0.8

[model]
adapter = "anthropic"
`);
  const cfg = loadConfig(p);
  assert.equal(cfg.identity.name, 'reviewer-01');
  assert.equal(cfg.mesh.group, 'xmesh-dev');
  assert.equal(cfg.roleWeights.issue, 2.0);
  assert.equal(cfg.model.adapter, 'anthropic');
  assert.equal(cfg.model.modelName, 'claude-opus-4-7');
  assert.equal(cfg.attach.mode, 'headless');
});

test('loadConfig: rejects missing required sections', () => {
  const p = writeToml(`
[identity]
name = "x"
[mesh]
group = "g"
[role_weights]
focus = 1
`);
  assert.throws(() => loadConfig(p), /missing required section/);
});

test('loadConfig: rejects missing identity.name', () => {
  const p = writeToml(`
[identity]
role = "x"
[mesh]
group = "g"
[role_weights]
focus = 1
[model]
adapter = "anthropic"
`);
  assert.throws(() => loadConfig(p), /identity.*name/);
});

test('loadConfig: applies defaults for optional sections', () => {
  const p = writeToml(`
[identity]
name = "x"
[mesh]
group = "g"
[role_weights]
focus = 1
[model]
adapter = "anthropic"
`);
  const cfg = loadConfig(p);
  assert.equal(cfg.context.kLineage, 3);
  assert.equal(cfg.context.maxContextTokens, 8000);
  assert.equal(cfg.budget.maxCostUsdPerRun, 5.0);
  assert.equal(cfg.safety.cycleDepth, 5);
});
