'use strict';

const { loadConfig } = require('./config.js');
const { MeshAdapter } = require('../mesh/node.js');
const { AnthropicAdapter } = require('../model/anthropic.js');
const { OpenAiAdapter } = require('../model/openai.js');
const { OllamaAdapter } = require('../model/ollama.js');
const { ClaudeCodeAttach } = require('../attach/claude-code.js');
const { RotatingJsonLogger } = require('../core/logger.js');
const { StateStore } = require('../core/state-store.js');
const { shouldAdviseLegacyMigration, legacyMigrationAdvisory } = require('../runtime/paths.js');
const { AgentLoop } = require('../core/loop.js');
const { WakeBudget } = require('../safety/budget.js');
const { startServer } = require('./ipc.js');

function pickModelAdapter(modelCfg) {
  if (modelCfg.adapter === 'anthropic') {
    const apiKey = modelCfg.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY not set\n' +
        '  export ANTHROPIC_API_KEY=sk-ant-...\n' +
        '  get a key: https://console.anthropic.com/settings/keys',
      );
    }
    return new AnthropicAdapter({ apiKey, model: modelCfg.modelName });
  }
  if (modelCfg.adapter === 'openai') {
    const apiKey = modelCfg.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY not set\n' +
        '  export OPENAI_API_KEY=sk-proj-...\n' +
        '  get a key: https://platform.openai.com/api-keys',
      );
    }
    return new OpenAiAdapter({ apiKey, model: modelCfg.modelName });
  }
  if (modelCfg.adapter === 'ollama') {
    return new OllamaAdapter({
      baseUrl: modelCfg.baseUrl,
      model: modelCfg.modelName,
    });
  }
  throw new Error(
    `unsupported model adapter: ${modelCfg.adapter}\n` +
    '  supported: anthropic, openai, ollama',
  );
}

async function runFromConfig(configPath) {
  const cfg = loadConfig(configPath);
  if (cfg.attach.mode !== 'headless') {
    throw new Error(`attach mode ${cfg.attach.mode} not supported in Phase 1 (only "headless")`);
  }
  if (shouldAdviseLegacyMigration()) {
    process.stderr.write(`[run] ${legacyMigrationAdvisory()}\n`);
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

  const logger = new RotatingJsonLogger({
    filePath: cfg.logging.filePath,
    level: cfg.logging.level,
    maxFileSize: cfg.logging.maxFileSize,
    keep: cfg.logging.keep,
    peer: cfg.identity.name,
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
    responseRouting: cfg.routing.responseRouting,
    logger,
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

  const stateStore = new StateStore({ peerName: cfg.identity.name });
  stateStore.onRunStart({
    configPath,
    model: cfg.model.adapter + '/' + cfg.model.modelName,
    group: cfg.mesh.group,
  });

  await loop.start();
  process.stderr.write(
    `[run] xmesh-agent started — peer=${cfg.identity.name} group=${cfg.mesh.group} model=${cfg.model.modelName}\n`,
  );
  if (stateStore.state.totals.runs > 1) {
    const t = stateStore.state.totals;
    process.stderr.write(
      `[run] prior totals — runs=${t.runs - 1} emitted=${t.cmbsEmitted} cost=$${t.costUsdTotal.toFixed(6)} (first seen ${stateStore.state.firstSeenIso})\n`,
    );
  }

  const startedAt = Date.now();
  const statsTimer = setInterval(() => {
    stateStore.recordStats(loop.stats);
  }, 10_000);
  statsTimer.unref();

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
        lifetime: stateStore.totals(),
      }),
      cost: () => {
        stateStore.recordStats(loop.stats);
        return {
          peer: cfg.identity.name,
          costUsdTotal: loop.stats.costUsdTotal,
          cmbsEmitted: loop.stats.cmbsEmitted,
          cmbsSuppressed: loop.stats.cmbsSuppressed,
          caps: {
            perHour: cfg.budget.maxCostUsdPerHour,
            perDay: cfg.budget.maxCostUsdPerDay,
            perRun: cfg.budget.maxCostUsdPerRun,
          },
          lifetime: stateStore.totals(),
        };
      },
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
      clearInterval(statsTimer);
      stateStore.recordStats(loop.stats);
      stateStore.onRunStop({ reason: signal });
      await loop.stop();
      await ipc.close();
      logger.close();
      process.stderr.write(`[run] stopped cleanly — stats=${JSON.stringify(loop.stats)} lifetime=${JSON.stringify(stateStore.totals())}\n`);
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
