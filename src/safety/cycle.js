'use strict';

const DEFAULT_DEPTH = 5;

function detectCycle({ proposed, resolveAncestors, selfName, depth = DEFAULT_DEPTH }) {
  if (proposed?.fields?.commitment?.text) {
    return { suspect: false, reason: 'commitment-exception' };
  }
  if (!Array.isArray(proposed?.ancestors) || proposed.ancestors.length === 0) {
    return { suspect: false, reason: 'no-ancestors' };
  }

  const visited = new Set();
  const queue = proposed.ancestors.map((id) => ({ id, d: 1 }));
  while (queue.length > 0) {
    const { id, d } = queue.shift();
    if (d > depth) continue;
    if (visited.has(id)) continue;
    visited.add(id);
    const cmb = resolveAncestors(id);
    if (!cmb) continue;
    if (cmb.createdBy === selfName) {
      return { suspect: true, reason: 'self-ancestor', hitId: id, hitDepth: d };
    }
    if (Array.isArray(cmb.ancestors)) {
      for (const parent of cmb.ancestors) {
        queue.push({ id: parent, d: d + 1 });
      }
    }
  }
  return { suspect: false, reason: 'clean' };
}

module.exports = { detectCycle, DEFAULT_DEPTH };
