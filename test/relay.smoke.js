'use strict';

// WAN-relay smoke — two peers join the same group via a WebSocket relay
// (LAN-Bonjour disabled by using relay-only mode). Skip-gated on
// SYM_RELAY_URL + SYM_RELAY_TOKEN env vars. Run via `npm run smoke`.
//
// Purpose: verify runtime doc §5.2 "WAN relay is optional" claim on the
// real hosted relay at sym-relay.onrender.com (or any relay the operator
// points at). This is the cross-network equivalent of live.smoke.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { MeshAdapter } = require('../src/mesh/node.js');

const RELAY_URL = process.env.SYM_RELAY_URL;
const RELAY_TOKEN = process.env.SYM_RELAY_TOKEN;
const skip = !RELAY_URL || !RELAY_TOKEN;

function uniqueGroup() {
  return 'xmesh-relay-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

test(
  'relay smoke: two peers exchange a CMB via WebSocket relay',
  { skip, timeout: 60_000 },
  async () => {
    const group = uniqueGroup();
    const weights = { focus: 2.0, issue: 1.5, intent: 1.5, motivation: 1.0, commitment: 1.5, perspective: 0.5, mood: 0.8 };

    const alice = new MeshAdapter({
      nodeName: 'xmesh-relay-alice-' + process.pid,
      group,
      fieldWeights: weights,
      relay: RELAY_URL,
      relayToken: RELAY_TOKEN,
      cognitiveProfile: 'xmesh-agent relay smoke — alice',
    });
    const bob = new MeshAdapter({
      nodeName: 'xmesh-relay-bob-' + process.pid,
      group,
      fieldWeights: weights,
      relay: RELAY_URL,
      relayToken: RELAY_TOKEN,
      cognitiveProfile: 'xmesh-agent relay smoke — bob',
    });

    try {
      await alice.start();
      await bob.start();

      const received = [];
      bob.onCmbAccepted((cmb) => received.push(cmb));

      const discoveryDeadline = Date.now() + 30_000;
      while (Date.now() < discoveryDeadline) {
        if (alice.peers().some((p) => p.name === bob.identity.name)
          && bob.peers().some((p) => p.name === alice.identity.name)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      assert.ok(
        alice.peers().some((p) => p.name === bob.identity.name),
        'alice did not discover bob via relay within 30s — relay reachability or token issue',
      );

      await alice.observe({
        fields: {
          focus: { text: 'relay smoke CMB from alice' },
          intent: { text: 'verify WAN duplex via ' + RELAY_URL },
        },
      });

      const receiveDeadline = Date.now() + 20_000;
      while (Date.now() < receiveDeadline && received.length === 0) {
        await new Promise((r) => setTimeout(r, 250));
      }

      assert.ok(received.length >= 1, 'bob did not receive via relay within 20s');
      assert.equal(received[0].createdBy, alice.identity.name);
      assert.equal(received[0].fields.focus.text, 'relay smoke CMB from alice');
      process.stderr.write(
        `[relay-smoke] ok — relay=${RELAY_URL} group=${group} received=${received.length}\n`,
      );
    } finally {
      try { await alice.stop(); } catch { /* ignore */ }
      try { await bob.stop(); } catch { /* ignore */ }
    }
  },
);
