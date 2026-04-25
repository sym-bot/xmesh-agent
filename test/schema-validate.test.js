'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/cli/schema-validate.js');

test('validate: type mismatch', () => {
  const errs = validate('not-a-number', { type: 'integer' });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /expected integer, got string/);
});

test('validate: required property missing', () => {
  const errs = validate({}, { type: 'object', required: ['name'], properties: { name: { type: 'string' } } });
  assert.ok(errs.some((e) => e.includes('missing required property: name')));
});

test('validate: additionalProperties false catches unknown key', () => {
  const errs = validate(
    { name: 'x', mystery: 1 },
    { type: 'object', additionalProperties: false, properties: { name: { type: 'string' } } },
  );
  assert.ok(errs.some((e) => e.includes('unknown property: mystery')));
});

test('validate: enum mismatch', () => {
  const errs = validate('cohere', { type: 'string', enum: ['anthropic', 'openai', 'ollama'] });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /expected one of \[anthropic, openai, ollama\]/);
});

test('validate: minimum violation', () => {
  const errs = validate(0, { type: 'integer', minimum: 1 });
  assert.match(errs[0], /expected >= 1, got 0/);
});

test('validate: minLength violation', () => {
  const errs = validate('', { type: 'string', minLength: 1 });
  assert.match(errs[0], /expected length >= 1/);
});

test('validate: nested path is reported in error', () => {
  const errs = validate(
    { mesh: { group: 42 } },
    { type: 'object', properties: { mesh: { type: 'object', properties: { group: { type: 'string' } } } } },
  );
  assert.ok(errs.some((e) => e.startsWith('mesh.group:')), `got: ${errs.join(', ')}`);
});

test('validate: integer rejects non-integer number', () => {
  const errs = validate(1.5, { type: 'integer' });
  assert.equal(errs.length, 1);
});

test('validate: real agent.toml SCHEMA accepts a known-good scenario', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const toml = require('@iarna/toml');
  const { SCHEMA } = require('../src/cli/schema.js');
  const tomlPath = path.join(__dirname, '..', 'examples', 'scenarios', 'reviewer.toml');
  const parsed = toml.parse(fs.readFileSync(tomlPath, 'utf8'));
  const errs = validate(parsed, SCHEMA);
  assert.deepEqual(errs, [], `expected no errors, got: ${errs.join('\n')}`);
});

test('validate: real SCHEMA accepts every bundled scenario', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const toml = require('@iarna/toml');
  const { SCHEMA } = require('../src/cli/schema.js');
  const dir = path.join(__dirname, '..', 'examples', 'scenarios');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.toml'));
  for (const f of files) {
    const parsed = toml.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const errs = validate(parsed, SCHEMA);
    assert.deepEqual(errs, [], `${f} produced errors: ${errs.join('\n')}`);
  }
});

test('validate: SCHEMA rejects a config with an unknown section', () => {
  const { SCHEMA } = require('../src/cli/schema.js');
  const bad = {
    identity: { name: 'p', role: 'reviewer' },
    mesh: { group: 'g' },
    role_weights: { focus: 1, issue: 1, intent: 1, motivation: 1, commitment: 1, perspective: 1, mood: 1 },
    model: { adapter: 'anthropic' },
    typo_section: { foo: 'bar' },
  };
  const errs = validate(bad, SCHEMA);
  assert.ok(errs.some((e) => e.includes('typo_section')));
});

test('validate: SCHEMA rejects an unknown adapter enum', () => {
  const { SCHEMA } = require('../src/cli/schema.js');
  const bad = {
    identity: { name: 'p', role: 'reviewer' },
    mesh: { group: 'g' },
    role_weights: { focus: 1, issue: 1, intent: 1, motivation: 1, commitment: 1, perspective: 1, mood: 1 },
    model: { adapter: 'cohere' },
  };
  const errs = validate(bad, SCHEMA);
  assert.ok(errs.some((e) => e.includes('model.adapter') && e.includes('anthropic')));
});
