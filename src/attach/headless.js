'use strict';

// Headless attach mode — runtime doc §3.1 + §6.1.
// Peer runs as a standalone process; no interactive human in the loop.

class HeadlessAttach {
  constructor({ role }) {
    this.role = role;
  }

  async onResponse(/* cmb */) {
    throw new Error('HeadlessAttach.onResponse — not implemented (runtime doc §3.1)');
  }
}

module.exports = { HeadlessAttach };
