'use strict';

const fs = require('node:fs');
const toml = require('@iarna/toml');

const REQUIRED_SECTIONS = ['identity', 'mesh', 'role_weights', 'model'];
const SUPPORTED_ADAPTERS = ['anthropic', 'openai', 'ollama'];

function loadConfig(path) {
  const raw = fs.readFileSync(path, 'utf8');
  const parsed = toml.parse(raw);
  for (const s of REQUIRED_SECTIONS) {
    if (!parsed[s]) throw new Error(`agent.toml missing required section: [${s}]`);
  }
  if (!parsed.identity.name) throw new Error('agent.toml [identity] requires name');
  if (!parsed.model.adapter) throw new Error('agent.toml [model] requires adapter');
  if (!SUPPORTED_ADAPTERS.includes(parsed.model.adapter)) {
    throw new Error(
      `agent.toml [model] adapter "${parsed.model.adapter}" not supported; supported: ${SUPPORTED_ADAPTERS.join(', ')}`,
    );
  }
  return normalise(parsed);
}

function normalise(p) {
  return {
    identity: {
      name: p.identity.name,
      role: p.identity.role || p.identity.name,
    },
    mesh: {
      group: p.mesh.group || 'default',
      relay: p.mesh.relay || null,
      relayToken: p.mesh.relay_token || null,
    },
    roleWeights: { ...p.role_weights },
    model: {
      adapter: p.model.adapter,
      apiKey: p.model.api_key || null,
      baseUrl: p.model.base_url || null,
      modelName: p.model.model_name || 'claude-opus-4-7',
      maxTokensPerCall: p.model.max_tokens_per_call || 1024,
    },
    context: {
      kLineage: p.context?.k_lineage ?? 3,
      nOwn: p.context?.n_own ?? 5,
      nGroup: p.context?.n_group ?? 10,
      maxContextTokens: p.context?.max_context_tokens ?? 8000,
    },
    budget: {
      maxWakesPerMinute: p.budget?.max_wakes_per_minute ?? 10,
      maxWakesPerHour: p.budget?.max_wakes_per_hour ?? 100,
      maxWakesPerDay: p.budget?.max_wakes_per_day ?? 1000,
      maxCostUsdPerHour: p.budget?.max_cost_usd_per_hour ?? 1.0,
      maxCostUsdPerDay: p.budget?.max_cost_usd_per_day ?? 10.0,
      maxCostUsdPerRun: p.budget?.max_cost_usd_per_run ?? 5.0,
    },
    safety: {
      cycleDepth: p.safety?.cycle_depth ?? 5,
      approvalGates: p.safety?.approval_gates || 'default',
    },
    attach: {
      mode: p.attach?.mode || 'headless',
    },
  };
}

module.exports = { loadConfig, SUPPORTED_ADAPTERS };
