'use strict';

const { assembleContext, CAT7_FIELDS } = require('./context.js');
const { detectCycle } = require('../safety/cycle.js');
const { checkGates } = require('../safety/gates.js');
const { CircuitBreaker, isTransientError } = require('../safety/circuit-breaker.js');

const EMIT_CMB_TOOL = {
  name: 'emit_cmb',
  description:
    'Emit a CAT7 Cognitive Memory Block as your response on the xmesh mesh. ' +
    'Populate only the fields that serve your role; leave others empty.',
  input_schema: {
    type: 'object',
    properties: Object.fromEntries(CAT7_FIELDS.map((f) => [f, { type: 'string' }])),
    additionalProperties: false,
  },
};

function mapPendingToCmbFields(toolInput) {
  const fields = {};
  for (const f of CAT7_FIELDS) {
    const v = toolInput?.[f];
    if (typeof v === 'string' && v.trim()) fields[f] = { text: v };
  }
  return fields;
}

function cmbHasAnyField(fields) {
  return CAT7_FIELDS.some((f) => fields[f]);
}

class AgentLoop {
  constructor({
    mesh,
    model,
    role,
    budget,
    contextLimits,
    cycleDepth,
    gatePatterns,
    maxTokensPerCall = 1024,
    circuitBreaker,
    responseRouting = 'broadcast',
    logger = defaultLogger,
  }) {
    if (!mesh) throw new Error('AgentLoop: mesh required');
    if (!model) throw new Error('AgentLoop: model required');
    if (!role?.name) throw new Error('AgentLoop: role.name required');
    this.mesh = mesh;
    this.model = model;
    this.role = role;
    this.budget = budget;
    this.contextLimits = contextLimits;
    this.cycleDepth = cycleDepth;
    this.gatePatterns = gatePatterns;
    this.maxTokensPerCall = maxTokensPerCall;
    this.breaker = circuitBreaker || new CircuitBreaker();
    if (!['broadcast', 'targeted', 'auto'].includes(responseRouting)) {
      throw new Error(`AgentLoop: responseRouting must be one of broadcast | targeted | auto (got: ${responseRouting})`);
    }
    this.responseRouting = responseRouting;
    this.logger = logger;
    this._costUsdTotal = 0;
    this._cmbsEmitted = 0;
    this._cmbsSuppressed = 0;
    this._running = false;
    this._handlingCount = 0;
  }

  get stats() {
    return {
      running: this._running,
      costUsdTotal: this._costUsdTotal,
      cmbsEmitted: this._cmbsEmitted,
      cmbsSuppressed: this._cmbsSuppressed,
      inFlight: this._handlingCount,
      breaker: this.breaker.snapshot(),
    };
  }

  async start() {
    if (this._running) throw new Error('AgentLoop already running');
    await this.mesh.start();
    this.mesh.onCmbAccepted((cmb) => {
      this._handleAdmission(cmb).catch((err) => this.logger.error('loop-handle-error', err));
    });
    this.mesh.onIdentityCollision((info) => {
      this.logger.error('identity-collision', info);
      this._running = false;
    });
    this._running = true;
    this.logger.info('started', { role: this.role.name, mesh: this.mesh.identity });
  }

  async stop() {
    if (!this._running) return;
    this._running = false;
    await this.mesh.stop();
    this.logger.info('stopped', this.stats);
  }

