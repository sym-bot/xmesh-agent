'use strict';

// Live smoke test — real SymNode + real Bonjour. Excluded from `npm test`
// via filename (smoke.js not *.test.js). Run with `npm run smoke`.
//
// Requires: nothing external (pure LAN Bonjour, no Anthropic key).
// Verifies that two xmesh-agent peers can start, discover each other via
// Bonjour, exchange a CAT7 CMB, and shut down cleanly.

const test = require('node:test');
const assert = require('node:assert/strict');
const { MeshAdapter } = require('../src/mesh/node.js');

function uniqueGroup() {
  return 'xmesh-smoke-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

test('live smoke: two SymNode peers discover via Bonjour and exchange a CMB', { timeout: 30_000 }, async () => {
  const group = uniqueGroup();
  const weights = { focus: 2.0, issue: 1.5, intent: 1.5, motivation: 1.0, commitment: 1.5, perspective: 0.5, mood: 0.8 };

  const alice = new MeshAdapter({
    nodeName: 'xmesh-smoke-alice-' + process.pid,
    group,
    fieldWeights: weights,
    cognitiveProfile: 'xmesh-agent smoke test peer — alice',
  });
  const bob = new MeshAdapter({
    nodeName: 'xmesh-smoke-bob-' + process.pid,
    group,
    fieldWeights: weights,
    cognitiveProfile: 'xmesh-agent smoke test peer — bob',
  });

  try {
    await alice.start();
    await bob.start();

    const received = [];
    bob.onCmbAccepted((cmb) => { received.push(cmb); });

    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      if (alice.peers().some((p) => p.name === bob.identity.name)
        && bob.peers().some((p) => p.name === alice.identity.name)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(
      alice.peers().some((p) => p.name === bob.identity.name),
      'alice did not discover bob via Bonjour within 25s',
    );

    await alice.observe({
      fields: {
        focus: { text: 'smoke test CMB from alice' },
        intent: { text: 'verify duplex via Bonjour' },
      },
    });

    const receiveDeadline = Date.now() + 15_000;
    while (Date.now() < receiveDeadline && received.length === 0) {
      await new Promise((r) => setTimeout(r, 100));
    }

    assert.equal(received.length >= 1, true, 'bob did not receive alice\'s CMB within 5s');
    assert.equal(received[0].createdBy, alice.identity.name, 'createdBy should be the originator (alice)');
    assert.ok(received[0].source.includes(alice.identity.name), 'source should reference alice (remix notation expected)');
    assert.equal(received[0].fields.focus.text, 'smoke test CMB from alice');
  } finally {
    try { await alice.stop(); } catch {}
    try { await bob.stop(); } catch {}
  }
});
