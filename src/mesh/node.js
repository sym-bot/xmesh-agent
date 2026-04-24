'use strict';

// Mesh adapter — wraps @sym-bot/sym SymNode. Runtime doc §3.1 + §3.2.

class MeshAdapter {
  constructor({ nodeName, group, relay, relayToken, fieldWeights, cognitiveProfile }) {
    this.nodeName = nodeName;
    this.group = group;
    this.relay = relay;
    this.relayToken = relayToken;
    this.fieldWeights = fieldWeights;
    this.cognitiveProfile = cognitiveProfile;
    this._node = null;
  }

  async start() {
    throw new Error('MeshAdapter.start — not implemented (runtime doc §3.3)');
  }

  async stop() {
    throw new Error('MeshAdapter.stop — not implemented (runtime doc §5.5)');
  }

  onCmbAccepted(/* handler */) {
    throw new Error('MeshAdapter.onCmbAccepted — not implemented (runtime doc §4.1)');
  }

  async send(/* { to, fields } */) {
    throw new Error('MeshAdapter.send — not implemented (runtime doc §4.4)');
  }

  async observe(/* { fields } */) {
    throw new Error('MeshAdapter.observe — not implemented (runtime doc §4.4)');
  }

  async resolveCmb(/* cmbId */) {
    throw new Error('MeshAdapter.resolveCmb — not implemented (runtime doc §4.2)');
  }
}

module.exports = { MeshAdapter };