  async _handleAdmission(admittedCmb) {
    if (!this._running) return;
    this._handlingCount += 1;
    try {
      const wake = this.budget?.tryConsume();
      if (wake && !wake.allowed) {
        this.logger.warn('wake-budget-exceeded', { reason: wake.reason, counts: wake.counts });
        return;
      }
      if (wake?.warn) {
        this.logger.warn('wake-budget-soft-warn', { window: wake.warn, counts: wake.counts });
      }

      if (!this.breaker.canAttempt()) {
        this.logger.warn('circuit-open-skip', {
          admittedId: admittedCmb.id,
          breaker: this.breaker.snapshot(),
        });
        this._cmbsSuppressed += 1;
        return;
      }

      const ctx = await assembleContext({
        admittedCmb,
        role: this.role,
        mesh: this.mesh,
        limits: this.contextLimits,
      });

      let response;
      try {
        response = await this.model.call({
          systemPrompt: ctx.systemPrompt,
          messages: ctx.messages,
          maxTokens: this.maxTokensPerCall,
          tools: [EMIT_CMB_TOOL],
        });
        this.breaker.recordSuccess();
      } catch (err) {
        this.breaker.recordFailure();
        const transient = isTransientError(err);
        this.logger.error('model-call-failed', {
          admittedId: admittedCmb.id,
          transient,
          message: err.message,
          breaker: this.breaker.snapshot(),
        });
        this._cmbsSuppressed += 1;
        if (transient && this.breaker.backoffMs() > 0) {
          await new Promise((r) => setTimeout(r, this.breaker.backoffMs()));
        }
        return;
      }

      this._costUsdTotal += response.usage?.costUsd || 0;
      this.logger.info('model-call', {
        admittedId: admittedCmb.id,
        tokens: response.usage,
        stopReason: response.stopReason,
      });

      const toolCall = (response.toolCalls || []).find((t) => t.name === 'emit_cmb');
      if (!toolCall) {
        this.logger.info('no-emit', { admittedId: admittedCmb.id, modelText: response.text?.slice(0, 120) });
        return;
      }
      const fields = mapPendingToCmbFields(toolCall.input);
      if (!cmbHasAnyField(fields)) {
        this.logger.warn('empty-cmb-suppressed', { admittedId: admittedCmb.id });
        this._cmbsSuppressed += 1;
        return;
      }

      const proposed = {
        createdBy: this.role.name,
        fields,
        ancestors: [admittedCmb.id, ...(admittedCmb.ancestors || [])],
      };
      const lineageCache = await this._buildLineageCache(proposed.ancestors, this.cycleDepth);
      const cycle = detectCycle({
        proposed,
        resolveAncestors: (id) => lineageCache.get(id) || null,
        selfName: this.role.name,
        depth: this.cycleDepth,
      });
      if (cycle.suspect) {
        this.logger.warn('cycle-suspect', cycle);
        this._cmbsSuppressed += 1;
        return;
      }

      const gateResult = checkGates({ fields }, this.gatePatterns);
      if (!gateResult.passed) {
        this.logger.warn('approval-gate-blocked', { admittedId: admittedCmb.id, hits: gateResult.hits });
        this._cmbsSuppressed += 1;
        return;
      }

      const targetPeer = this._chooseTarget(admittedCmb);
      if (targetPeer) {
        await this.mesh.send({ to: targetPeer, fields, parents: [{ key: admittedCmb.id }] });
      } else {
        await this.mesh.observe({ fields, parents: [{ key: admittedCmb.id }] });
      }
      this._cmbsEmitted += 1;
      this.logger.info('emitted', {
        admittedId: admittedCmb.id,
        kind: targetPeer ? 'send' : 'observe',
        to: targetPeer,
        fields: Object.keys(fields),
      });
    } finally {
      this._handlingCount -= 1;
    }
  }

  _chooseTarget(admittedCmb) {
    if (this.responseRouting === 'broadcast') return null;
    const originator = admittedCmb?.createdBy || admittedCmb?.source;
    if (!originator) return null;
    if (this.responseRouting === 'targeted') {
      return this._peerReachable(originator) ? originator : null;
    }
    const peers = (() => { try { return this.mesh.peers(); } catch { return []; } })();
    if (peers.length <= 2) return null;
    return this._peerReachable(originator) ? originator : null;
  }

  _peerReachable(name) {
    try {
      const peers = this.mesh.peers();
      return peers.some((p) => p.name === name);
    } catch {
      return false;
    }
  }

  async _buildLineageCache(rootIds, depth) {
    const cache = new Map();
    const queue = rootIds.map((id) => ({ id, d: 1 }));
    while (queue.length > 0) {
      const { id, d } = queue.shift();
      if (d > depth) continue;
      if (cache.has(id)) continue;
      const cmb = await this.mesh.resolveCmb(id);
      if (!cmb) continue;
      cache.set(id, { createdBy: cmb.source, ancestors: cmb.ancestors || [] });
      for (const parent of cmb.ancestors || []) {
        queue.push({ id: parent, d: d + 1 });
      }
    }
    return cache;
  }
}

const defaultLogger = {
  info: (evt, data) => process.stderr.write(`[info] ${evt} ${JSON.stringify(data || {})}\n`),
  warn: (evt, data) => process.stderr.write(`[warn] ${evt} ${JSON.stringify(data || {})}\n`),
  error: (evt, data) => process.stderr.write(`[error] ${evt} ${JSON.stringify(data || data?.message || '')}\n`),
};

module.exports = { AgentLoop, EMIT_CMB_TOOL, mapPendingToCmbFields };
