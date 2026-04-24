'use strict';

const { loadConfig } = require('./config.js');
const { MeshAdapter } = require('../mesh/node.js');
const { AnthropicAdapter } = require('../model/anthropic.js');
const { AgentLoop } = require('../core/loop.js');
const { WakeBudget } = require('../safety/budget.js');

function pickModelAdapter(modelCfg) {
  if (modelCfg.adapter === 'anthropic') {
    return new AnthropicAdapter({
      apiKey: modelCfg.apiKey || process.env.ANTHROPIC_API_KEY,
      model: modelCfg.modelName,
    });
  }
  throw new Error(`unsupported model adapter: ${modelCfg.adapter}`);
}

async function runFromConfig(configPath) {
  const cfg = loadConfig(configPath);
  if (cfg.attach.mode !== 'headless') {
    throw new Error(`attach mode ${cfg.attach.mode} not supported in Phase 1 (only "headless")`);
  }

  const mesh = new MeshAdapter({
    nodeName: cfg.identity.name,
    group: cfg.mesh.group,
    relay: cfg.mesh.relay,
    relayToken: cfg.mesh.relayToken,
    fieldWeights: cfg.roleWeights,
    cognitiveProfile: `xmesh-agent peer — role ${cfg.identity.role}`,
  });

  const model = pickModelAdapter(cfg.model);
  const budget = new WakeBudget({
    maxWakesPerMinute: cfg.budget.maxWakesPerMinute,
    maxWakesPerHour: cfg.budget.maxWakesPerHour,
    maxWakesPerDay: cfg.budget.maxWakesPerDay,
  });

  const loop = new AgentLoop({
    mesh,
    model,
    role: {
      name: cfg.identity.name,
      description: `Role: ${cfg.identity.role}`,
      weights: cfg.roleWeights,
    },
    budget,
    contextLimits: cfg.context,
    cycleDepth: cfg.safety.cycleDepth,
    maxTokensPerCall: cfg.model.maxTokensPerCall,
  });

  await loop.start();
  process.stderr.write(
    `[run] xmesh-agent started — peer=${cfg.identity.name} group=${cfg.mesh.group} model=${cfg.model.modelName}\n`,
  );

  const shutdown = async (signal) => {
    process.stderr.write(`[run] ${signal} received — draining\n`);
    try {
      await loop.stop();
      process.stderr.write(`[run] stopped cleanly — stats=${JSON.stringify(loop.stats)}\n`);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[run] shutdown error: ${err.message}\n`);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const budgetTimer = setInterval(() => {
    if (loop.stats.costUsdTotal >= cfg.budget.maxCostUsdPerRun) {
      process.stderr.write(
        `[run] per-run cost cap ${cfg.budget.maxCostUsdPerRun} USD exceeded (spent ${loop.stats.costUsdTotal.toFixed(4)}) — shutting down\n`,
      );
      clearInterval(budgetTimer);
      shutdown('BUDGET_CAP');
    }
  }, 5000);
  budgetTimer.unref();

  return { loop, mesh, model };
}

module.exports = { runFromConfig, pickModelAdapter };
