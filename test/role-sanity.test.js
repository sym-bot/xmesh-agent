'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkRoleSanity, ROLE_EXPECTATIONS } = require('../src/core/role-sanity.js');

test('checkRoleSanity: unknown role is silently ok', () => {
  const r = checkRoleSanity({ role: 'helpdesk', weights: { focus: 0.1 } });
  assert.equal(r.ok, true);
  assert.equal(r.advisories.length, 0);
  assert.equal(r.knownRole, undefined);
});

test('checkRoleSanity: reviewer with high issue + commitment passes', () => {
  const r = checkRoleSanity({
    role: 'reviewer',
    weights: { issue: 2.5, commitment: 2.0, focus: 1.0, intent: 1.0, motivation: 1.0, perspective: 0.5, mood: 0.8 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.knownRole, true);
});

test('checkRoleSanity: reviewer with low issue flags advisory', () => {
  const r = checkRoleSanity({
    role: 'reviewer',
    weights: { issue: 0.5, commitment: 2.0 },
  });
  assert.equal(r.ok, false);
  assert.equal(r.advisories.length, 1);
  assert.equal(r.advisories[0].field, 'issue');
  assert.equal(r.advisories[0].weight, 0.5);
  assert.match(r.advisories[0].reason, /reviewer.*issue/);
});

test('checkRoleSanity: writer needs high intent + focus', () => {
  const r = checkRoleSanity({
    role: 'writer',
    weights: { intent: 0.9, focus: 0.9 },
  });
  assert.equal(r.ok, false);
  assert.equal(r.advisories.length, 2);
});

test('checkRoleSanity: test-writer emphasises commitment + issue', () => {
  const rOk = checkRoleSanity({
    role: 'test-writer',
    weights: { commitment: 2.5, issue: 2.0 },
  });
  assert.equal(rOk.ok, true);
  const rBad = checkRoleSanity({
    role: 'test-writer',
    weights: { commitment: 0.5, issue: 0.5 },
  });
  assert.equal(rBad.ok, false);
  assert.equal(rBad.advisories.length, 2);
});

test('checkRoleSanity: role is case-insensitive', () => {
  const r = checkRoleSanity({
    role: 'REVIEWER',
    weights: { issue: 0.1 },
  });
  assert.equal(r.knownRole, true);
  assert.equal(r.ok, false);
});

test('checkRoleSanity: missing weight for expected field does not throw', () => {
  const r = checkRoleSanity({
    role: 'reviewer',
    weights: { commitment: 2.0 },
  });
  assert.equal(r.ok, true, 'only commitment given — no advisory because issue is undefined, not low');
});

test('checkRoleSanity: missing role returns ok', () => {
  const r = checkRoleSanity({ role: null, weights: {} });
  assert.equal(r.ok, true);
});

test('ROLE_EXPECTATIONS: every known role has at least one high field', () => {
  for (const [role, spec] of Object.entries(ROLE_EXPECTATIONS)) {
    assert.ok(spec.high.length >= 1, `${role} must emphasise at least one CAT7 field`);
  }
});

test('ROLE_EXPECTATIONS: high fields are valid CAT7 field names', () => {
  const CAT7 = ['focus', 'issue', 'intent', 'motivation', 'commitment', 'perspective', 'mood'];
  for (const [role, spec] of Object.entries(ROLE_EXPECTATIONS)) {
    for (const f of spec.high) {
      assert.ok(CAT7.includes(f), `${role}.high contains non-CAT7 field: ${f}`);
    }
    for (const f of spec.low) {
      assert.ok(CAT7.includes(f), `${role}.low contains non-CAT7 field: ${f}`);
    }
  }
});
