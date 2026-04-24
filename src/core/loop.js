'use strict';

// Core loop — runtime doc §4.1. Not yet wired; pending mesh adapter (§3.2),
// context assembly (§4.2), model adapter (§4.3), and approval gates (§5.4).

class AgentLoop {
  constructor({ meshAdapter, modelAdapter, attachMode, budget, cycleCheck, gates, role }) {
    this.mesh = meshAdapter;
    this.model = modelAdapter;
    this.attach = attachMode;
    this.budget = budget;
    this.cycleCheck = cycleCheck;
    this.gates = gates;
    this.role = role;
  }

  async start() {
    throw new Error('AgentLoop.start — not implemented (runtime doc §4.1)');
  }

  async stop() {
    throw new Error('AgentLoop.stop — not implemented (runtime doc §5.5)');
  }
}

module.exports = { AgentLoop };
