'use strict';

const { ModelAdapter } = require('./adapter.js');

const MODEL_PRICING_USD_PER_MTOKEN = Object.freeze({
  'gpt-5': { input: 10.0, output: 40.0 },
  'gpt-5-mini': { input: 1.0, output: 4.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'o1': { input: 15.0, output: 60.0 },
});

function priceFor(model) {
  if (MODEL_PRICING_USD_PER_MTOKEN[model]) return MODEL_PRICING_USD_PER_MTOKEN[model];
  const prefixes = Object.keys(MODEL_PRICING_USD_PER_MTOKEN).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (model.startsWith(prefix)) return MODEL_PRICING_USD_PER_MTOKEN[prefix];
  }
  return { input: 10.0, output: 40.0 };
}

function estimateCostUsd(model, usage) {
  const p = priceFor(model);
  return (usage.inputTokens / 1_000_000) * p.input + (usage.outputTokens / 1_000_000) * p.output;
}

function defaultClientFactory({ apiKey }) {
  const OpenAI = require('openai');
  return new OpenAI.default({ apiKey });
}

function toOpenAiTool(xmeshTool) {
  return {
    type: 'function',
    function: {
      name: xmeshTool.name,
      description: xmeshTool.description,
      parameters: xmeshTool.input_schema,
    },
  };
}

class OpenAiAdapter extends ModelAdapter {
  constructor({ apiKey, model = 'gpt-4o', _clientFactory } = {}) {
    super();
    this.apiKey = apiKey || process.env.OPENAI_API_KEY;
    if (!this.apiKey) throw new Error('OpenAiAdapter requires apiKey or OPENAI_API_KEY');
    this.model = model;
    this._clientFactory = _clientFactory || defaultClientFactory;
    this._client = null;
  }

  _ensureClient() {
    if (!this._client) this._client = this._clientFactory({ apiKey: this.apiKey });
    return this._client;
  }

  async call({ systemPrompt, messages, maxTokens = 1024, tools }) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('OpenAiAdapter.call: messages must be a non-empty array');
    }
    const client = this._ensureClient();
    const chatMessages = [];
    if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt });
    for (const m of messages) chatMessages.push({ role: m.role, content: m.content });

    const params = {
      model: this.model,
      messages: chatMessages,
      max_tokens: maxTokens,
    };
    if (Array.isArray(tools) && tools.length > 0) {
      params.tools = tools.map(toOpenAiTool);
      params.tool_choice = 'auto';
    }

    const response = await client.chat.completions.create(params);
    return this._normalize(response);
  }

  _normalize(response) {
    const choice = response.choices?.[0];
    const message = choice?.message || {};
    const text = message.content || '';
    const toolCalls = [];
    for (const tc of message.tool_calls || []) {
      let parsed = {};
      try { parsed = JSON.parse(tc.function?.arguments || '{}'); }
      catch { parsed = {}; }
      toolCalls.push({ id: tc.id, name: tc.function?.name, input: parsed });
    }
    const usage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
    usage.costUsd = estimateCostUsd(this.model, usage);
    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      stopReason: choice?.finish_reason || null,
      raw: response,
    };
  }
}

module.exports = { OpenAiAdapter, estimateCostUsd, priceFor, MODEL_PRICING_USD_PER_MTOKEN, toOpenAiTool };
