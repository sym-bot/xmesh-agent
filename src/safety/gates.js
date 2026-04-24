'use strict';

// Approval gates — runtime doc §5.4.

const DEFAULT_GATE_PATTERNS = Object.freeze({
  intent: [
    /\bgit\s+push\b/i,
    /\bcommit\s+to\s+main\b/i,
    /\bdeploy\b/i,
    /\bpublish\b/i,
    /\brm\s+-rf\b/i,
  ],
  commitment: [
    /\.env\b/i,
    /\bsecrets?\b/i,
    /\bproduction\s+config\b/i,
  ],
});

function checkGates(cmb, patterns = DEFAULT_GATE_PATTERNS) {
  const hits = [];
  for (const [field, patternList] of Object.entries(patterns)) {
    const text = cmb?.fields?.[field]?.text;
    if (!text) continue;
    for (const p of patternList) {
      if (p.test(text)) hits.push({ field, pattern: p.source });
    }
  }
  return { passed: hits.length === 0, hits };
}

module.exports = { checkGates, DEFAULT_GATE_PATTERNS };
