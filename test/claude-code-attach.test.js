'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ClaudeCodeAttach,
  findClaudeConfig,
  meshChannelEntry,
  MCP_ENTRY_KEY,
} = require('../src/attach/claude-code.js');

function mockRead(map) {
  return (p) => {
    if (!(p in map)) throw new Error(`no mock for ${p}`);
    if (map[p] instanceof Error) throw map[p];
    return map[p];
  };
}

function mockExists(paths) {
  const set = new Set(paths);
  return (p) => set.has(p);
}

test('meshChannelEntry: returns null when no mcpServers section', () => {
  assert.equal(meshChannelEntry({}), null);
  assert.equal(meshChannelEntry({ mcpServers: {} }), null);
});

test('meshChannelEntry: finds entry under mcpServers', () => {
  const cfg = { mcpServers: { [MCP_ENTRY_KEY]: { command: 'node', args: ['x'] } } };
  assert.equal(meshChannelEntry(cfg).command, 'node');
});

test('meshChannelEntry: falls back to mcp-servers alias key', () => {
  const cfg = { 'mcp-servers': { [MCP_ENTRY_KEY]: { command: 'sym-mesh-channel' } } };
  assert.equal(meshChannelEntry(cfg).command, 'sym-mesh-channel');
});

test('findClaudeConfig: returns first matching candidate path', () => {
  const prev = require('node:fs').existsSync;
  require('node:fs').existsSync = () => true;
  try {
    const found = findClaudeConfig(['/a/b', '/c/d']);
    assert.equal(found, '/a/b');
  } finally {
    require('node:fs').existsSync = prev;
  }
});

test('ClaudeCodeAttach.preflight: reports missing config gracefully', async () => {
  const attach = new ClaudeCodeAttach({
    role: { name: 'reviewer-01' },
    configPath: '/no/such/config',
    _existsSync: mockExists([]),
  });
  const out = await attach.preflight();
  assert.equal(out.ok, false);
  assert.match(out.error, /not found/);
});

test('ClaudeCodeAttach.preflight: reports missing mesh-channel entry', async () => {
  const attach = new ClaudeCodeAttach({
    role: { name: 'r' },
    configPath: '/fake/claude.json',
    _existsSync: mockExists(['/fake/claude.json']),
    _readConfig: mockRead({ '/fake/claude.json': { mcpServers: {} } }),
  });
  const out = await attach.preflight();
  assert.equal(out.ok, false);
  assert.match(out.error, /no "sym-mesh-channel" MCP server/);
});

test('ClaudeCodeAttach.preflight: extracts group + nodeName from env', async () => {
  const attach = new ClaudeCodeAttach({
    role: { name: 'r' },
    configPath: '/fake/claude.json',
    _existsSync: mockExists(['/fake/claude.json']),
    _readConfig: mockRead({
      '/fake/claude.json': {
        mcpServers: {
          [MCP_ENTRY_KEY]: {
            command: 'sym-mesh-channel',
            args: [],
            env: { SYM_GROUP: 'xmesh-demo', SYM_NODE_NAME: 'claude-code-mac' },
          },
        },
      },
    }),
  });
  const out = await attach.preflight();
  assert.equal(out.ok, true);
  assert.equal(out.group, 'xmesh-demo');
  assert.equal(out.nodeName, 'claude-code-mac');
});

test('ClaudeCodeAttach.advisoryFor: flags group mismatch', async () => {
  const attach = new ClaudeCodeAttach({
    role: { name: 'reviewer-01' },
    configPath: '/fake/claude.json',
    _existsSync: mockExists(['/fake/claude.json']),
    _readConfig: mockRead({
      '/fake/claude.json': {
        mcpServers: {
          [MCP_ENTRY_KEY]: { command: 'x', env: { SYM_GROUP: 'other-group' } },
        },
      },
    }),
  });
  const check = attach.advisoryFor('xmesh-demo');
  const out = await check();
  assert.equal(out.ok, false);
  assert.match(out.advisory, /configured for group "other-group"/);
});

test('ClaudeCodeAttach.advisoryFor: flags identity collision on name', async () => {
  const attach = new ClaudeCodeAttach({
    role: { name: 'claude-code-mac' },
    configPath: '/fake/claude.json',
    _existsSync: mockExists(['/fake/claude.json']),
    _readConfig: mockRead({
      '/fake/claude.json': {
        mcpServers: {
          [MCP_ENTRY_KEY]: { command: 'x', env: { SYM_GROUP: 'xmesh-demo', SYM_NODE_NAME: 'claude-code-mac' } },
        },
      },
    }),
  });
  const check = attach.advisoryFor('xmesh-demo');
  const out = await check();
  assert.equal(out.ok, false);
  assert.match(out.advisory, /identity collision/i);
});

test('ClaudeCodeAttach.advisoryFor: passes when group matches + no collision', async () => {
  const attach = new ClaudeCodeAttach({
    role: { name: 'reviewer-01' },
    configPath: '/fake/claude.json',
    _existsSync: mockExists(['/fake/claude.json']),
    _readConfig: mockRead({
      '/fake/claude.json': {
        mcpServers: {
          [MCP_ENTRY_KEY]: { command: 'x', env: { SYM_GROUP: 'xmesh-demo', SYM_NODE_NAME: 'claude-code-mac' } },
        },
      },
    }),
  });
  const check = attach.advisoryFor('xmesh-demo');
  const out = await check();
  assert.equal(out.ok, true);
  assert.equal(out.group, 'xmesh-demo');
  assert.equal(out.nodeName, 'claude-code-mac');
});
