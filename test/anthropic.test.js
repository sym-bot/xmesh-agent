'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AnthropicAdapter, estimateCostUsd, priceFor } = require('../src/model/anthropic.js');

function fakeClient({ response, onRequest }) {
  return {
    messages: {
      create: async (params) => {
        if (onRequest) onRequest(params);
        return response;
      },
    },
  };
}

test('priceFor: exact model matches known pricing', () => {
  const p = priceFor('claude-opus-4-7');
  assert.equal(p.input, 15.0);
  assert.equal(p.output, 75.0);
});

test('priceFor: sonnet matches sonnet pricing', () => {
  const p = priceFor('claude-sonnet-4-6');
  assert.equal(p.input, 3.0);
});

test('estimateCostUsd: correct arithmetic for a mixed call', () => {
  const cost = estimateCostUsd('claude-opus-4-7', { inputTokens: 1000, outputTokens: 500 });
  const expected = (1000 / 1_000_000) * 15.0 + (500 / 1_000_000) * 75.0;
  assert.ok(Math.abs(cost - expected) < 1e-9);
});

test('AnthropicAdapter: throws without API key', () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.throws(() => new AnthropicAdapter({}), /requires apiKey/);
  if (prev) process.env.ANTHROPIC_API_KEY = prev;
});

test('AnthropicAdapter: reads API key from env when not passed', () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-env-key';
  const a = new AnthropicAdapter({});
  assert.equal(a.apiKey, 'sk-env-key');
  if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = prev;
});

test('AnthropicAdapter: call rejects empty messages', async () => {
  const a = new AnthropicAdapter({ apiKey: 'x' });
  await assert.rejects(a.call({ messages: [] }), /non-empty array/);
});

test('AnthropicAdapter: call passes systemPrompt and forwards messages', async () => {
  let captured = null;
  const client = fakeClient({
    onRequest: (p) => { captured = p; },
    response: {
      content: [{ type: 'text', text: 'ack' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn',
    },
  });
  const a = new AnthropicAdapter({
    apiKey: 'x',
    model: 'claude-opus-4-7',
    _clientFactory: () => client,
  });
  const out = await a.call({
    systemPrompt: 'You are a reviewer',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 256,
  });
  assert.equal(captured.system, 'You are a reviewer');
  assert.equal(captured.max_tokens, 256);
  assert.equal(captured.messages[0].content, 'hi');
  assert.equal(out.text, 'ack');
  assert.equal(out.usage.inputTokens, 10);
  assert.equal(out.usage.outputTokens, 5);
  assert.ok(out.usage.costUsd > 0);
  assert.equal(out.stopReason, 'end_turn');
});

test('AnthropicAdapter: call surfaces tool_use blocks as toolCalls', async () => {
  const client = fakeClient({
    response: {
      content: [
        { type: 'text', text: 'I will use a tool.' },
        { type: 'tool_use', id: 'toolu_1', name: 'emit_cmb', input: { focus: { text: 'hi' } } },
      ],
      usage: { input_tokens: 20, output_tokens: 30 },
      stop_reason: 'tool_use',
    },
  });
  const a = new AnthropicAdapter({
    apiKey: 'x',
    _clientFactory: () => client,
  });
  const out = await a.call({ messages: [{ role: 'user', content: 'do it' }] });
  assert.equal(out.text, 'I will use a tool.');
  assert.equal(out.toolCalls.length, 1);
  assert.equal(out.toolCalls[0].name, 'emit_cmb');
  assert.deepEqual(out.toolCalls[0].input, { focus: { text: 'hi' } });
});

test('AnthropicAdapter: call forwards tools param when provided', async () => {
  let captured = null;
  const client = fakeClient({
    onRequest: (p) => { captured = p; },
    response: { content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 1, output_tokens: 1 } },
  });
  const tools = [{ name: 'emit_cmb', description: 'emit a CAT7 CMB', input_schema: { type: 'object' } }];
  const a = new AnthropicAdapter({ apiKey: 'x', _clientFactory: () => client });
  await a.call({ messages: [{ role: 'user', content: 'go' }], tools });
  assert.deepEqual(captured.tools, tools);
});

test('AnthropicAdapter: missing usage in response yields zero token counts', async () => {
  const client = fakeClient({
    response: { content: [{ type: 'text', text: 'ok' }] },
  });
  const a = new AnthropicAdapter({ apiKey: 'x', _clientFactory: () => client });
  const out = await a.call({ messages: [{ role: 'user', content: 'go' }] });
  assert.equal(out.usage.inputTokens, 0);
  assert.equal(out.usage.outputTokens, 0);
  assert.equal(out.usage.costUsd, 0);
});
