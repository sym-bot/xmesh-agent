'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OpenAiAdapter, estimateCostUsd, priceFor, toOpenAiTool } = require('../src/model/openai.js');

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

test('priceFor: exact model matches known pricing', () => {
  const p = priceFor('gpt-4o');
  assert.equal(p.input, 2.5);
  assert.equal(p.output, 10.0);
});

test('priceFor: prefix fallback for gpt-4o-mini variant', () => {
  const p = priceFor('gpt-4o-mini-2024-07-18');
  assert.equal(p.input, 0.15);
});

test('estimateCostUsd: correct arithmetic', () => {
  const cost = estimateCostUsd('gpt-4o', { inputTokens: 1000, outputTokens: 500 });
  const expected = (1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10.0;
  assert.ok(Math.abs(cost - expected) < 1e-9);
});

test('toOpenAiTool: wraps xmesh tool schema in OpenAI function-tool format', () => {
  const xmeshTool = {
    name: 'emit_cmb',
    description: 'Emit a CAT7 CMB',
    input_schema: { type: 'object', properties: { focus: { type: 'string' } } },
  };
  const converted = toOpenAiTool(xmeshTool);
  assert.equal(converted.type, 'function');
  assert.equal(converted.function.name, 'emit_cmb');
  assert.deepEqual(converted.function.parameters, xmeshTool.input_schema);
});

test('OpenAiAdapter: throws without API key', () => {
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  assert.throws(() => new OpenAiAdapter({}), /requires apiKey/);
  if (prev) process.env.OPENAI_API_KEY = prev;
});

test('OpenAiAdapter: reads OPENAI_API_KEY env var', () => {
  const prev = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-openai-env';
  const a = new OpenAiAdapter({});
  assert.equal(a.apiKey, 'sk-openai-env');
  if (prev === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = prev;
});

test('OpenAiAdapter: call rejects empty messages', async () => {
  const a = new OpenAiAdapter({ apiKey: 'x' });
  await assert.rejects(a.call({ messages: [] }), /non-empty array/);
});

test('OpenAiAdapter: systemPrompt is prepended as system message', async () => {
  let captured = null;
  const client = fakeClient({
    onRequest: (p) => { captured = p; },
    response: {
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    },
  });
  const a = new OpenAiAdapter({ apiKey: 'x', _clientFactory: () => client });
  await a.call({
    systemPrompt: 'You are a reviewer',
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(captured.messages[0].role, 'system');
  assert.equal(captured.messages[0].content, 'You are a reviewer');
  assert.equal(captured.messages[1].role, 'user');
});

test('OpenAiAdapter: tool_calls parsed from function-call arguments', async () => {
  const client = fakeClient({
    response: {
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: 'call_abc',
            function: { name: 'emit_cmb', arguments: JSON.stringify({ focus: 'x', issue: 'y' }) },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    },
  });
  const a = new OpenAiAdapter({ apiKey: 'x', _clientFactory: () => client });
  const out = await a.call({ messages: [{ role: 'user', content: 'go' }] });
  assert.equal(out.toolCalls.length, 1);
  assert.equal(out.toolCalls[0].name, 'emit_cmb');
  assert.equal(out.toolCalls[0].input.focus, 'x');
  assert.equal(out.toolCalls[0].input.issue, 'y');
  assert.equal(out.stopReason, 'tool_calls');
});

test('OpenAiAdapter: malformed tool arguments fall back to empty input', async () => {
  const client = fakeClient({
    response: {
      choices: [{
        message: {
          content: null,
          tool_calls: [{ id: 'x', function: { name: 'emit_cmb', arguments: 'not-json' } }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    },
  });
  const a = new OpenAiAdapter({ apiKey: 'x', _clientFactory: () => client });
  const out = await a.call({ messages: [{ role: 'user', content: 'go' }] });
  assert.deepEqual(out.toolCalls[0].input, {});
});

test('OpenAiAdapter: tools forwarded in OpenAI function format', async () => {
  let captured = null;
  const client = fakeClient({
    onRequest: (p) => { captured = p; },
    response: {
      choices: [{ message: { content: '' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    },
  });
  const a = new OpenAiAdapter({ apiKey: 'x', _clientFactory: () => client });
  const tools = [{ name: 'emit_cmb', description: 'x', input_schema: { type: 'object' } }];
  await a.call({ messages: [{ role: 'user', content: 'go' }], tools });
  assert.equal(captured.tools.length, 1);
  assert.equal(captured.tools[0].type, 'function');
  assert.equal(captured.tools[0].function.name, 'emit_cmb');
  assert.equal(captured.tool_choice, 'auto');
});

test('OpenAiAdapter: usage missing yields zero counts', async () => {
  const client = fakeClient({
    response: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] },
  });
  const a = new OpenAiAdapter({ apiKey: 'x', _clientFactory: () => client });
  const out = await a.call({ messages: [{ role: 'user', content: 'go' }] });
  assert.equal(out.usage.inputTokens, 0);
  assert.equal(out.usage.costUsd, 0);
});
