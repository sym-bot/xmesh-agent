'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SCHEMA, getSchema, printSchema } = require('../src/cli/schema.js');

class SinkStream {
  constructor() { this.chunks = []; }
  write(s) { this.chunks.push(s); return true; }
  text() { return this.chunks.join(''); }
}

test('SCHEMA: top-level shape matches JSON Schema 2020-12', () => {
  assert.equal(SCHEMA.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(SCHEMA.type, 'object');
  assert.deepEqual(SCHEMA.required, ['identity', 'mesh', 'role_weights', 'model']);
});

test('SCHEMA: role_weights requires all seven CAT7 fields', () => {
  const w = SCHEMA.properties.role_weights;
  assert.deepEqual(
    [...w.required].sort(),
    ['commitment', 'focus', 'intent', 'issue', 'mood', 'motivation', 'perspective'],
  );
});

test('SCHEMA: model.adapter enum matches SUPPORTED_ADAPTERS', () => {
  const { SUPPORTED_ADAPTERS } = require('../src/cli/config.js');
  const schemaEnum = SCHEMA.properties.model.properties.adapter.enum;
  assert.deepEqual([...schemaEnum].sort(), [...SUPPORTED_ADAPTERS].sort());
});

test('SCHEMA: attach.mode only headless in Phase 1', () => {
  assert.deepEqual(SCHEMA.properties.attach.properties.mode.enum, ['headless']);
});

test('SCHEMA: logging.level enum covers all LEVEL_ORDER values', () => {
  const { LEVEL_ORDER } = require('../src/core/logger.js');
  const schemaEnum = SCHEMA.properties.logging.properties.level.enum;
  assert.deepEqual([...schemaEnum].sort(), [...Object.keys(LEVEL_ORDER)].sort());
});

test('SCHEMA: no additionalProperties at top level', () => {
  assert.equal(SCHEMA.additionalProperties, false);
});

test('getSchema: returns the SCHEMA object', () => {
  assert.equal(getSchema(), SCHEMA);
});

test('printSchema: emits pretty-printed JSON to stdout', () => {
  const sink = new SinkStream();
  printSchema(sink);
  const text = sink.text();
  const parsed = JSON.parse(text);
  assert.equal(parsed.title, 'xmesh-agent agent.toml');
  assert.ok(text.includes('\n'));
});

test('SCHEMA: every example scenario in examples/scenarios parses fields that match schema keys', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const toml = require('@iarna/toml');
  const dir = path.join(__dirname, '..', 'examples', 'scenarios');
  const tomlFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.toml'));
  assert.ok(tomlFiles.length >= 3, 'at least 3 scenario TOMLs present');
  for (const f of tomlFiles) {
    const parsed = toml.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const section of Object.keys(parsed)) {
      assert.ok(
        section in SCHEMA.properties,
        `${f} has section [${section}] not declared in schema properties`,
      );
    }
  }
});
