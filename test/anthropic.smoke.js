'use strict';

// Live Anthropic smoke test — real API call. Skipped if ANTHROPIC_API_KEY
// is not set. Run via `npm run smoke`.

const test = require('node:test');
const assert = require('node:assert/strict');
const { AnthropicAdapter } = require('../src/model/anthropic.js');
const { EMIT_CMB_TOOL } = require('../src/core/loop.js');

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

test(
  'live smoke: Anthropic adapter issues real API call and surfaces emit_cmb tool_use',
  { skip: !hasKey, timeout: 60_000 },
  async () => {
    const adapter = new AnthropicAdapter({ model: 'claude-haiku-4-5-20251001' });
    const response = await adapter.call({
      systemPrompt: 'You are a reviewer on the xmesh mesh. Always respond by emitting a CAT7 CMB via the emit_cmb tool.',
      messages: [{
        role: 'user',
        content: 'Admitted CMB from writer-01: focus="add rate limiting on /api/login". Respond with issue + commitment fields via emit_cmb.',
      }],
      maxTokens: 400,
      tools: [EMIT_CMB_TOOL],
    });

    assert.ok(response.text !== undefined, 'response has text field');
    assert.ok(response.usage.inputTokens > 0, 'input tokens reported');
    assert.ok(response.usage.outputTokens > 0, 'output tokens reported');
    assert.ok(response.usage.costUsd > 0, 'cost estimated');
    assert.ok(
      Array.isArray(response.toolCalls) && response.toolCalls.length >= 1,
      `model emitted at least one tool_use (got ${response.toolCalls?.length ?? 0})`,
    );
    const emitCall = response.toolCalls.find((t) => t.name === 'emit_cmb');
    assert.ok(emitCall, 'model called emit_cmb specifically');
    assert.ok(typeof emitCall.input === 'object', 'emit_cmb input is an object');
    const populatedFields = Object.keys(emitCall.input).filter((k) => emitCall.input[k]);
    assert.ok(populatedFields.length >= 1, `emit_cmb populated at least one field (got: ${populatedFields.join(',')})`);
    process.stderr.write(
      `[anthropic-smoke] ok — tokens=${response.usage.inputTokens}/${response.usage.outputTokens} cost=$${response.usage.costUsd.toFixed(6)} fields=${populatedFields.join(',')}\n`,
    );
  },
);
