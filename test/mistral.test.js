'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MistralAdapter, estimateCostUsd, priceFor, toMistralTool, MISTRAL_BASE_URL } = require('../src/model/mistral.js');

function fakeClient({ response, onRequest }) {
  return {
    chat: {
      completions: {
        create: async (params) => {
          if (onRequest) onRequest(params);
          return response;
        },
      },
    },
  };
}

test('priceFor: exact known model returns its pricing', () => {
  const p = priceFor('mistral-small-latest');
  assert.equal(p.input, 0.1);
  assert.equal(p.output, 0.3);
});

test('priceFor: prefix fallback for versioned model', () => {
  const p = priceFor('mistral-large-2411');
  assert.equal(p.input, 2.0);
});

test('estimateCostUsd: arithmetic correct', () => {
  const c = estimateCostUsd('mistral-small-latest', { inputTokens: 1000, outputTokens: 500 });
  const expected = (1000 / 1_000_000) * 0.1 + (500 / 1_000_000) * 0.3;
  assert.ok(Math.abs(c - expected) < 1e-9);
});

test('toMistralTool: shape matches OpenAI function-tool format (Mistral is OpenAI-compatible)', () => {
  const xmeshTool = { name: 'emit_cmb', description: 'd', input_schema: { type: 'object' } };
  const out = toMistralTool(xmeshTool);
  assert.equal(out.type, 'function');
  assert.equal(out.function.name, 'emit_cmb');
});

test('MistralAdapter: throws without API key', () => {
  const prev = process.env.MISTRAL_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  assert.throws(() => new MistralAdapter({}), /requires apiKey/);
  if (prev) process.env.MISTRAL_API_KEY = prev;
});

test('MistralAdapter: reads MISTRAL_API_KEY env var', () => {
  const prev = process.env.MISTRAL_API_KEY;
  process.env.MISTRAL_API_KEY = 'env-key';
  const a = new MistralAdapter({});
  assert.equal(a.apiKey, 'env-key');
  if (prev === undefined) delete process.env.MISTRAL_API_KEY;
  else process.env.MISTRAL_API_KEY = prev;
});

test('MistralAdapter: defaults baseUrl to api.mistral.ai/v1', () => {
  const a = new MistralAdapter({ apiKey: 'x' });
  assert.equal(a.baseUrl, MISTRAL_BASE_URL);
});

test('MistralAdapter: rejects empty messages', async () => {
  const a = new MistralAdapter({ apiKey: 'x' });
  await assert.rejects(a.call({ messages: [] }), /non-empty array/);
});

test('MistralAdapter: passes systemPrompt as system message', async () => {
  let captured = null;
  const client = fakeClient({
    onRequest: (p) => { captured = p; },
    response: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 3 } },
  });
  const a = new MistralAdapter({ apiKey: 'x', _clientFactory: () => client });
  await a.call({ systemPrompt: 'You are a reviewer', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(captured.messages[0].role, 'system');
  assert.equal(captured.messages[0].content, 'You are a reviewer');
});

test('MistralAdapter: tool_calls parsed from string arguments', async () => {
  const client = fakeClient({
    response: {
      choices: [{
        message: {
          content: null,
          tool_calls: [{ id: 'c1', function: { name: 'emit_cmb', arguments: JSON.stringify({ focus: 'x' }) } }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    },
  });
  const a = new MistralAdapter({ apiKey: 'x', _clientFactory: () => client });
  const out = await a.call({ messages: [{ role: 'user', content: 'go' }] });
  assert.equal(out.toolCalls[0].name, 'emit_cmb');
  assert.equal(out.toolCalls[0].input.focus, 'x');
});

test('MistralAdapter: tool_calls also handle object arguments (Mistral sometimes returns parsed)', async () => {
  const client = fakeClient({
    response: {
      choices: [{
        message: {
          content: '',
          tool_calls: [{ id: 'c1', function: { name: 'emit_cmb', arguments: { issue: 'y' } } }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    },
  });
  const a = new MistralAdapter({ apiKey: 'x', _clientFactory: () => client });
  const out = await a.call({ messages: [{ role: 'user', content: 'go' }] });
  assert.equal(out.toolCalls[0].input.issue, 'y');
});

test('MistralAdapter: cost computed and reported', async () => {
  const client = fakeClient({
    response: {
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1000, completion_tokens: 500 },
    },
  });
  const a = new MistralAdapter({ apiKey: 'x', model: 'mistral-large-latest', _clientFactory: () => client });
  const out = await a.call({ messages: [{ role: 'user', content: 'go' }] });
  assert.ok(out.usage.costUsd > 0);
  assert.equal(out.usage.inputTokens, 1000);
});
