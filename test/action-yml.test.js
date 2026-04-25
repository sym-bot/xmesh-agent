'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ACTION_YML = path.join(__dirname, '..', 'action.yml');

function parseYamlMinimal(yaml) {
  const lines = yaml.split('\n');
  const out = { topLevelKeys: [], inputs: [], outputs: [], runs: null };
  let section = null;
  for (const line of lines) {
    if (line.match(/^[a-z][a-zA-Z-]*:/)) {
      const key = line.split(':')[0].trim();
      out.topLevelKeys.push(key);
      section = key;
      continue;
    }
    if (section === 'inputs' && line.match(/^ {2}[a-z][a-zA-Z-]*:/)) {
      out.inputs.push(line.split(':')[0].trim());
    }
    if (section === 'outputs' && line.match(/^ {2}[a-z][a-zA-Z-]*:/)) {
      out.outputs.push(line.split(':')[0].trim());
    }
    if (section === 'runs' && line.includes('using:')) {
      out.runs = line.split(':')[1].trim().replace(/['"]/g, '');
    }
  }
  return out;
}

test('action.yml: file exists at repo root', () => {
  assert.ok(fs.existsSync(ACTION_YML), 'action.yml must be at repo root for GitHub to find it');
});

test('action.yml: declares required composite-action top-level keys', () => {
  const yaml = fs.readFileSync(ACTION_YML, 'utf8');
  const parsed = parseYamlMinimal(yaml);
  for (const k of ['name', 'description', 'inputs', 'outputs', 'runs']) {
    assert.ok(parsed.topLevelKeys.includes(k), `missing top-level key: ${k}`);
  }
});

test('action.yml: declares the credential + scaffolding inputs', () => {
  const yaml = fs.readFileSync(ACTION_YML, 'utf8');
  const parsed = parseYamlMinimal(yaml);
  for (const i of ['config', 'role', 'adapter', 'cost-cap-usd', 'duration-seconds', 'anthropic-api-key', 'openai-api-key', 'xmesh-agent-version']) {
    assert.ok(parsed.inputs.includes(i), `missing input: ${i}`);
  }
});

test('action.yml: declares the three outputs we document', () => {
  const yaml = fs.readFileSync(ACTION_YML, 'utf8');
  const parsed = parseYamlMinimal(yaml);
  for (const o of ['config-path', 'cmbs-emitted', 'cost-usd']) {
    assert.ok(parsed.outputs.includes(o), `missing output: ${o}`);
  }
});

test('action.yml: uses composite runner', () => {
  const yaml = fs.readFileSync(ACTION_YML, 'utf8');
  const parsed = parseYamlMinimal(yaml);
  assert.equal(parsed.runs, 'composite');
});

test('action.yml: install step pins to xmesh-agent-version input', () => {
  const yaml = fs.readFileSync(ACTION_YML, 'utf8');
  assert.match(yaml, /npm install -g "@sym-bot\/xmesh-agent@\$\{\{ inputs\.xmesh-agent-version \}\}"/);
});

test('action.yml: dry-run step always runs before run step', () => {
  const yaml = fs.readFileSync(ACTION_YML, 'utf8');
  const dryRunIdx = yaml.indexOf('xmesh-agent dry-run');
  const runIdx = yaml.indexOf('xmesh-agent run --config');
  assert.ok(dryRunIdx > 0, 'dry-run step exists');
  assert.ok(runIdx > 0, 'run step exists');
  assert.ok(dryRunIdx < runIdx, 'dry-run must come before run');
});
