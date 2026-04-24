'use strict';

const { loadConfig } = require('./config.js');
const { MeshAdapter } = require('../mesh/node.js');
const { AnthropicAdapter } = require('../model/anthropic.js');
const { OpenAiAdapter } = require('../model/openai.js');
const { OllamaAdapter } = require('../model/ollama.js');
const { ClaudeCodeAttach } = require('../attach/claude-code.js');
const { AgentLoop } = require('../core/loop.js');
const { WakeBudget } = require('../safety/budget.js');
const { startServer } = require('./ipc.js');

function pickModelAdapter(modelCfg) {
  if (modelCfg.adapter === 'anthropic') {
    return new AnthropicAdapter({
      apiKey: modelCfg.apiKey || process.env.ANTHROPIC_API_KEY,
      model: modelCfg.modelName,
    });
  }
  if (modelCfg.adapter === 'openai') {
    return new OpenAiAdapter({
      apiKey: modelCfg.apiKey || process.env.OPENAI_API_KEY,
      model: modelCfg.modelName,
    });
  }
  if (modelCfg.adapter === 'ollama') {
    return new OllamaAdapter({
      baseUrl: modelCfg.baseUrl,
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

  const ccAttach = new ClaudeCodeAttach({ role: { name: cfg.identity.name } });
  const advisoryCheck = ccAttach.advisoryFor(cfg.mesh.group);
  const advisoryResult = await advisoryCheck();
  if (advisoryResult.ok) {
    process.stderr.write(
      `[run] claude-code advisory: group="${advisoryResult.group}" nodeName="${advisoryResult.nodeName}" — mesh-channel compatible\n`,
    );
  } else if (advisoryResult.advisory) {
    process.stderr.write(`[run] claude-code advisory: ${advisoryResult.advisory}\n`);
  }

  await loop.start();
  process.stderr.write(
    `[run] xmesh-agent started — peer=${cfg.identity.name} group=${cfg.mesh.group} model=${cfg.model.modelName}\n`,
  );

  const startedAt = Date.now();

  const ipc = await startServer({
    peerName: cfg.identity.name,
    handlers: {
      status: () => ({
        peer: cfg.identity.name,
        group: cfg.mesh.group,
        model: cfg.model.modelName,
        uptimeMs: Date.now() - startedAt,
        stats: loop.stats,
        budget: {
          maxWakesPerMinute: cfg.budget.maxWakesPerMinute,
          maxWakesPerHour: cfg.budget.maxWakesPerHour,
          maxWakesPerDay: cfg.budget.maxWakesPerDay,
          currentCounts: budget.peek(),
        },
      }),
      cost: () => ({
        peer: cfg.identity.name,
        costUsdTotal: loop.stats.costUsdTotal,
        cmbsEmitted: loop.stats.cmbsEmitted,
        cmbsSuppressed: loop.stats.cmbsSuppressed,
        caps: {
          perHour: cfg.budget.maxCostUsdPerHour,
          perDay: cfg.budget.maxCostUsdPerDay,
          perRun: cfg.budget.maxCostUsdPerRun,
        },
      }),
      trace: async (req) => {
        const cmbId = req.cmbId;
        if (!cmbId) throw new Error('trace requires cmbId');
        const chain = [];
        const visited = new Set();
        const queue = [{ id: cmbId, depth: 0 }];
        while (queue.length > 0) {
          const { id, depth } = queue.shift();
          if (visited.has(id) || depth > 20) continue;
          visited.add(id);
          const cmb = await mesh.resolveCmb(id);
          if (!cmb) { chain.push({ id, depth, missing: true }); continue; }
          chain.push({ id, depth, source: cmb.source, fields: cmb.fields, ancestors: cmb.ancestors });
          for (const a of cmb.ancestors || []) queue.push({ id: a, depth: depth + 1 });
        }
        return { root: cmbId, chain };
      },
      stop: () => {
        setImmediate(() => shutdown('IPC_STOP'));
        return { accepted: true };
      },
    },
  });
  process.stderr.write(`[run] ipc socket: ${ipc.sockPath}\n`);

  const shutdown = async (signal) => {
    process.stderr.write(`[run] ${signal} received — draining\n`);
    try {
      await loop.stop();
      await ipc.close();
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
