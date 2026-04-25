'use strict';

const fs = require('node:fs');
const toml = require('@iarna/toml');

const REQUIRED_SECTIONS = ['identity', 'mesh', 'role_weights', 'model'];
const SUPPORTED_ADAPTERS = ['anthropic', 'openai', 'ollama'];
const REQUIRED_CAT7_FIELDS = ['focus', 'issue', 'intent', 'motivation', 'commitment', 'perspective', 'mood'];

function loadConfig(path) {
  let raw;
  try { raw = fs.readFileSync(path, 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(
        `agent.toml not found at ${path}\n` +
        `  hint: scaffold a starter config with \`xmesh-agent init <peer-name>\``,
      );
    }
    if (e.code === 'EACCES') {
      throw new Error(`agent.toml at ${path} is not readable (permission denied)`);
    }
    throw e;
  }
  let parsed;
  try { parsed = toml.parse(raw); }
  catch (e) {
    throw new Error(
      `agent.toml at ${path} is not valid TOML: ${e.message}\n` +
      `  hint: validate with \`xmesh-agent dry-run --config ${path}\` or check syntax at https://toml.io`,
    );
  }
  for (const s of REQUIRED_SECTIONS) {
    if (!parsed[s]) {
      throw new Error(
        `agent.toml missing required section: [${s}]\n` +
        `  hint: see examples/agent.toml.example or run \`xmesh-agent schema\` for the full schema`,
      );
    }
  }
  if (!parsed.identity.name) {
    throw new Error(
      'agent.toml [identity] requires `name` (your peer\'s unique name on the mesh)\n' +
      '  hint: pick a stable identifier like "reviewer-01" — it must be unique within the mesh group',
    );
  }
  if (!parsed.model.adapter) {
    throw new Error(
      `agent.toml [model] requires \`adapter\` (one of: ${SUPPORTED_ADAPTERS.join(', ')})`,
    );
  }
  if (!SUPPORTED_ADAPTERS.includes(parsed.model.adapter)) {
    throw new Error(
      `agent.toml [model] adapter "${parsed.model.adapter}" not supported\n` +
      `  supported: ${SUPPORTED_ADAPTERS.join(', ')}\n` +
      `  hint: contributions for new adapters welcome — see CONTRIBUTING.md`,
    );
  }
  const missingWeights = REQUIRED_CAT7_FIELDS.filter((f) => !(f in (parsed.role_weights || {})));
  if (missingWeights.length > 0) {
    throw new Error(
      `agent.toml [role_weights] missing CAT7 field(s): ${missingWeights.join(', ')}\n` +
      `  required: ${REQUIRED_CAT7_FIELDS.join(', ')} (all seven, each as a number)`,
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
    routing: {
      responseRouting: p.routing?.response_routing || 'broadcast',
    },
    attach: {
      mode: p.attach?.mode || 'headless',
    },
    logging: {
      level: p.logging?.level || 'info',
      filePath: p.logging?.file_path || null,
      maxFileSize: p.logging?.max_file_size ?? 5 * 1024 * 1024,
      keep: p.logging?.keep ?? 5,
    },
  };
}

module.exports = { loadConfig, SUPPORTED_ADAPTERS };
