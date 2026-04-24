'use strict';

const ROLE_EXPECTATIONS = Object.freeze({
  writer:      { high: ['intent', 'focus'],      low: [] },
  reviewer:    { high: ['issue', 'commitment'],  low: [] },
  'test-writer': { high: ['commitment', 'issue'],  low: [] },
  spec: { high: ['intent', 'focus'], low: [] },
  'spec-drafter': { high: ['intent', 'focus'], low: [] },
  auditor:     { high: ['perspective', 'issue'], low: [] },
  generator:   { high: ['focus', 'intent'],      low: [] },
  mood:        { high: ['mood', 'perspective'],  low: [] },
});

const HIGH_THRESHOLD = 1.5;
const LOW_THRESHOLD = 0.75;

function checkRoleSanity({ role, weights }) {
  if (!role || !weights) return { ok: true, advisories: [] };
  const expectations = ROLE_EXPECTATIONS[role.toLowerCase()];
  if (!expectations) return { ok: true, advisories: [] };

  const advisories = [];
  for (const field of expectations.high) {
    const w = weights[field];
    if (w === undefined) continue;
    if (w < HIGH_THRESHOLD) {
      advisories.push({
        kind: 'low-weight-for-role',
        field,
        weight: w,
        expected: `>= ${HIGH_THRESHOLD}`,
        reason: `role "${role}" typically emphasises ${field} but α_f = ${w}`,
      });
    }
  }
  for (const field of expectations.low) {
    const w = weights[field];
    if (w === undefined) continue;
    if (w > LOW_THRESHOLD) {
      advisories.push({
        kind: 'high-weight-for-role',
        field,
        weight: w,
        expected: `<= ${LOW_THRESHOLD}`,
        reason: `role "${role}" typically de-emphasises ${field} but α_f = ${w}`,
      });
    }
  }
  return { ok: advisories.length === 0, advisories, knownRole: true };
}

module.exports = { checkRoleSanity, ROLE_EXPECTATIONS, HIGH_THRESHOLD, LOW_THRESHOLD };
