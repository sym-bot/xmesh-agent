'use strict';

const DEFAULT_SERVICE_TYPE = '_sym._tcp';

function defaultNodeFactory(cfg) {
  const { SymNode } = require('@sym-bot/sym');
  return new SymNode(cfg);
}

function resolveServiceType(room) {
  if (!room || room === 'default') return DEFAULT_SERVICE_TYPE;
  return `_${room}._tcp`;
}

class MeshAdapter {
  constructor(opts) {
    this.nodeName = opts.nodeName;
    this.room = opts.room || 'default';
    this.relay = opts.relay || null;
    this.relayToken = opts.relayToken || null;
    this.categoryWeights = opts.categoryWeights;
    this.cognitiveProfile = opts.cognitiveProfile || null;
    this.svafFreshnessSeconds = opts.svafFreshnessSeconds || 7200;
    // Adaptive integration timescale (liquid substrate): the SVAF memory-decay timescale
    // shortens after recent guarded/rejected verdicts and lengthens when stable, instead of
    // a fixed-gain integrator. Enabled by default in the runtime (tune in deployment).
    this.svafAdaptiveTimescale = opts.svafAdaptiveTimescale ?? true;
    this.svafMinFreshnessSeconds = opts.svafMinFreshnessSeconds ?? 600;
    this.svafReactivity = opts.svafReactivity ?? 0.9;

    this._nodeFactory = opts._nodeFactory || defaultNodeFactory;
    this._node = null;
    this._started = false;
    this._cmbAcceptedHandler = null;
    this._identityCollisionHandler = null;
  }

  get identity() {
    return {
      name: this.nodeName,
      room: this.room,
      nodeId: this._node?.nodeId || null,
      started: this._started,
    };
  }

  async start() {
    if (this._started) throw new Error('MeshAdapter already started');
    this._node = this._nodeFactory({
      name: this.nodeName,
      cognitiveProfile: this.cognitiveProfile,
      svafFieldWeights: this.categoryWeights,
      svafFreshnessSeconds: this.svafFreshnessSeconds,
      svafAdaptiveTimescale: this.svafAdaptiveTimescale,
      svafMinFreshnessSeconds: this.svafMinFreshnessSeconds,
      svafReactivity: this.svafReactivity,
      discoveryServiceType: resolveServiceType(this.room),
      room: this.room,
      relay: this.relay,
      relayToken: this.relayToken,
      silent: true,
    });
    this._wireEvents();
    if (typeof this._node.start === 'function') {
      await this._node.start();
    }
    this._started = true;
    return this.identity;
  }

  async stop() {
    if (!this._started) return;
    if (typeof this._node.stop === 'function') {
      await this._node.stop();
    }
    this._started = false;
    this._node = null;
  }

  onCmbAccepted(handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    this._cmbAcceptedHandler = handler;
  }

  onIdentityCollision(handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    this._identityCollisionHandler = handler;
  }

  async observe({ categories, parents, payload }) {
    this._assertStarted();
    const opts = {};
    if (parents) opts.parents = parents;
    if (payload !== undefined && payload !== null) opts.payload = payload;
    return this._node.remember(categories, opts);
  }

  async send({ to, categories, parents, payload }) {
    this._assertStarted();
    const peerId = this._resolvePeerName(to);
    if (!peerId) throw new Error(`unknown peer: ${to}`);
    const opts = { to: peerId };
    if (parents) opts.parents = parents;
    if (payload !== undefined && payload !== null) opts.payload = payload;
    return this._node.remember(categories, opts);
  }

  async resolveCmb(cmbId) {
    this._assertStarted();
    if (!this._node._store || typeof this._node._store.get !== 'function') return null;
    const entry = this._node._store.get(cmbId);
    if (!entry) return null;
    return this._normalizeEntry(entry);
  }

  async recall(query) {
    this._assertStarted();
    const entries = this._node.recall(query || '');
    return entries.map((e) => this._normalizeEntry(e));
  }

  peers() {
    this._assertStarted();
    const map = this._node._peers;
    if (!map || typeof map.values !== 'function') return [];
    return Array.from(map.values()).map((p) => ({
      id: p.peerId || p.id,
      name: p.name,
    }));
  }

  _wireEvents() {
    this._node.on('cmb-accepted', (entry) => {
      if (!this._cmbAcceptedHandler) return;
      if (entry?.cmb?.createdBy === this.nodeName) return;
      if (entry?.source === this.nodeName) return;
      this._cmbAcceptedHandler(this._normalizeEntry(entry));
    });
    this._node.on('identity-collision', (info) => {
      if (!this._identityCollisionHandler) return;
      this._identityCollisionHandler(info);
    });
  }

  _resolvePeerName(name) {
    const map = this._node._peers;
    if (!map || typeof map.values !== 'function') return null;
    for (const peer of map.values()) {
      if (peer.name === name) return peer.peerId || peer.id;
    }
    return null;
  }

  _normalizeEntry(entry) {
    const cmb = entry?.cmb || null;
    return {
      id: entry?.key || cmb?.key || null,
      source: entry?.source || cmb?.createdBy || null,
      createdBy: cmb?.createdBy || entry?.source || null,
      categories: cmb?.categories || {},
      payload: cmb?.payload ?? null,
      ancestors: cmb?.lineage?.ancestors || [],
      parents: cmb?.lineage?.parents || [],
      content: entry?.content || null,
      timestamp: entry?.timestamp || cmb?.timestamp || null,
      raw: entry,
    };
  }

  _assertStarted() {
    if (!this._started) throw new Error('MeshAdapter not started — call start() first');
  }
}

module.exports = { MeshAdapter, resolveServiceType };
