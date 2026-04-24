'use strict';

const SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://sym.bot/schema/xmesh-agent/agent.toml.json',
  title: 'xmesh-agent agent.toml',
  description:
    'Configuration for a single xmesh-agent peer. Loaded at `xmesh-agent run --config <path>`. ' +
    'See sym-strategy/architecture/xmesh_runtime_v0.1.md for field semantics.',
  type: 'object',
  required: ['identity', 'mesh', 'role_weights', 'model'],
  additionalProperties: false,
  properties: {
    identity: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, description: 'Unique peer name on the mesh (also SYM_NODE_NAME).' },
        role: { type: 'string', description: 'Human-readable role label for logs + context preamble.' },
      },
    },
    mesh: {
      type: 'object',
      additionalProperties: false,
      properties: {
        group: { type: 'string', default: 'default', description: 'Mesh group (Bonjour service-type segment). Peers only discover within the same group.' },
        relay: { type: ['string', 'null'], description: 'Optional WebSocket relay URL for WAN mode.' },
        relay_token: { type: ['string', 'null'], description: 'Relay authentication token (or omit; read SYM_RELAY_TOKEN env).' },
      },
    },
    role_weights: {
      type: 'object',
      required: ['focus', 'issue', 'intent', 'motivation', 'commitment', 'perspective', 'mood'],
      additionalProperties: false,
      description: 'SVAF α_f weights per CAT7 field. Values > 1 emphasise, < 1 de-emphasise.',
      properties: {
        focus: { type: 'number', minimum: 0 },
        issue: { type: 'number', minimum: 0 },
        intent: { type: 'number', minimum: 0 },
        motivation: { type: 'number', minimum: 0 },
        commitment: { type: 'number', minimum: 0 },
        perspective: { type: 'number', minimum: 0 },
        mood: { type: 'number', minimum: 0 },
      },
    },
    model: {
      type: 'object',
      required: ['adapter'],
      additionalProperties: false,
      properties: {
        adapter: { type: 'string', enum: ['anthropic', 'openai', 'ollama'] },
        api_key: { type: ['string', 'null'], description: 'Inline API key (prefer env: ANTHROPIC_API_KEY / OPENAI_API_KEY).' },
        base_url: { type: ['string', 'null'], description: 'Ollama adapter only — override http://localhost:11434.' },
        model_name: { type: 'string', description: 'Vendor-specific model ID (e.g. claude-opus-4-7, gpt-4o, llama3.2:3b).' },
        max_tokens_per_call: { type: 'integer', minimum: 1, default: 1024 },
      },
    },
    context: {
      type: 'object',
      additionalProperties: false,
      properties: {
        k_lineage: { type: 'integer', minimum: 0, default: 3 },
        n_own: { type: 'integer', minimum: 0, default: 5 },
        n_group: { type: 'integer', minimum: 0, default: 10 },
        max_context_tokens: { type: 'integer', minimum: 256, default: 8000 },
      },
    },
    budget: {
      type: 'object',
      additionalProperties: false,
      properties: {
        max_wakes_per_minute: { type: 'integer', minimum: 1, default: 10 },
        max_wakes_per_hour: { type: 'integer', minimum: 1, default: 100 },
        max_wakes_per_day: { type: 'integer', minimum: 1, default: 1000 },
        max_cost_usd_per_hour: { type: 'number', minimum: 0, default: 1.0 },
        max_cost_usd_per_day: { type: 'number', minimum: 0, default: 10.0 },
        max_cost_usd_per_run: { type: 'number', minimum: 0, default: 5.0 },
      },
    },
    safety: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cycle_depth: { type: 'integer', minimum: 1, default: 5 },
        approval_gates: { type: 'string', enum: ['default', 'none'], default: 'default' },
      },
    },
    routing: {
      type: 'object',
      additionalProperties: false,
      properties: {
        response_routing: { type: 'string', enum: ['broadcast', 'targeted', 'auto'], default: 'broadcast' },
      },
    },
    attach: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { type: 'string', enum: ['headless'], default: 'headless' },
      },
    },
    logging: {
      type: 'object',
      additionalProperties: false,
      properties: {
        level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'], default: 'info' },
        file_path: { type: ['string', 'null'], description: 'Log file path; omit for stderr-only.' },
        max_file_size: { type: 'integer', minimum: 1024, default: 5242880 },
        keep: { type: 'integer', minimum: 1, default: 5 },
      },
    },
  },
});

function getSchema() {
  return SCHEMA;
}

function printSchema(out = process.stdout) {
  out.write(JSON.stringify(SCHEMA, null, 2) + '\n');
}

module.exports = { SCHEMA, getSchema, printSchema };
