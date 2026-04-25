'use strict';

const fs = require('node:fs');
const toml = require('@iarna/toml');
const { loadConfig } = require('./config.js');
const { AnthropicAdapter } = require('../model/anthropic.js');
const { OpenAiAdapter } = require('../model/openai.js');
const { OllamaAdapter } = require('../model/ollama.js');
const { ClaudeCodeAttach } = require('../attach/claude-code.js');
const { checkRoleSanity } = require('../core/role-sanity.js');
const { SCHEMA } = require('./schema.js');
const { validate } = require('./schema-validate.js');

async function dryRun(configPath, { out = process.stdout, err = process.stderr } = {}) {
  const checks = [];
  const record = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    out.write(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}\n`);
  };

  out.write('xmesh-agent dry-run — no mesh join, no model call, no CMB emission\n');
  out.write(`config: ${configPath}\n\n`);

  let cfg;
  try {
    cfg = loadConfig(configPath);
    record('load config', true, `peer=${cfg.identity.name} group=${cfg.mesh.group} adapter=${cfg.model.adapter}`);
  } catch (e) {
    record('load config', false, e.message);
    return { ok: false, checks };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = toml.parse(raw);
    const errors = validate(parsed, SCHEMA);
    if (errors.length === 0) {
      record('schema validation', true, 'config matches xmesh-agent agent.toml schema');
    } else {
      const summary = errors.length > 3
        ? `${errors.slice(0, 3).join('; ')}; +${errors.length - 3} more`
        : errors.join('; ');
      record('schema validation', false, summary);
    }
  } catch (e) {
    record('schema validation', false, `validator error: ${e.message}`);
  }

  try {
    const ccAttach = new ClaudeCodeAttach({ role: { name: cfg.identity.name } });
    const advisory = await ccAttach.advisoryFor(cfg.mesh.group)();
    if (advisory.ok) record('claude-code advisory', true, `group=${advisory.group} name=${advisory.nodeName}`);
    else if (advisory.advisory) record('claude-code advisory', true, `(info) ${advisory.advisory}`);
  } catch (e) {
    record('claude-code advisory', false, e.message);
  }

  try {
    if (cfg.model.adapter === 'anthropic') {
      const hasKey = Boolean(cfg.model.apiKey || process.env.ANTHROPIC_API_KEY);
      if (!hasKey) {
        record('model adapter', false, 'ANTHROPIC_API_KEY not set — run `export ANTHROPIC_API_KEY=sk-ant-...` (get a key at https://console.anthropic.com/settings/keys)');
      } else {
        new AnthropicAdapter({ apiKey: cfg.model.apiKey || process.env.ANTHROPIC_API_KEY, model: cfg.model.modelName });
        record('model adapter', true, `anthropic ${cfg.model.modelName} (key present)`);
      }
    } else if (cfg.model.adapter === 'openai') {
      const hasKey = Boolean(cfg.model.apiKey || process.env.OPENAI_API_KEY);
      if (!hasKey) {
        record('model adapter', false, 'OPENAI_API_KEY not set — run `export OPENAI_API_KEY=sk-proj-...` (get a key at https://platform.openai.com/api-keys)');
      } else {
        new OpenAiAdapter({ apiKey: cfg.model.apiKey || process.env.OPENAI_API_KEY, model: cfg.model.modelName });
        record('model adapter', true, `openai ${cfg.model.modelName} (key present)`);
      }
    } else if (cfg.model.adapter === 'ollama') {
      const a = new OllamaAdapter({ baseUrl: cfg.model.baseUrl, model: cfg.model.modelName });
      record('model adapter', true, `ollama ${cfg.model.modelName} baseUrl=${a.baseUrl} (verify ollama is running: \`curl ${a.baseUrl}/api/tags\`)`);
    }
  } catch (e) {
    record('model adapter', false, e.message);
  }

  const weightKeys = Object.keys(cfg.roleWeights);
  const required = ['focus', 'issue', 'intent', 'motivation', 'commitment', 'perspective', 'mood'];
  const missing = required.filter((k) => !weightKeys.includes(k));
  if (missing.length > 0) record('SVAF α_f weights', false, `missing fields: ${missing.join(', ')}`);
  else record('SVAF α_f weights', true, required.map((k) => `${k}=${cfg.roleWeights[k]}`).join(' '));

  const b = cfg.budget;
  if (b.maxCostUsdPerRun <= 0) record('budget sanity', false, 'maxCostUsdPerRun must be > 0');
  else if (b.maxWakesPerMinute <= 0) record('budget sanity', false, 'maxWakesPerMinute must be > 0');
  else record('budget sanity', true, `wakes=${b.maxWakesPerMinute}/min cost=$${b.maxCostUsdPerRun}/run`);

  const roleCheck = checkRoleSanity({ role: cfg.identity.role, weights: cfg.roleWeights });
  if (!roleCheck.knownRole) {
    record('role sanity', true, `(info) role "${cfg.identity.role}" not in known-role table — skipping check`);
  } else if (roleCheck.ok) {
    record('role sanity', true, `role "${cfg.identity.role}" α_f emphasis matches expectations`);
  } else {
    const summary = roleCheck.advisories.map((a) => `${a.field}=${a.weight}`).join(', ');
    record('role sanity', true, `(warn) role "${cfg.identity.role}" α_f mismatch: ${summary}`);
  }

  if (cfg.safety.cycleDepth < 1) record('cycle depth', false, 'cycleDepth < 1 disables detection');
  else record('cycle depth', true, String(cfg.safety.cycleDepth));

  if (cfg.attach.mode !== 'headless') record('attach mode', false, `"${cfg.attach.mode}" not supported in Phase 1`);
  else record('attach mode', true, 'headless');

  const allOk = checks.every((c) => c.ok);
  out.write(`\n${allOk ? 'PASS' : 'FAIL'} — ${checks.filter((c) => c.ok).length}/${checks.length} checks passed\n`);
  if (!allOk) {
    err.write('\ndry-run found issues — fix the FAIL line(s) above before running `xmesh-agent run`\n');
    err.write('  see docs/getting-started.md for setup or `xmesh-agent init <peer>` to scaffold a fresh config\n');
  } else {
    out.write('\nready to run: `xmesh-agent run --config ' + configPath + '`\n');
  }
  return { ok: allOk, checks };
}

module.exports = { dryRun };
