'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const MCP_ENTRY_KEY = 'sym-mesh-channel';
const DEFAULT_CLAUDE_CONFIG_PATHS = [
  path.join(os.homedir(), '.claude.json'),
  path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
];

function findClaudeConfig(candidates = DEFAULT_CLAUDE_CONFIG_PATHS) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readConfig(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try { return JSON.parse(raw); }
  catch (err) { throw new Error(`claude config at ${filePath} is not valid JSON: ${err.message}`); }
}

function meshChannelEntry(config) {
  const servers = config.mcpServers || config['mcp-servers'] || {};
  return servers[MCP_ENTRY_KEY] || null;
}

class ClaudeCodeAttach {
  constructor({ role, configPath, _readConfig = readConfig, _existsSync = fs.existsSync } = {}) {
    this.role = role;
    this._configPath = configPath;
    this._readConfig = _readConfig;
    this._existsSync = _existsSync;
  }

  async preflight() {
    const resolved = this._configPath || findClaudeConfig();
    if (!resolved) {
      return { ok: false, error: 'no Claude config found in default locations' };
    }
    if (!this._existsSync(resolved)) {
      return { ok: false, error: `Claude config not found at ${resolved}` };
    }
    let cfg;
    try { cfg = this._readConfig(resolved); }
    catch (err) { return { ok: false, error: err.message }; }

    const entry = meshChannelEntry(cfg);
    if (!entry) {
      return {
        ok: false,
        error: `Claude config has no "${MCP_ENTRY_KEY}" MCP server entry; install @sym-bot/mesh-channel first`,
      };
    }
    const entryGroup = entry.env?.SYM_GROUP;
    const entryName = entry.env?.SYM_NODE_NAME;
    return {
      ok: true,
      configPath: resolved,
      group: entryGroup || 'default',
      nodeName: entryName || null,
      cmd: entry.command,
      args: entry.args || [],
    };
  }

  advisoryFor(meshGroup) {
    return async () => {
      const pre = await this.preflight();
      if (!pre.ok) return { ok: false, advisory: pre.error };
      if (pre.group !== meshGroup) {
        return {
          ok: false,
          advisory:
            `Claude Code mesh-channel is configured for group "${pre.group}" ` +
            `but this xmesh-agent peer is on group "${meshGroup}". ` +
            `Update SYM_GROUP in ${pre.configPath} [mcp-servers.${MCP_ENTRY_KEY}.env] to match.`,
        };
      }
      if (pre.nodeName && pre.nodeName === this.role?.name) {
        return {
          ok: false,
          advisory:
            `Claude Code mesh-channel uses SYM_NODE_NAME="${pre.nodeName}" ` +
            `which collides with this xmesh-agent peer's role name. ` +
            `Identity collision would cause exit(2) on start — rename one of them.`,
        };
      }
      return { ok: true, group: pre.group, nodeName: pre.nodeName || '(hostname-derived)' };
    };
  }
}

module.exports = {
  ClaudeCodeAttach,
  findClaudeConfig,
  meshChannelEntry,
  DEFAULT_CLAUDE_CONFIG_PATHS,
  MCP_ENTRY_KEY,
};
