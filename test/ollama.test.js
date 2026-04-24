'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OllamaAdapter } = require('../src/model/ollama.js');

function fakeFetch({ status = 200, body, onRequest }) {
  return async (url, opts) => {
    if (onRequest) onRequest(url, opts);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
}

test('OllamaAdapter: defaults to localhost:11434 when no baseUrl passed', () => {
  const prev = process.env.OLLAMA_HOST;
  delete process.env.OLLAMA_HOST;
  const a = new OllamaAdapter({});
  assert.equal(a.baseUrl, 'http://localhost:11434');
  if (prev) process.env.OLLAMA_HOST = prev;
});

test('OllamaAdapter: honours OLLAMA_HOST env override', () => {
  const prev = process.env.OLLAMA_HOST;
  process.env.OLLAMA_HOST = 'http://gpu-box:11434';
  const a = new OllamaAdapter({});
  assert.equal(a.baseUrl, 'http://gpu-box:11434');
  if (prev === undefined) delete process.env.OLLAMA_HOST;
  else process.env.OLLAMA_HOST = prev;
});

test('OllamaAdapter: trims trailing slash from baseUrl', () => {
  const a = new OllamaAdapter({ baseUrl: 'http://localhost:11434/' });
  assert.equal(a.baseUrl, 'http://localhost:11434');
});

test('OllamaAdapter: call rejects empty messages', async () => {
  const a = new OllamaAdapter({ _fetchImpl: fakeFetch({ body: {} }) });
  await assert.rejects(a.call({ messages: [] }), /non-empty array/);
});

test('OllamaAdapter: POSTs to /api/chat with messages + systemPrompt', async () => {
  let captured = null;
  const fetchImpl = fakeFetch({
    onRequest: (url, opts) => { captured = { url, body: JSON.parse(opts.body) }; },
    body: { message: { content: 'ok' }, done_reason: 'stop', prompt_eval_count: 5, eval_count: 3 },
  });
  const a = new OllamaAdapter({ baseUrl: 'http://x:11434', _fetchImpl: fetchImpl });
  await a.call({
    systemPrompt: 'You are a reviewer',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 300,
  });
  assert.equal(captured.url, 'http://x:11434/api/chat');
  assert.equal(captured.body.messages[0].role, 'system');
  assert.equal(captured.body.messages[1].content, 'hi');
  assert.equal(captured.body.options.num_predict, 300);
  assert.equal(captured.body.stream, false);
});

test('OllamaAdapter: tool_calls parsed from message.tool_calls', async () => {
  const fetchImpl = fakeFetch({
    body: {
      message: {
        content: '',
        tool_calls: [{
          function: { name: 'emit_cmb', arguments: { focus: 'x', issue: 'y' } },
        }],
      },
      done: true,
    },
  });
  const a = new OllamaAdapter({ _fetchImpl: fetchImpl });
  const out = await a.call({ messages: [{ role: 'user', content: 'go' }] });
  assert.equal(out.toolCalls.length, 1);
  assert.equal(out.toolCalls[0].name, 'emit_cmb');
  assert.equal(out.toolCalls[0].input.focus, 'x');
});

test('OllamaAdapter: cost always zero (local inference)', async () => {
  const fetchImpl = fakeFetch({
    body: { message: { content: 'ok' }, prompt_eval_count: 1000, eval_count: 500 },
  });
  const a = new OllamaAdapter({ _fetchImpl: fetchImpl });
  const out = await a.call({ messages: [{ role: 'user', content: 'go' }] });
  assert.equal(out.usage.costUsd, 0);
  assert.equal(out.usage.inputTokens, 1000);
  assert.equal(out.usage.outputTokens, 500);
});

test('OllamaAdapter: non-2xx response throws with body snippet', async () => {
  const fetchImpl = fakeFetch({ status: 500, body: { error: 'model not found' } });
  const a = new OllamaAdapter({ _fetchImpl: fetchImpl });
  await assert.rejects(
    a.call({ messages: [{ role: 'user', content: 'go' }] }),
    /Ollama 500/,
  );
});

test('OllamaAdapter: tools translated to OpenAI-style function format', async () => {
  let captured = null;
  const fetchImpl = fakeFetch({
    onRequest: (url, opts) => { captured = JSON.parse(opts.body); },
    body: { message: { content: '' } },
  });
  const a = new OllamaAdapter({ _fetchImpl: fetchImpl });
  await a.call({
    messages: [{ role: 'user', content: 'go' }],
    tools: [{ name: 'emit_cmb', description: 'x', input_schema: { type: 'object' } }],
  });
  assert.equal(captured.tools[0].type, 'function');
  assert.equal(captured.tools[0].function.name, 'emit_cmb');
});
